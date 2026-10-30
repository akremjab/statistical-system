// واجهة تعديل الجهات الإدارية: التحقق من الجلسة والصلاحيات ورقم الجهة قبل السماح بالتعديل.
import "server-only";
import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/current-session";
import { hasPermission } from "@/lib/permissions";
// الاتصال بقاعدة البيانات للتحقق من الجهة قبل تعديلها.
import pool from "@/lib/db";
export const runtime = "nodejs";
// تحديد أنواع الجهات المسموح بها والحقول التي يستقبلها طلب التعديل.
const ENTITY_TYPES = new Set([
    "وزارة", "هيئة", "مصلحة", "مؤسسة", "جهاز", "مركز",
    "بلدية", "شركة عامة", "جامعة", "مستشفى", "جهة أخرى"
]);

type UpdateEntityBody = {
    name?: unknown;
    entityType?: unknown;
    city?: unknown;
    hasIndependentFinancialLiability?: unknown;
    notes?: unknown;
};
type RouteContext = {
    params: Promise<{ id: string }>;
};

function respond(error: string, status: number) {
    return NextResponse.json({ success: false, error }, { status });
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

    const session = await getCurrentSession();
    if (!session) return respond("يجب تسجيل الدخول أولًا.", 401);
    if (session.mustChangePassword) {
        return respond("يجب تغيير كلمة المرور قبل المتابعة.", 403);
    }
    if (!(await hasPermission("entities.edit"))) {
        return respond("ليس لديك صلاحية تعديل الجهات الإدارية.", 403);
    }

    const { id } = await context.params;
    if (!/^[1-9]\d*$/.test(id)) {
        return respond("رقم الجهة الإدارية غير صالح.", 400);
    }

    // قراءة بيانات التعديل والتحقق منها قبل السماح بأي تغيير في قاعدة البيانات.
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
        return respond("نوع الطلب غير مدعوم.", 415);
    }

    let body: UpdateEntityBody;
    try {
        const rawBody = await request.text();
        if (Buffer.byteLength(rawBody, "utf8") > 8192) {
            return respond("حجم الطلب يتجاوز الحد المسموح.", 413);
        }

        const parsed: unknown = JSON.parse(rawBody);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            return respond("بيانات الطلب غير صالحة.", 400);
        }
        body = parsed as UpdateEntityBody;
    } catch {
        return respond("تعذر قراءة بيانات الطلب.", 400);
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const entityType = typeof body.entityType === "string" ? body.entityType.trim() : "";
    const city = typeof body.city === "string" ? body.city.trim() : "";
    const financial = body.hasIndependentFinancialLiability;
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";

    if (!name || name.length > 255) return respond("اسم الجهة الإدارية غير صالح.", 400);
    if (!ENTITY_TYPES.has(entityType)) return respond("نوع الجهة الإدارية غير صالح.", 400);
    if (!city || city.length > 150) return respond("اسم المدينة غير صالح.", 400);
    if (typeof financial !== "boolean") return respond("يجب تحديد حالة الذمة المالية المستقلة.", 400);
    if (body.notes !== undefined && body.notes !== null && typeof body.notes !== "string") {
        return respond("الملاحظات غير صالحة.", 400);
    }
    if (notes.length > 2000) return respond("الملاحظات تتجاوز الحد المسموح.", 400);

    // التحقق من وجود الجهة الإدارية دون تعديل بياناتها.
    try {
        // بدء معاملة مستقلة لقفل الجهة أثناء تجهيز التعديل.
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            // إعادة التحقق من صلاحية المستخدم داخل المعاملة قبل تعديل البيانات.
            const actorResult = await client.query<{ id: string }>(
                `SELECT id::text AS id
                 FROM public.users
                 WHERE id = $1
                   AND is_active = TRUE
                 FOR UPDATE`,
                [session.userId]
            );

            if (actorResult.rows.length === 0) {
                await client.query("ROLLBACK");
                return respond("حساب المستخدم غير نشط أو غير موجود.", 403);
            }
            // التأكد من امتلاك المستخدم صلاحية تعديل الجهات وقت تنفيذ المعاملة.
            const permissionResult = await client.query(
                `SELECT 1
                 FROM public.user_permissions AS up
                 INNER JOIN public.permissions AS p
                     ON p.id = up.permission_id
                 WHERE up.user_id = $1
                   AND p.code = 'entities.edit'
                 LIMIT 1`,
                [session.userId]
            );

            if (permissionResult.rows.length === 0) {
                await client.query("ROLLBACK");
                return respond("لم تعد لديك صلاحية تعديل الجهات الإدارية.", 403);
            }
            const result = await client.query<{
                id: string;
                name: string;
                entity_type: string;
                city: string;
                has_independent_financial_liability: boolean;
                notes: string | null;
            }>(
                `SELECT
                id::text AS id,
                name,
                entity_type,
                city,
                has_independent_financial_liability,
                notes
             FROM public.administrative_entities
             WHERE id = $1::bigint
             FOR UPDATE`,
                [id]
            );

            // إنهاء المعاملة وإطلاق قفل الجهة دون تغيير بياناتها.
            if (result.rows.length === 0) {
                await client.query("ROLLBACK");
                return respond("الجهة الإدارية غير موجودة.", 404);
            }

            // حفظ القيم القديمة والجديدة في سجل التدقيق ضمن نفس معاملة التعديل.
            const oldValues = result.rows[0];

            const newValues = {
                name,
                entity_type: entityType,
                city,
                has_independent_financial_liability: financial,
                notes: notes || null
            };
            // منع تنفيذ تعديل أو تسجيل تدقيق إذا كانت جميع البيانات دون تغيير.
            const hasChanges =
                oldValues.name !== newValues.name ||
                oldValues.entity_type !== newValues.entity_type ||
                oldValues.city !== newValues.city ||
                oldValues.has_independent_financial_liability !==
                newValues.has_independent_financial_liability ||
                oldValues.notes !== newValues.notes;

            if (!hasChanges) {
                await client.query("ROLLBACK");

                return NextResponse.json({
                    success: true,
                    changed: false,
                    message: "لم يتم إجراء أي تعديل لأن البيانات لم تتغير."
                });
            }
            await client.query(
                `UPDATE public.administrative_entities
                 SET name = $1,
                     entity_type = $2,
                     city = $3,
                     has_independent_financial_liability = $4,
                     notes = $5,
                     updated_at = NOW()
                 WHERE id = $6::bigint`,
                [name, entityType, city, financial, notes || null, id]
            );

            await client.query(
                `INSERT INTO public.audit_logs
                    (user_id, actor_username, action, entity_type, entity_id,
                     old_values, new_values, success)
                 VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, TRUE)`,
                [
                    session.userId,
                    session.username,
                    "entities.updated",
                    "administrative_entities",
                    id,
                    JSON.stringify(oldValues),
                    JSON.stringify(newValues)
                ]
            );

            // اعتماد التعديل مع توضيح حالة النتيجة إذا تعذر تأكيد الحفظ.
            try {
                await client.query("COMMIT");
            } catch (commitError) {
                console.error(
                    "Entity update commit result is uncertain:",
                    commitError
                );

                return NextResponse.json(
                    {
                        success: false,
                        uncertain: true,
                        error:
                            "تعذر تأكيد نتيجة الحفظ. يرجى تحديث الصفحة والتحقق من البيانات قبل إعادة المحاولة."
                    },
                    { status: 503 }
                );
            }

            return NextResponse.json({
                success: true,
                changed: true,
                message: "تم تعديل الجهة الإدارية بنجاح."
            });
        } catch (error) {
            try {
                await client.query("ROLLBACK");
            } catch {
                console.error("Entity update rollback failed.");
            }
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error("Entity update preparation failed:", error);
        return respond("تعذر التحقق من الجهة الإدارية حاليًا.", 500);
    }
}














