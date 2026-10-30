import "server-only";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getCurrentSession } from "@/lib/current-session";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

const ENTITY_TYPES = new Set([
    "وزارة", "هيئة", "مصلحة", "مؤسسة", "جهاز", "مركز",
    "بلدية", "شركة عامة", "جامعة", "مستشفى", "جهة أخرى"
]);

type CreateEntityBody = {
    name?: unknown;
    entityType?: unknown;
    city?: unknown;
    hasIndependentFinancialLiability?: unknown;
    notes?: unknown;
};

function respond(error: string, status: number) {
    return NextResponse.json({ success: false, error }, { status });
}

export async function POST(request: Request) {
    const origin = request.headers.get("origin");
    const allowedOrigins = new Set(
        (process.env.AUTH_ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean)
    );
    if (!origin || !allowedOrigins.has(origin)) return respond("طلب غير مسموح به.", 403);

    let client;
    let transactionStarted = false;
    let discardConnection = false;
    let commitOutcomeUnknown = false;

    try {
        const session = await getCurrentSession();
        if (!session) return respond("يجب تسجيل الدخول أولًا.", 401);
        if (session.mustChangePassword) return respond("يجب تغيير كلمة المرور قبل المتابعة.", 403);
        if (!(await hasPermission("entities.create"))) return respond("ليس لديك صلاحية إضافة الجهات الإدارية.", 403);

        const contentType = request.headers.get("content-type") ?? "";
        const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() ?? "";
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidPattern.test(idempotencyKey)) {
            return respond("مفتاح عملية الحفظ غير صالح أو غير موجود.", 400);
        }
        if (!contentType.toLowerCase().startsWith("application/json")) return respond("نوع الطلب غير مدعوم.", 415);

        const contentLength = request.headers.get("content-length");
        if (contentLength !== null && (!Number.isSafeInteger(Number(contentLength)) || Number(contentLength) < 0 || Number(contentLength) > 8192)) {
            return respond("حجم الطلب غير صالح.", 413);
        }

        let body: CreateEntityBody;
        try {
            const reader = request.body?.getReader();
            if (!reader) return respond("الطلب لا يحتوي على بيانات.", 400);

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

            if (tooLarge) return respond("حجم الطلب يتجاوز الحد المسموح.", 413);
            const rawBody = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
            const parsed: unknown = JSON.parse(rawBody);
            if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
                return respond("بيانات الطلب غير صالحة.", 400);
            }
            body = parsed as CreateEntityBody;
        } catch {
            return respond("تعذر قراءة بيانات الطلب.", 400);
        }

        if (typeof body.name !== "string" || typeof body.entityType !== "string" || typeof body.city !== "string") {
            return respond("بيانات الجهة الإدارية غير مكتملة.", 400);
        }

        const name = body.name.trim();
        const entityType = body.entityType.trim();
        const city = body.city.trim();
        const financial = body.hasIndependentFinancialLiability;

        if (!name || name.length > 255) return respond("اسم الجهة الإدارية غير صالح.", 400);
        if (!ENTITY_TYPES.has(entityType)) return respond("نوع الجهة الإدارية غير صالح.", 400);
        if (!city || city.length > 150) return respond("اسم المدينة غير صالح.", 400);
        if (typeof financial !== "boolean") return respond("يجب تحديد حالة الذمة المالية المستقلة.", 400);
        if (body.notes !== undefined && body.notes !== null && typeof body.notes !== "string") {
            return respond("الملاحظات غير صالحة.", 400);
        }

        const notes = typeof body.notes === "string" ? body.notes.trim() : "";
        if (notes.length > 2000) return respond("الملاحظات تتجاوز الحد المسموح.", 400);
        const requestHash = createHash("sha256").update(JSON.stringify({
            name,
            entityType,
            city,
            hasIndependentFinancialLiability: financial,
            notes
        })).digest("hex");

        client = await pool.connect();
        await client.query("BEGIN");
        transactionStarted = true;

        const actorResult = await client.query<{ id: number; username: string }>(
            `SELECT u.id, u.username
             FROM public.users AS u
             WHERE u.id = $1
               AND u.is_active = TRUE
               AND u.must_change_password = FALSE
               AND EXISTS (
                   SELECT 1
                   FROM public.user_permissions AS up
                   INNER JOIN public.permissions AS p ON p.id = up.permission_id
                   WHERE up.user_id = u.id AND p.code = 'entities.create'
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

        await client.query(
            `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
            [idempotencyKey]
        );

        const existingRequest = await client.query<{
            user_id: string;
            request_hash: string;
            entity_id: string | null;
        }>(
            `SELECT user_id::text AS user_id, request_hash, entity_id::text AS entity_id
             FROM public.entity_creation_requests
             WHERE idempotency_key = $1::uuid`,
            [idempotencyKey]
        );

        const previous = existingRequest.rows[0];

        if (previous) {
            if (previous.user_id !== String(actor.id) || previous.request_hash !== requestHash) {
                await client.query("ROLLBACK");
                transactionStarted = false;
                return respond("مفتاح عملية الحفظ مستخدم مسبقًا لطلب مختلف.", 409);
            }

            // منع إعادة استخدام طلب إنشاء سابق بعد حذف الجهة المرتبطة به.
            if (previous.entity_id === null) {
                await client.query("ROLLBACK");
                transactionStarted = false;
                return respond(
                    "سبق تنفيذ طلب الإنشاء هذا، لكن الجهة المرتبطة به حُذفت. يرجى بدء عملية إضافة جديدة.",
                    409
                );
            }

            await client.query("COMMIT");
            transactionStarted = false;

            return NextResponse.json({
                success: true,
                message: "تم العثور على عملية الحفظ السابقة، ولم تتم إضافة جهة مكررة.",
                entityId: previous.entity_id,
                alreadyProcessed: true
            }, { status: 200 });
        }

        const insertResult = await client.query<{ id: string }>(
            `INSERT INTO public.administrative_entities
                (name, entity_type, city, has_independent_financial_liability, notes)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id::text AS id`,
            [name, entityType, city, financial, notes || null]
        );
        const entityId = insertResult.rows[0].id;
        // ربط مفتاح عملية الحفظ بالجهة الجديدة داخل نفس المعاملة لمنع تنفيذ الطلب مرتين.
        await client.query(
            `INSERT INTO public.entity_creation_requests
                (idempotency_key, user_id, request_hash, entity_id)
             VALUES ($1::uuid, $2, $3, $4)`,
            [idempotencyKey, actor.id, requestHash, entityId]
        );
        await client.query(
            `INSERT INTO public.audit_logs
                (user_id, actor_username, action, entity_type, entity_id, new_values, success)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, TRUE)`,
            [
                actor.id,
                actor.username,
                "entities.created",
                "administrative_entities",
                entityId,
                JSON.stringify({
                    id: entityId,
                    name,
                    entity_type: entityType,
                    city,
                    has_independent_financial_liability: financial,
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
            message: "تمت إضافة الجهة الإدارية بنجاح.",
            entityId
        }, { status: 201 });
    } catch (error) {
        if (client && transactionStarted && !commitOutcomeUnknown) {
            try {
                await client.query("ROLLBACK");
            } catch {
                discardConnection = true;
                console.error("Create entity rollback failed:", { operation: "entities.create.rollback" });
            }
        }

        if (commitOutcomeUnknown) {
            return respond("تعذر التأكد من نتيجة الحفظ. يرجى مراجعة قائمة الجهات قبل إعادة المحاولة.", 503);
        }

        const errorCode = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
            ? error.code : "UNKNOWN";
        console.error("Create entity API failed:", { code: errorCode, operation: "entities.create" });
        return respond("تعذر إضافة الجهة الإدارية حاليًا.", 500);
    } finally {
        client?.release(discardConnection);
    }
}
