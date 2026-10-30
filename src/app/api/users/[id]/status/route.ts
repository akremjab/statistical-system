
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
type ActorRecord = {
    id: string;
    username: string;
};
type TargetRecord = {
    id: string;
    username: string;
    is_active: boolean;
};
function respond(error: string, status: number) {
    return NextResponse.json({ success: false, error }, { status });
}
function getErrorCode(error: unknown): string {
    if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
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
        return respond("مصدر الطلب غير مسموح به.", 403);
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
        if (!(await hasPermission("users.manage_status"))) {
            return respond("ليس لديك صلاحية إدارة حالة المستخدمين.", 403);
        }
        const { id } = await context.params;
        if (!/^[1-9][0-9]*$/.test(id) || BigInt(id) > BigInt("9223372036854775807")) {
            return respond("معرّف المستخدم غير صالح.", 400);
        }
        const contentType = request.headers.get("content-type") ?? "";
        if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
            return respond("نوع البيانات غير مدعوم.", 415);
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
        let body: unknown;
        try {
            const raw = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
            body = JSON.parse(raw);
        } catch {
            return respond("بيانات JSON غير صالحة.", 400);
        }
        if (typeof body !== "object" || body === null || Array.isArray(body)) {
            return respond("بيانات الطلب غير صالحة.", 400);
        }
        const payload = body as Record<string, unknown>;
        if (Object.keys(payload).length !== 1 || typeof payload.isActive !== "boolean") {
            return respond("يجب تحديد حالة الحساب فقط بقيمة صحيحة.", 400);
        }
        const requestedStatus = payload.isActive;
        if (!requestedStatus && String(session.userId) === id) {
            return respond("لا يمكنك تعطيل حسابك الشخصي.", 403);
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
                   FROM public.user_sessions AS s
                   WHERE s.id = $2
                     AND s.user_id = u.id
                     AND s.revoked_at IS NULL
                     AND s.expires_at > NOW()
               )
               AND EXISTS (
                   SELECT 1
                   FROM public.user_permissions AS up
                   INNER JOIN public.permissions AS p
                       ON p.id = up.permission_id
                   WHERE up.user_id = u.id
                     AND p.code = 'users.manage_status'
               )
             FOR UPDATE OF u`,
            [session.userId, session.sessionId]
        );
        const actor = actorResult.rows[0];
        if (!actor) {
            await client.query("ROLLBACK");
            transactionStarted = false;
            return respond("لم يعد الحساب مخولًا لتنفيذ العملية.", 403);
        }
        const activeSessionResult = await client.query(
            `SELECT id
     FROM public.user_sessions
     WHERE id = $1
       AND user_id = $2
       AND revoked_at IS NULL
       AND expires_at > NOW()
     FOR UPDATE`,
            [session.sessionId, session.userId]
        );
        if (activeSessionResult.rowCount !== 1) {
            await client.query("ROLLBACK");
            transactionStarted = false;
            return respond("انتهت صلاحية الجلسة. يرجى تسجيل الدخول مجددًا.", 401);
        }
        const targetResult = await client.query<TargetRecord>(
            `SELECT id, username, is_active
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
        if (!requestedStatus && String(actor.id) === String(target.id)) {
            await client.query("ROLLBACK");
            transactionStarted = false;
            return respond("لا يمكنك تعطيل حسابك الشخصي.", 403);
        }
        if (target.is_active === requestedStatus) {
            await client.query("ROLLBACK");
            transactionStarted = false;
            return NextResponse.json({
                success: true,
                changed: false,
                message: "حالة الحساب مطابقة للحالة المطلوبة.",
                userId: id,
            });
        }
        await client.query(
            `UPDATE public.users
             SET is_active = $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [requestedStatus, id]
        );
        if (!requestedStatus) {
            await client.query(
                `UPDATE public.user_sessions
                 SET revoked_at = NOW(),
                     revocation_reason = 'account_disabled'
                 WHERE user_id = $1
                   AND revoked_at IS NULL`,
                [id]
            );
        }
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
                requestedStatus ? "users.activated" : "users.deactivated",
                "users",
                id,
                JSON.stringify({ is_active: target.is_active }),
                JSON.stringify({ is_active: requestedStatus }),
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
            message: requestedStatus ? "تم تفعيل الحساب بنجاح." : "تم تعطيل الحساب وإلغاء جلساته بنجاح.",
            userId: id,
        });
    } catch (error) {
        if (client && transactionStarted && !commitOutcomeUnknown) {
            try {
                await client.query("ROLLBACK");
                transactionStarted = false;
            } catch (rollbackError) {
                discardConnection = true;
                console.error("User status rollback failed:", {
                    code: getErrorCode(rollbackError),
                    operation: "users.status.rollback",
                });
            }
        }
        if (commitOutcomeUnknown) {
            return respond("تعذر التأكد من نتيجة العملية. يرجى مراجعة حالة الحساب قبل إعادة المحاولة.", 503);
        }
        console.error("User status API failed:", {
            code: getErrorCode(error),
            operation: "users.status",
        });
        return respond("تعذر تغيير حالة الحساب حاليًا.", 500);
    } finally {
        client?.release(discardConnection);
    }
}
