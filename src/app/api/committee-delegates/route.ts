
import "server-only";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import pool from "@/lib/db";
import { getCurrentSession } from "@/lib/current-session";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

type CreateDelegateBody = {
    fullName?: unknown;
    nationalNumber?: unknown;
    employeeNumber?: unknown;
    academicQualification?: unknown;
    actualServiceYears?: unknown;
    passedQualificationCourse?: unknown;
    phoneNumber?: unknown;
    originalWorkplace?: unknown;
    notes?: unknown;
};

function respond(error: string, status: number) {
    return NextResponse.json(
        { success: false, error },
        { status }
    );
}

function validText(value: unknown, max: number): value is string {
    return typeof value === "string" &&
        value.trim().length > 0 &&
        value.trim().length <= max;
}

export async function POST(request: Request) {
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

    let client;
    let transactionStarted = false;
    let discardConnection = false;
    let commitOutcomeUnknown = false;

    try {
        const session = await getCurrentSession();

        if (!session) {
            return respond("يجب تسجيل الدخول أولًا.", 401);
        }

        if (session.mustChangePassword) {
            return respond(
                "يجب تغيير كلمة المرور قبل المتابعة.",
                403
            );
        }

        if (!(await hasPermission("delegates.create"))) {
            return respond(
                "ليس لديك صلاحية إضافة المندوبين.",
                403
            );
        }

        const contentType =
            request.headers.get("content-type") ?? "";

        if (!contentType.toLowerCase().startsWith("application/json")) {
            return respond("نوع الطلب غير مدعوم.", 415);
        }

        const idempotencyKey =
            request.headers.get("Idempotency-Key")?.trim() ?? "";

        const uuidPattern =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

        if (!uuidPattern.test(idempotencyKey)) {
            return respond(
                "مفتاح عملية الحفظ غير صالح أو غير موجود.",
                400
            );
        }

        const contentLength = request.headers.get("content-length");

        if (
            contentLength !== null &&
            (
                !Number.isSafeInteger(Number(contentLength)) ||
                Number(contentLength) < 0 ||
                Number(contentLength) > 8192
            )
        ) {
            return respond("حجم الطلب غير صالح.", 413);
        }

        let body: CreateDelegateBody;

        try {
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
            } finally {
                reader.releaseLock();
            }

            if (tooLarge) {
                return respond(
                    "حجم الطلب يتجاوز الحد المسموح.",
                    413
                );
            }

            const rawBody = Buffer.concat(
                chunks.map((chunk) => Buffer.from(chunk))
            ).toString("utf8");

            const parsed: unknown = JSON.parse(rawBody);

            if (
                typeof parsed !== "object" ||
                parsed === null ||
                Array.isArray(parsed)
            ) {
                return respond("بيانات الطلب غير صالحة.", 400);
            }

            body = parsed as CreateDelegateBody;
        } catch {
            return respond("تعذر قراءة بيانات الطلب.", 400);
        }

        if (
            !validText(body.fullName, 255) ||
            !validText(body.nationalNumber, 30) ||
            !validText(body.employeeNumber, 50) ||
            !validText(body.academicQualification, 255) ||
            !validText(body.phoneNumber, 30) ||
            !validText(body.originalWorkplace, 255)
        ) {
            return respond(
                "يرجى استكمال بيانات المندوب المطلوبة.",
                400
            );
        }

        if (
            !Number.isSafeInteger(body.actualServiceYears) ||
            typeof body.actualServiceYears !== "number" ||
            body.actualServiceYears < 0 ||
            body.actualServiceYears > 80
        ) {
            return respond(
                "عدد سنوات الخدمة الفعلية غير صالح.",
                400
            );
        }

        if (typeof body.passedQualificationCourse !== "boolean") {
            return respond(
                "يجب تحديد حالة اجتياز الدورة التأهيلية.",
                400
            );
        }

        if (
            body.notes !== undefined &&
            body.notes !== null &&
            typeof body.notes !== "string"
        ) {
            return respond("الملاحظات غير صالحة.", 400);
        }

        const fullName = body.fullName.trim();
        const nationalNumber = body.nationalNumber.trim();
        const employeeNumber = body.employeeNumber.trim();
        const academicQualification =
            body.academicQualification.trim();
        const actualServiceYears = body.actualServiceYears;
        const passedQualificationCourse =
            body.passedQualificationCourse;
        const phoneNumber = body.phoneNumber.trim();
        const originalWorkplace = body.originalWorkplace.trim();
        const notes =
            typeof body.notes === "string"
                ? body.notes.trim()
                : "";

        if (notes.length > 2000) {
            return respond(
                "الملاحظات تتجاوز الحد المسموح.",
                400
            );
        }

        const requestHash = createHash("sha256")
            .update(JSON.stringify({
                fullName,
                nationalNumber,
                employeeNumber,
                academicQualification,
                actualServiceYears,
                passedQualificationCourse,
                phoneNumber,
                originalWorkplace,
                notes
            }))
            .digest("hex");

        client = await pool.connect();

        await client.query("BEGIN");
        transactionStarted = true;

        const actorResult = await client.query<{
            id: number;
            username: string;
        }>(
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
                     AND p.code = 'delegates.create'
               )
             FOR UPDATE OF u`,
            [session.userId]
        );

        const actor = actorResult.rows[0];

        if (!actor) {
            await client.query("ROLLBACK");
            transactionStarted = false;

            return respond(
                "لم يعد الحساب مخولًا لتنفيذ العملية.",
                403
            );
        }

        await client.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
            [idempotencyKey]
        );

        const existingRequest = await client.query<{
            user_id: string;
            request_hash: string;
            delegate_id: string;
        }>(
            `SELECT
                 user_id::text AS user_id,
                 request_hash,
                 delegate_id::text AS delegate_id
             FROM public.delegate_creation_requests
             WHERE idempotency_key = $1::uuid`,
            [idempotencyKey]
        );

        const previous = existingRequest.rows[0];

        if (previous) {
            if (
                previous.user_id !== String(actor.id) ||
                previous.request_hash !== requestHash
            ) {
                await client.query("ROLLBACK");
                transactionStarted = false;

                return respond(
                    "مفتاح عملية الحفظ مستخدم مسبقًا لطلب مختلف.",
                    409
                );
            }

            await client.query("COMMIT");
            transactionStarted = false;

            return NextResponse.json({
                success: true,
                message:
                    "سبق حفظ بيانات هذا المندوب بنفس الطلب.",
                delegateId: previous.delegate_id,
                alreadyProcessed: true
            });
        }

        const insertResult = await client.query<{
            id: string;
        }>(
            `INSERT INTO public.committee_delegates (
                full_name,
                national_number,
                employee_number,
                academic_qualification,
                actual_service_years,
                passed_qualification_course,
                phone_number,
                original_workplace,
                notes
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id::text AS id`,
            [
                fullName,
                nationalNumber,
                employeeNumber,
                academicQualification,
                actualServiceYears,
                passedQualificationCourse,
                phoneNumber,
                originalWorkplace,
                notes || null
            ]
        );

        const delegateId = insertResult.rows[0].id;

        await client.query(
            `INSERT INTO public.delegate_creation_requests (
                idempotency_key,
                user_id,
                request_hash,
                delegate_id
            )
            VALUES ($1::uuid, $2, $3, $4)`,
            [
                idempotencyKey,
                actor.id,
                requestHash,
                delegateId
            ]
        );

        await client.query(
            `INSERT INTO public.audit_logs (
                user_id,
                actor_username,
                action,
                entity_type,
                entity_id,
                new_values,
                success
            )
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, TRUE)`,
            [
                actor.id,
                actor.username,
                "delegates.created",
                "committee_delegates",
                delegateId,
                JSON.stringify({
                    id: delegateId,
                    full_name: fullName,
                    national_number: nationalNumber,
                    employee_number: employeeNumber,
                    academic_qualification:
                        academicQualification,
                    actual_service_years:
                        actualServiceYears,
                    passed_qualification_course:
                        passedQualificationCourse,
                    phone_number: phoneNumber,
                    original_workplace: originalWorkplace,
                    notes: notes || null
                })
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
            message: "تم حفظ بيانات المندوب بنجاح.",
            delegateId
        }, { status: 201 });

    } catch (error) {
        if (client && transactionStarted && !commitOutcomeUnknown) {
            try {
                await client.query("ROLLBACK");
            } catch {
                discardConnection = true;
                console.error(
                    "Create delegate rollback failed."
                );
            }
        }

        if (commitOutcomeUnknown) {
            return respond(
                "تعذر التأكد من نتيجة الحفظ. يرجى مراجعة بيانات المندوبين قبل إعادة المحاولة.",
                503
            );
        }

        const errorCode =
            typeof error === "object" &&
                error !== null &&
                "code" in error &&
                typeof error.code === "string"
                ? error.code
                : "UNKNOWN";

        if (errorCode === "23505") {
            return respond(
                "الرقم الوطني مسجل مسبقًا لمندوب آخر.",
                409
            );
        }

        console.error("Create delegate API failed:", {
            code: errorCode,
            operation: "delegates.create"
        });

        return respond(
            "تعذر حفظ بيانات المندوب حاليًا.",
            500
        );
    } finally {
        client?.release(discardConnection);
    }
}















export async function GET(request: Request) {
    try {
        const session = await getCurrentSession();

        if (!session) {
            return respond("يجب تسجيل الدخول أولًا.", 401);
        }

        if (session.mustChangePassword) {
            return respond(
                "يجب تغيير كلمة المرور قبل المتابعة.",
                403
            );
        }

        if (!(await hasPermission("delegates.view"))) {
            return respond(
                "ليس لديك صلاحية عرض بيانات المندوبين.",
                403
            );
        }

        const url = new URL(request.url);
        const search = (url.searchParams.get("search") ?? "").trim();

        if (search.length > 100) {
            return respond("عبارة البحث طويلة جدًا.", 400);
        }

        const result = await pool.query<{
            id: string;
            full_name: string;
            national_number: string;
            employee_number: string;
            academic_qualification: string;
            actual_service_years: number;
            passed_qualification_course: boolean;
            phone_number: string;
            original_workplace: string;
            notes: string | null;
            created_at: string;
        }>(
            `SELECT
                id::text AS id,
                full_name,
                national_number,
                employee_number,
                academic_qualification,
                actual_service_years,
                passed_qualification_course,
                phone_number,
                original_workplace,
                notes,
                created_at
             FROM public.committee_delegates
             WHERE (
                $1::text = ''
                OR full_name ILIKE '%' || $1 || '%'
                OR national_number ILIKE '%' || $1 || '%'
                OR employee_number ILIKE '%' || $1 || '%'
             )
             ORDER BY created_at DESC, id DESC
             LIMIT 100`,
            [search]
        );

        return NextResponse.json(
            {
                success: true,
                delegates: result.rows
            },
            {
                headers: {
                    "Cache-Control": "no-store"
                }
            }
        );

    } catch (error) {
        const errorCode =
            typeof error === "object" &&
                error !== null &&
                "code" in error &&
                typeof error.code === "string"
                ? error.code
                : "UNKNOWN";

        console.error("List delegates API failed:", {
            code: errorCode,
            operation: "delegates.view"
        });

        return respond(
            "تعذر تحميل بيانات المندوبين حاليًا.",
            500
        );
    }
}
