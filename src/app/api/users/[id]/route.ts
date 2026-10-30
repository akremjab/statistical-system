
import "server-only";
import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import pool from "@/lib/db";
import { getCurrentSession } from "@/lib/current-session";
import { hasPermission } from "@/lib/permissions";
export const runtime = "nodejs";
type RouteContext = {
    params: Promise<{ id: string }>;
};
type EditUserBody = {
    fullName?: unknown;
    username?: unknown;
};
type UserRecord = {
    id: string;
    username: string;
    full_name: string;
};
type ActorRecord = {
    id: string;
    username: string;
};
function respond(error: string, status: number) {
    return NextResponse.json({ success: false, error }, { status });
}
function getErrorCode(error: unknown): string {
    if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string"
    ) {
        return error.code;
    }
    return "UNKNOWN";
}
export async function PATCH(request: Request, context: RouteContext) {
    const origin = request.headers.get("origin");
    const allowedOrigins = new Set(
        (process.env.AUTH_ALLOWED_ORIGINS ?? "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
    );
    if (!origin || !allowedOrigins.has(origin)) {
        return respond("طلب غير مسموح به.", 403);
    }
    let client: PoolClient | undefined;
    let transactionStarted = false;
    let discardConnection = false;
    let commitOutcomeUnknown = false;
    try {
        const session = await getCurrentSession();
        if (!session) {
            return respond("يجب تسجيل الدخول أولًا.", 401);
        }
        if (session.mustChangePassword) {
            return respond("يجب تغيير كلمة المرور قبل المتابعة.", 403);
        }
        if (!(await hasPermission("users.edit"))) {
            return respond("ليس لديك صلاحية تعديل المستخدمين.", 403);
        }
        const { id } = await context.params;
        if (
            !/^[1-9][0-9]*$/.test(id) ||
            BigInt(id) > BigInt("9223372036854775807")
        ) {
            return respond("معرّف المستخدم غير صالح.", 400);
        }
        const contentType = request.headers.get("content-type") ?? "";
        if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
            return respond("نوع الطلب غير مدعوم.", 415);
        }
        const contentLength = request.headers.get("content-length");
        if (contentLength !== null) {
            const size = Number(contentLength);
            if (!Number.isSafeInteger(size) || size < 0 || size > 8192) {
                return respond("حجم الطلب غير صالح.", 413);
            }
        }
        const reader = request.body?.getReader();
        if (!reader) {
            return respond("الطلب لا يحتوي على بيانات.", 400);
        }
        const chunks: Uint8Array[] = [];
        let receivedBytes = 0;
        let tooLarge = false;
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                receivedBytes += value.byteLength;
                if (receivedBytes > 8192) {
                    tooLarge = true;
                    await reader.cancel();
                    break;
                }
                chunks.push(value);
            }
        } catch {
            return respond("تعذر قراءة بيانات الطلب.", 400);
        } finally {
            reader.releaseLock();
        }
        if (tooLarge) {
            return respond("حجم الطلب يتجاوز الحد المسموح.", 413);
        }
        let body: EditUserBody;
        try {
            const raw = Buffer.concat(
                chunks.map((chunk) => Buffer.from(chunk))
            ).toString("utf8");
            const parsed: unknown = JSON.parse(raw);
            if (
                typeof parsed !== "object" ||
                parsed === null ||
                Array.isArray(parsed)
            ) {
                return respond("بيانات الطلب غير صالحة.", 400);
            }
            body = parsed as EditUserBody;
        } catch {
            return respond("بيانات JSON غير صالحة.", 400);
        }
        if (
            typeof body.fullName !== "string" ||
            typeof body.username !== "string"
        ) {
            return respond("بيانات المستخدم غير مكتملة.", 400);
        }
        const fullName = body.fullName.trim();
        const username = body.username.trim();
        if (!fullName || fullName.length > 255) {
            return respond("الاسم الكامل غير صالح.", 400);
        }
        if (!/^[a-zA-Z0-9._-]{3,100}$/.test(username)) {
            return respond(
                "اسم المستخدم يجب أن يتكون من 3 إلى 100 حرف إنجليزي أو رقم أو نقطة أو شرطة.",
                400
            );
        }
        client = await pool.connect();
        await client.query("BEGIN");
        transactionStarted = true;
        const actorResult = await client.query<ActorRecord>(
            `SELECT u.id, u.username
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
                     AND p.code = 'users.edit'
               )
             FOR UPDATE OF u`,
            [session.userId]
        );
        const actor = actorResult.rows[0];
        if (!actor) {
            await client.query("ROLLBACK");
            transactionStarted = false;
            return respond("لم يعد الحساب مخولًا لتنفيذ العملية.", 403);
        }
        const targetResult = await client.query<UserRecord>(
            `SELECT id, username, full_name
             FROM public.users
             WHERE id = $1
             FOR UPDATE`,
            [id]
        );
        const target = targetResult.rows[0];
        if (!target) {
            await client.query("ROLLBACK");
            transactionStarted = false;
            return respond("المستخدم المطلوب غير موجود.", 404);
        }
        if (target.username === username && target.full_name === fullName) {
            await client.query("ROLLBACK");
            transactionStarted = false;
            return NextResponse.json({
                success: true,
                changed: false,
                message: "لم يتم إجراء أي تغييرات.",
                userId: id,
            });
        }
        await client.query(
            `UPDATE public.users
             SET username = $1,
                 full_name = $2,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [username, fullName, id]
        );
        await client.query(
            `INSERT INTO public.audit_logs (
                user_id,
                actor_username,
                action,
                entity_type,
                entity_id,
                old_values,
                new_values,
                success
            )
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, TRUE)`,
            [
                actor.id,
                actor.username,
                "users.updated",
                "users",
                id,
                JSON.stringify({
                    username: target.username,
                    full_name: target.full_name,
                }),
                JSON.stringify({
                    username,
                    full_name: fullName,
                }),
            ]
        );
        try {
            await client.query("COMMIT");
            transactionStarted = false;
        } catch (error) {
            discardConnection = true;
            commitOutcomeUnknown = true;
            throw error;
        }
        return NextResponse.json({
            success: true,
            changed: true,
            message: "تم تحديث بيانات المستخدم بنجاح.",
            userId: id,
        });
    } catch (error) {
        if (client && transactionStarted && !commitOutcomeUnknown) {
            try {
                await client.query("ROLLBACK");
                transactionStarted = false;
            } catch (rollbackError) {
                discardConnection = true;
                console.error("Update user rollback failed:", {
                    code: getErrorCode(rollbackError),
                    operation: "users.edit.rollback",
                });
            }
        }
        if (commitOutcomeUnknown) {
            return respond(
                "تعذر التأكد من نتيجة التعديل. يرجى مراجعة بيانات المستخدم قبل إعادة المحاولة.",
                503
            );
        }
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
            return respond(
                "اسم المستخدم موجود مسبقًا. يرجى اختيار اسم آخر.",
                409
            );
        }
        console.error("Update user API failed:", {
            code: getErrorCode(error),
            operation: "users.edit",
        });
        return respond("تعذر تحديث بيانات المستخدم حاليًا.", 500);
    } finally {
        client?.release(discardConnection);
    }
}