// حذف جهة إدارية غير مرتبطة بسجلات رسمية، مع تسجيل العملية في سجل التدقيق.
export async function DELETE(request: Request, context: RouteContext) {
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

    const session = await getCurrentSession();
    if (!session) return respond("يجب تسجيل الدخول أولًا.", 401);
    if (session.mustChangePassword) {
        return respond("يجب تغيير كلمة المرور قبل المتابعة.", 403);
    }
    if (!(await hasPermission("entities.delete"))) {
        return respond("ليس لديك صلاحية حذف الجهات الإدارية.", 403);
    }

    const { id } = await context.params;
    if (!/^[1-9]\d*$/.test(id)) {
        return respond("رقم الجهة الإدارية غير صالح.", 400);
    }

    // اتصال PostgreSQL المستخدم في معاملة حذف الجهة الإدارية.
    let client: import("pg").PoolClient | undefined;
    let transactionStarted = false;
    let discardConnection = false;
    let commitOutcomeUnknown = false;

    try {
        client = await pool.connect();
        await client.query("BEGIN");
        transactionStarted = true;

        // منع إدخال أو تعديل مراسلات أثناء التحقق والحذف.
        await client.query("LOCK TABLE public.incoming_correspondences IN SHARE ROW EXCLUSIVE MODE");

        // إعادة فحص الحساب والصلاحية داخل المعاملة.
        const actorResult = await client.query<{ id: string; username: string }>(
            `SELECT u.id::text AS id, u.username
             FROM public.users AS u
             WHERE u.id = $1 AND u.is_active = TRUE AND u.must_change_password = FALSE
               AND EXISTS (
                   SELECT 1 FROM public.user_permissions AS up
                   JOIN public.permissions AS p ON p.id = up.permission_id
                   WHERE up.user_id = u.id AND p.code = 'entities.delete'
               )
             FOR UPDATE OF u`,
            [session.userId]
        );
        const actor = actorResult.rows[0];
        if (!actor) {
            await client.query("ROLLBACK");
            transactionStarted = false;
            return respond("لم يعد الحساب مخولًا لتنفيذ الحذف.", 403);
        }

        const entityResult = await client.query<{
            id: string;
            name: string;
            entity_type: string;
            city: string;
            has_independent_financial_liability: boolean;
            notes: string | null;
        }>(
            `SELECT id::text AS id, name, entity_type, city,
                    has_independent_financial_liability, notes
             FROM public.administrative_entities
             WHERE id = $1::bigint
             FOR UPDATE`,
            [id]
        );
        const entity = entityResult.rows[0];
        if (!entity) {
            await client.query("ROLLBACK");
            transactionStarted = false;
            return respond("الجهة الإدارية غير موجودة.", 404);
        }

        // حماية المراسلات المرتبطة برقم الجهة أو باسمها الحالي أو أسمائها المسجلة سابقًا.
        const linkedResult = await client.query<{ total: string }>(
            `WITH known_names AS (
                SELECT name AS entity_name
                FROM public.administrative_entities WHERE id = $1::bigint
                UNION
                SELECT old_values ->> 'name' AS entity_name
                FROM public.audit_logs
                WHERE entity_type = 'administrative_entities'
                  AND entity_id = $1::text
                  AND action = 'entities.updated'
                  AND old_values ->> 'name' IS NOT NULL
            )
            SELECT COUNT(*)::text AS total
            FROM public.incoming_correspondences AS c
            WHERE c.administrative_entity_id = $1::bigint
               OR EXISTS (
                   SELECT 1 FROM known_names AS n
                   WHERE LOWER(TRIM(c.administrative_entity)) = LOWER(TRIM(n.entity_name))
               )`,
            [id]
        );
        // منع حذف الجهة عند وجود مراسلات رسمية مرتبطة بها.
        if (Number(linkedResult.rows[0].total) > 0) {
            await client.query("ROLLBACK");
            transactionStarted = false;

            return respond(
                "لا يمكن حذف الجهة لوجود مراسلات رسمية مرتبطة بها.",
                409
            );
        }

        // حذف الجهة بعد اجتياز فحوصات الارتباطات الرسمية.
        // ON DELETE SET NULL يحافظ على سجلات طلبات الإنشاء.
        const deleted = await client.query(
            `DELETE FROM public.administrative_entities WHERE id = $1::bigint`,
            [id]
        );

        if (deleted.rowCount !== 1) {
            throw new Error("Entity deletion did not affect exactly one row");
        }

        // سجل التدقيق يُحفظ في نفس المعاملة، ولا يُحذف مع الجهة.
        await client.query(
            `INSERT INTO public.audit_logs
                (user_id, actor_username, action, entity_type, entity_id,
                 old_values, success)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, TRUE)`,
            [actor.id, actor.username, "entities.deleted", "administrative_entities",
                id, JSON.stringify(entity)]
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
            message: "تم حذف الجهة الإدارية نهائيًا وتسجيل العملية في سجل التدقيق."
        });
    } catch (error) {
        if (client && transactionStarted && !commitOutcomeUnknown) {
            try {
                await client.query("ROLLBACK");
            } catch {
                discardConnection = true;
                console.error("Entity deletion rollback failed.");
            }
        }
        if (commitOutcomeUnknown) {
            return respond("تعذر تأكيد نتيجة الحذف. حدّث القائمة وتحقق قبل إعادة المحاولة.", 503);
        }
        const code = typeof error === "object" && error !== null && "code" in error
            ? String(error.code) : "UNKNOWN";
        console.error("Entity deletion failed:", { code });
        return respond("تعذر حذف الجهة الإدارية حاليًا.", 500);
    } finally {
        client?.release(discardConnection);
    }
}
