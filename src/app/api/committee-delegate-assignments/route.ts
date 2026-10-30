
import "server-only";

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import type { PoolClient } from "pg";
import pool from "@/lib/db";
import { getCurrentSession } from "@/lib/current-session";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

type AssignmentBody = {
    delegateId?: unknown;
    administrativeEntityId?: unknown;
    assignmentReference?: unknown;
    assignmentDate?: unknown;
    notes?: unknown;
};

type AssignmentRow = {
    id: string;
    delegate_id: string;
    administrative_entity_id: string;
    assignment_reference: string;
    assignment_date: string;
    status: string;
    ended_at: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
};

function respond(error: string, status: number) {
    return NextResponse.json(
        { success: false, error },
        { status }
    );
}

function positiveId(value: unknown): value is string {
    return (
        typeof value === "string" &&
        /^[1-9]\d{0,18}$/.test(value) &&
        BigInt(value) <= BigInt("9223372036854775807")
    );
}

function validDate(value: unknown): value is string {
    if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
        return false;
    }

    const [year, month, day] = value.split("-").map(Number);

    if (year < 1900 || year > 2100) {
        return false;
    }

    const date = new Date(Date.UTC(year, month - 1, day));

    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
    );
}

export async function POST(request: Request) {
    // منع طلبات الإنشاء القادمة من مصادر غير معتمدة.
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

    // نوع اتصال PostgreSQL الفعلي، وليس نوع دالة الاتصال.
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
            return respond(
                "يجب تغيير كلمة المرور قبل المتابعة.",
                403
            );
        }

        if (
            !(await hasPermission("delegates.assignments.create"))
        ) {
            return respond(
                "ليس لديك صلاحية إنشاء تكليفات المندوبين.",
                403
            );
        }

        const contentType =
            request.headers.get("content-type") ?? "";

        if (
            !contentType.toLowerCase().startsWith("application/json")
        ) {
            return respond("نوع الطلب غير مدعوم.", 415);
        }

        // مفتاح فريد يمنع تنفيذ نفس طلب الحفظ أكثر من مرة.
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

        // تحديد حجم الطلب فعليًا، وليس اعتمادًا على الترويسة فقط.
        const contentLength =
            request.headers.get("content-length");

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

        let body: AssignmentBody;

        try {
            const reader = request.body?.getReader();

            if (!reader) {
                return respond(
                    "الطلب لا يحتوي على بيانات.",
                    400
                );
            }

            const chunks: Uint8Array[] = [];
            let size = 0;
            let tooLarge = false;

            try {
                while (true) {
                    const { done, value } = await reader.read();

                    if (done) break;

                    size += value.byteLength;

                    if (size > 8192) {
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
                !parsed ||
                typeof parsed !== "object" ||
                Array.isArray(parsed)
            ) {
                return respond(
                    "بيانات الطلب غير صالحة.",
                    400
                );
            }

            body = parsed as AssignmentBody;
        } catch {
            return respond(
                "تعذر قراءة بيانات الطلب.",
                400
            );
        }

        // التحقق من المعرّفات والحقول قبل فتح المعاملة.
        if (
            !positiveId(body.delegateId) ||
            !positiveId(body.administrativeEntityId)
        ) {
            return respond(
                "يرجى اختيار مندوب وجهة إدارية صالحين.",
                400
            );
        }

        if (
            typeof body.assignmentReference !== "string" ||
            !body.assignmentReference.trim() ||
            body.assignmentReference.trim().length > 150
        ) {
            return respond(
                "الرقم الإشاري لرسالة التكليف غير صالح.",
                400
            );
        }

        if (!validDate(body.assignmentDate)) {
            return respond(
                "تاريخ رسالة التكليف غير صالح.",
                400
            );
        }

        if (
            body.notes != null &&
            typeof body.notes !== "string"
        ) {
            return respond("الملاحظات غير صالحة.", 400);
        }

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

        const delegateId = body.delegateId;
        const administrativeEntityId =
            body.administrativeEntityId;

        const assignmentReference =
            body.assignmentReference.trim();

        const assignmentDate = body.assignmentDate;

        // بصمة الطلب تمنع إعادة استخدام المفتاح لبيانات مختلفة.
        const requestHash = createHash("sha256")
            .update(JSON.stringify({
                delegateId,
                administrativeEntityId,
                assignmentReference,
                assignmentDate,
                notes
            }))
            .digest("hex");

        // فتح اتصال مستقل لتنفيذ عملية الحفظ داخل معاملة واحدة.
        const connectedClient: PoolClient = await pool.connect();
        client = connectedClient;

        await connectedClient.query("BEGIN");
        transactionStarted = true;

        // إعادة التحقق من الحساب والصلاحية داخل المعاملة.
        const actorResult = await client.query<{
            id: string;
            username: string;
        }>(
            `SELECT
                u.id::text AS id,
                u.username
             FROM public.users AS u
             WHERE u.id = $1
               AND u.is_active = TRUE
               AND u.must_change_password = FALSE
               AND EXISTS (
                   SELECT 1
                   FROM public.user_permissions AS up
                   JOIN public.permissions AS p
                       ON p.id = up.permission_id
                   WHERE up.user_id = u.id
                     AND p.code = 'delegates.assignments.create'
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

        // تسلسل الطلبات المتزامنة التي تستخدم المفتاح نفسه.
        await client.query(
            `SELECT pg_advisory_xact_lock(
                hashtextextended($1, 0)
            )`,
            [idempotencyKey]
        );

        const existing = await client.query<{
            user_id: string;
            request_hash: string;
            assignment_id: string;
        }>(
            `SELECT
                user_id::text AS user_id,
                request_hash,
                assignment_id::text AS assignment_id
             FROM public.delegate_assignment_creation_requests
             WHERE idempotency_key = $1::uuid`,
            [idempotencyKey]
        );

        const prior = existing.rows[0];

        if (prior) {
            if (
                prior.user_id !== actor.id ||
                prior.request_hash !== requestHash
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
                alreadyProcessed: true,
                assignmentId: prior.assignment_id,
                message: "سبق حفظ هذا التكليف بنفس الطلب."
            });
        }

        // قفل الجهة يمنع تداخل إنشاء تكليفين للجهة نفسها.
        // ونتحقق هنا أيضًا من شرط الذمة المالية المستقلة.
        const entity = await client.query<{ id: string }>(
            `SELECT id::text AS id
             FROM public.administrative_entities
             WHERE id = $1
               AND has_independent_financial_liability = TRUE
             FOR UPDATE`,
            [administrativeEntityId]
        );

        if (!entity.rows[0]) {
            await client.query("ROLLBACK");
            transactionStarted = false;

            return respond(
                "الجهة غير موجودة أو ليست لها ذمة مالية مستقلة.",
                400
            );
        }

        const delegate = await client.query(
            `SELECT id
             FROM public.committee_delegates
             WHERE id = $1`,
            [delegateId]
        );

        if (!delegate.rows[0]) {
            await client.query("ROLLBACK");
            transactionStarted = false;

            return respond(
                "المندوب المحدد غير موجود.",
                400
            );
        }

        // التقاط التكليف الساري قبل تشغيل Trigger الإنهاء.
        const previousResult =
            await client.query<AssignmentRow>(
                `SELECT
                    id::text,
                    delegate_id::text,
                    administrative_entity_id::text,
                    assignment_reference,
                    assignment_date::text,
                    status,
                    ended_at::text,
                    notes,
                    created_at::text,
                    updated_at::text
                 FROM public.committee_delegate_assignments
                 WHERE administrative_entity_id = $1
                   AND status = 'ساري'
                 FOR UPDATE`,
                [administrativeEntityId]
            );

        const previous = previousResult.rows[0] ?? null;

        // Trigger الموجود ينهي التكليف السابق داخل نفس المعاملة.
        const createdResult =
            await client.query<AssignmentRow>(
                `INSERT INTO public.committee_delegate_assignments (
                    delegate_id,
                    administrative_entity_id,
                    assignment_reference,
                    assignment_date,
                    notes
                 )
                 VALUES ($1, $2, $3, $4::date, $5)
                 RETURNING
                    id::text,
                    delegate_id::text,
                    administrative_entity_id::text,
                    assignment_reference,
                    assignment_date::text,
                    status,
                    ended_at::text,
                    notes,
                    created_at::text,
                    updated_at::text`,
                [
                    delegateId,
                    administrativeEntityId,
                    assignmentReference,
                    assignmentDate,
                    notes || null
                ]
            );

        const created = createdResult.rows[0];

        if (previous) {
            // قراءة الحالة النهائية للتكليف الذي أنهاه Trigger.
            const endedResult =
                await client.query<AssignmentRow>(
                    `SELECT
                        id::text,
                        delegate_id::text,
                        administrative_entity_id::text,
                        assignment_reference,
                        assignment_date::text,
                        status,
                        ended_at::text,
                        notes,
                        created_at::text,
                        updated_at::text
                     FROM public.committee_delegate_assignments
                     WHERE id = $1`,
                    [previous.id]
                );

            const ended = endedResult.rows[0];

            if (
                !ended ||
                ended.status !== "منتهٍ" ||
                !ended.ended_at
            ) {
                throw new Error(
                    "Previous assignment was not ended by trigger"
                );
            }

            // حفظ القيم القديمة والجديدة للتكليف المنتهي.
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
                 VALUES (
                    $1, $2, $3, $4, $5,
                    $6::jsonb, $7::jsonb, TRUE
                 )`,
                [
                    actor.id,
                    actor.username,
                    "delegates.assignments.ended",
                    "committee_delegate_assignments",
                    previous.id,
                    JSON.stringify(previous),
                    JSON.stringify(ended)
                ]
            );
        }

        // توثيق إنشاء التكليف الجديد.
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
             VALUES (
                $1, $2, $3, $4, $5, $6::jsonb, TRUE
             )`,
            [
                actor.id,
                actor.username,
                "delegates.assignments.created",
                "committee_delegate_assignments",
                created.id,
                JSON.stringify(created)
            ]
        );

        // حفظ المفتاح داخل المعاملة نفسها لمنع التكرار.
        await client.query(
            `INSERT INTO public.delegate_assignment_creation_requests (
                idempotency_key,
                user_id,
                request_hash,
                assignment_id
             )
             VALUES ($1::uuid, $2, $3, $4)`,
            [
                idempotencyKey,
                actor.id,
                requestHash,
                created.id
            ]
        );

        try {
            await client.query("COMMIT");
            transactionStarted = false;
        } catch (error) {
            // عند انقطاع الاتصال أثناء COMMIT لا نفترض الفشل.
            discardConnection = true;
            commitOutcomeUnknown = true;
            throw error;
        }

        return NextResponse.json(
            {
                success: true,
                message: "تم حفظ تكليف المندوب بنجاح.",
                assignmentId: created.id
            },
            { status: 201 }
        );
    } catch (error) {
        // التراجع عن جميع التغييرات عند فشل أي جزء من المعاملة.
        if (
            client &&
            transactionStarted &&
            !commitOutcomeUnknown
        ) {
            try {
                await client.query("ROLLBACK");
            } catch {
                discardConnection = true;
                console.error("Assignment rollback failed.");
            }
        }

        if (commitOutcomeUnknown) {
            return respond(
                "تعذر التأكد من نتيجة الحفظ. لا تنشئ طلبًا جديدًا قبل مراجعة التكليفات أو إعادة المحاولة بنفس المفتاح.",
                503
            );
        }

        const code =
            typeof error === "object" &&
                error !== null &&
                "code" in error &&
                typeof error.code === "string"
                ? error.code
                : "UNKNOWN";

        console.error("Create assignment API failed:", {
            code,
            operation: "delegates.assignments.create"
        });

        if (code === "23505") {
            return respond(
                "حدث تعارض أثناء حفظ التكليف. يرجى إعادة المحاولة.",
                409
            );
        }

        if (code === "23503") {
            return respond(
                "المندوب أو الجهة الإدارية غير موجود.",
                400
            );
        }

        return respond(
            "تعذر حفظ تكليف المندوب حاليًا.",
            500
        );
    } finally {
        client?.release(discardConnection);
    }
}














// جلب التكليفات المسجلة مع البحث والتصفية والترقيم.
// هذه العملية للقراءة فقط ولا تعدّل حالة أي تكليف.
export async function GET(request: Request) {
    try {
        // التحقق من وجود جلسة مستخدم صالحة.
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

        // صلاحية عرض التكليفات مستقلة عن صلاحية إنشائها.
        if (
            !(await hasPermission("delegates.assignments.view"))
        ) {
            return respond(
                "ليس لديك صلاحية عرض تكليفات المندوبين.",
                403
            );
        }

        // قراءة معاملات البحث والتصفية والترقيم.
        const url = new URL(request.url);

        const search = (
            url.searchParams.get("search") ?? ""
        ).trim();

        const status = url.searchParams.get("status") ?? "all";

        const pageValue = url.searchParams.get("page") ?? "1";

        // التحقق من المدخلات قبل إرسالها إلى PostgreSQL.
        if (search.length > 150) {
            return respond(
                "نص البحث يتجاوز الحد المسموح.",
                400
            );
        }

        if (!["all", "active", "ended"].includes(status)) {
            return respond(
                "حالة التصفية غير صالحة.",
                400
            );
        }

        if (!/^[1-9]\d{0,8}$/.test(pageValue)) {
            return respond(
                "رقم الصفحة غير صالح.",
                400
            );
        }

        const page = Number(pageValue);
        const pageSize = 20;
        const offset = (page - 1) * pageSize;

        // تحويل حالة التصفية إلى القيمة المخزنة في قاعدة البيانات.
        const databaseStatus =
            status === "active"
                ? "ساري"
                : status === "ended"
                    ? "منتهٍ"
                    : null;

        // تجهيز نص البحث مع التعامل الآمن مع رموز LIKE الخاصة.
        const escapedSearch = search.replace(
            /[\\%_]/g,
            "\\$&"
        );

        const searchPattern = `%${escapedSearch}%`;

        // الاستعلامان يعملان على نفس لقطة البيانات لضمان
        // تطابق إجمالي النتائج مع سجلات الصفحة الحالية.
        const result = await pool.query<{
            total_count: string;
            assignments: Array<{
                id: string;
                delegate_id: string;
                delegate_name: string;
                administrative_entity_id: string;
                administrative_entity_name: string;
                assignment_reference: string;
                assignment_date: string;
                status: string;
                ended_at: string | null;
                notes: string | null;
                created_at: string;
            }>;
        }>(
            `WITH matching_assignments AS MATERIALIZED (
                SELECT
                    a.id,
                    a.delegate_id,
                    d.full_name AS delegate_name,
                    a.administrative_entity_id,
                    e.name AS administrative_entity_name,
                    a.assignment_reference,
                    a.assignment_date,
                    a.status,
                    a.ended_at,
                    a.notes,
                    a.created_at
                FROM public.committee_delegate_assignments AS a
                INNER JOIN public.committee_delegates AS d
                    ON d.id = a.delegate_id
                INNER JOIN public.administrative_entities AS e
                    ON e.id = a.administrative_entity_id
                WHERE
                    (
                        $1::text = ''
                        OR d.full_name ILIKE $2 ESCAPE E'\\\\'
                        OR e.name ILIKE $2 ESCAPE E'\\\\'
                    )
                    AND (
                        $3::text IS NULL
                        OR a.status = $3
                    )
            ),
            paginated_assignments AS (
                SELECT *
                FROM matching_assignments
                ORDER BY created_at DESC, id DESC
                LIMIT $4 OFFSET $5
            )
            SELECT
                (
                    SELECT COUNT(*)::text
                    FROM matching_assignments
                ) AS total_count,
                COALESCE(
                    (
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'id', p.id::text,
                                'delegate_id', p.delegate_id::text,
                                'delegate_name', p.delegate_name,
                                'administrative_entity_id',
                                    p.administrative_entity_id::text,
                                'administrative_entity_name',
                                    p.administrative_entity_name,
                                'assignment_reference',
                                    p.assignment_reference,
                                'assignment_date',
                                    p.assignment_date::text,
                                'status', p.status,
                                'ended_at', p.ended_at::text,
                                'notes', p.notes,
                                'created_at', p.created_at::text
                            )
                            ORDER BY p.created_at DESC, p.id DESC
                        )
                        FROM paginated_assignments AS p
                    ),
                    '[]'::jsonb
                ) AS assignments`,
            [
                search,
                searchPattern,
                databaseStatus,
                pageSize,
                offset,
            ]
        );

        const row = result.rows[0];

        const total = Number(row?.total_count ?? "0");
        const totalPages = Math.ceil(total / pageSize);

        return NextResponse.json(
            {
                success: true,
                assignments: row?.assignments ?? [],
                pagination: {
                    page,
                    pageSize,
                    total,
                    totalPages,
                },
            },
            {
                headers: {
                    "Cache-Control": "no-store",
                },
            }
        );
    } catch (error) {
        console.error("List delegate assignments API failed:", {
            operation: "delegates.assignments.view",
            error:
                error instanceof Error
                    ? error.message
                    : "UNKNOWN",
        });

        return respond(
            "تعذر تحميل تكليفات المندوبين حاليًا.",
            500
        );
    }
}