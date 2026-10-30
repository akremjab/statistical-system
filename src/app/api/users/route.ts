
import "server-only";

import { NextResponse } from "next/server";
import bcrypt from "bcrypt";

import pool from "@/lib/db";
import { getCurrentSession } from "@/lib/current-session";
import { hasPermission } from "@/lib/permissions";
import { validateNewPassword } from "@/lib/password-policy";

export const runtime = "nodejs";

type CreateUserBody = {
    fullName?: unknown;
    username?: unknown;
    password?: unknown;
};

export async function POST(request: Request) {
    // التحقق من مصدر الطلب
    const origin = request.headers.get("origin");

    const allowedOrigins = new Set(
        (process.env.AUTH_ALLOWED_ORIGINS ?? "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
    );

    if (!origin || !allowedOrigins.has(origin)) {
        return NextResponse.json(
            { success: false, error: "طلب غير مسموح به." },
            { status: 403 }
        );
    }

    let client;
    let transactionStarted = false;
    let discardConnection = false;
    let commitOutcomeUnknown = false;

    try {
        // التحقق من الجلسة
        const session = await getCurrentSession();

        if (!session) {
            return NextResponse.json(
                { success: false, error: "يجب تسجيل الدخول أولًا." },
                { status: 401 }
            );
        }

        if (session.mustChangePassword) {
            return NextResponse.json(
                {
                    success: false,
                    error: "يجب تغيير كلمة المرور قبل المتابعة.",
                },
                { status: 403 }
            );
        }

        // التحقق من صلاحية إنشاء المستخدمين
        const allowed = await hasPermission("users.create");

        if (!allowed) {
            return NextResponse.json(
                {
                    success: false,
                    error: "ليس لديك صلاحية إضافة مستخدمين.",
                },
                { status: 403 }
            );
        }

        // قبول JSON فقط
        const contentType = request.headers.get("content-type") ?? "";

        if (!contentType.toLowerCase().startsWith("application/json")) {
            return NextResponse.json(
                { success: false, error: "نوع الطلب غير مدعوم." },
                { status: 415 }
            );
        }

        // تحديد حجم بيانات الطلب
        const contentLength = request.headers.get("content-length");

        if (
            contentLength !== null &&
            (
                !Number.isSafeInteger(Number(contentLength)) ||
                Number(contentLength) < 0 ||
                Number(contentLength) > 8192
            )
        ) {
            return NextResponse.json(
                { success: false, error: "حجم الطلب غير صالح." },
                { status: 413 }
            );
        }

        let body: CreateUserBody;

        try {
            const MAX_REQUEST_BYTES = 8192;

            const reader = request.body?.getReader();

            if (!reader) {
                return NextResponse.json(
                    { success: false, error: "الطلب لا يحتوي على بيانات." },
                    { status: 400 }
                );
            }

            const chunks: Uint8Array[] = [];
            let receivedBytes = 0;
            let requestTooLarge = false;

            try {
                while (true) {
                    const { done, value } = await reader.read();

                    if (done) break;

                    receivedBytes += value.byteLength;

                    if (receivedBytes > MAX_REQUEST_BYTES) {
                        requestTooLarge = true;
                        await reader.cancel();
                        break;
                    }

                    chunks.push(value);
                }
            } finally {
                reader.releaseLock();
            }

            if (requestTooLarge) {
                return NextResponse.json(
                    {
                        success: false,
                        error: "حجم الطلب يتجاوز الحد المسموح.",
                    },
                    { status: 413 }
                );
            }

            const rawBody = Buffer.concat(
                chunks.map((chunk) => Buffer.from(chunk))
            ).toString("utf8");

            if (Buffer.byteLength(rawBody, "utf8") > 8192) {
                return NextResponse.json(
                    { success: false, error: "حجم الطلب يتجاوز الحد المسموح." },
                    { status: 413 }
                );
            }

            const parsed: unknown = JSON.parse(rawBody);

            if (
                typeof parsed !== "object" ||
                parsed === null ||
                Array.isArray(parsed)
            ) {
                return NextResponse.json(
                    { success: false, error: "بيانات الطلب غير صالحة." },
                    { status: 400 }
                );
            }

            body = parsed as CreateUserBody;
        } catch {
            return NextResponse.json(
                { success: false, error: "تعذر قراءة بيانات الطلب." },
                { status: 400 }
            );
        }

        // التحقق من بيانات الحساب
        if (
            typeof body.fullName !== "string" ||
            typeof body.username !== "string"
        ) {
            return NextResponse.json(
                { success: false, error: "بيانات المستخدم غير مكتملة." },
                { status: 400 }
            );
        }

        const fullName = body.fullName.trim();
        const username = body.username.trim();

        if (!fullName || fullName.length > 255) {
            return NextResponse.json(
                { success: false, error: "الاسم الكامل غير صالح." },
                { status: 400 }
            );
        }

        if (
            !/^[a-zA-Z0-9._-]{3,100}$/.test(username)
        ) {
            return NextResponse.json(
                {
                    success: false,
                    error:
                        "اسم المستخدم يجب أن يتكون من 3 إلى 100 حرف إنجليزي أو رقم أو نقطة أو شرطة.",
                },
                { status: 400 }
            );
        }

        const passwordError = validateNewPassword(body.password);

        if (passwordError) {
            return NextResponse.json(
                { success: false, error: passwordError },
                { status: 400 }
            );
        }

        const password = body.password as string;

        // إنشاء بصمة كلمة المرور، وعدم تخزين النص الأصلي
        const passwordHash = await bcrypt.hash(password, 12);

        client = await pool.connect();

        await client.query("BEGIN");
        transactionStarted = true;

        // إعادة التحقق من صلاحية المسؤول داخل المعاملة
        // وقفل حسابه أثناء عملية الإنشاء
        const actorResult = await client.query<{
            id: number;
            username: string;
        }>(
            `
            SELECT u.id, u.username
            FROM public.users AS u
            WHERE u.id = $1
              AND u.is_active = TRUE
              AND u.must_change_password = FALSE
              AND EXISTS (
                  SELECT 1
                  FROM public.user_permissions AS up
                  INNER JOIN public.permissions AS p
                      ON p.id = up.permission_id
                  WHERE up.user_id = u.id
                    AND p.code = 'users.create'
              )
            FOR UPDATE OF u
            `,
            [session.userId]
        );

        const actor = actorResult.rows[0];

        if (!actor) {
            await client.query("ROLLBACK");
            transactionStarted = false;

            return NextResponse.json(
                {
                    success: false,
                    error: "لم يعد الحساب مخولًا لتنفيذ العملية.",
                },
                { status: 403 }
            );
        }

        // إنشاء الحساب دون منحه أي صلاحيات تلقائيًا
        const insertResult = await client.query<{
            id: number;
        }>(
            `
            INSERT INTO public.users (
                username,
                full_name,
                password_hash,
                is_active,
                must_change_password
            )
            VALUES ($1, $2, $3, TRUE, TRUE)
            RETURNING id
            `,
            [username, fullName, passwordHash]
        );

        const newUserId = insertResult.rows[0].id;

        // تسجيل عملية الإنشاء دون كلمات مرور أو بصمات
        await client.query(
            `
            INSERT INTO public.audit_logs (
                user_id,
                actor_username,
                action,
                entity_type,
                entity_id,
                new_values,
                success
            )
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, TRUE)
            `,
            [
                actor.id,
                actor.username,
                "users.created",
                "users",
                String(newUserId),
                JSON.stringify({
                    id: newUserId,
                    username,
                    full_name: fullName,
                    is_active: true,
                    must_change_password: true,
                }),
            ]
        );

        try {
            await client.query("COMMIT");
            transactionStarted = false;
        } catch (commitError) {
            discardConnection = true;
            commitOutcomeUnknown = true;
            throw commitError;
        }

        return NextResponse.json(
            {
                success: true,
                message: "تم إنشاء المستخدم بنجاح.",
                userId: newUserId,
            },
            { status: 201 }
        );
    } catch (error) {
        if (client && transactionStarted && !commitOutcomeUnknown) {
            try {
                await client.query("ROLLBACK");
            } catch (rollbackError) {
                const rollbackErrorCode =
                    typeof rollbackError === "object" &&
                        rollbackError !== null &&
                        "code" in rollbackError &&
                        typeof rollbackError.code === "string"
                        ? rollbackError.code
                        : "UNKNOWN";

                console.error("Create user rollback failed:", {
                    code: rollbackErrorCode,
                    operation: "users.create.rollback",
                });

                // منع إعادة استخدام اتصال قد تكون حالته غير سليمة
                discardConnection = true;
            }
        }
        // تعذر التأكد من نتيجة الحفظ بعد محاولة COMMIT
        if (commitOutcomeUnknown) {
            return NextResponse.json(
                {
                    success: false,
                    error:
                        "تعذر التأكد من نتيجة إنشاء المستخدم. " +
                        "يرجى مراجعة قائمة المستخدمين قبل إعادة المحاولة.",
                },
                { status: 503 }
            );
        }
        // معالجة تكرار اسم المستخدم
        if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "23505" &&
            "constraint" in error &&
            (
                error.constraint === "users_username_lower_unique" ||
                error.constraint === "users_username_key"
            )
        ) {
            return NextResponse.json(
                {
                    success: false,
                    error: "اسم المستخدم موجود مسبقًا. يرجى اختيار اسم آخر.",
                },
                { status: 409 }
            );
        }

        const errorCode =
            typeof error === "object" &&
                error !== null &&
                "code" in error &&
                typeof error.code === "string"
                ? error.code
                : "UNKNOWN";

        console.error("Create user API failed:", {
            code: errorCode,
            operation: "users.create",
        });

        return NextResponse.json(
            {
                success: false,
                error: "تعذر إنشاء المستخدم حاليًا.",
            },
            { status: 500 }
        );
    } finally {
        client?.release(discardConnection);
    }
}
