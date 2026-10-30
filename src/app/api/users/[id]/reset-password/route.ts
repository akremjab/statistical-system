
import "server-only";
import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import bcrypt from "bcrypt";
import pool from "@/lib/db";
import { getCurrentSession } from "@/lib/current-session";
import { validateNewPassword } from "@/lib/password-policy";
export const runtime = "nodejs";
type RouteContext = {
    params: Promise<{ id: string }>;
};
type ActorRow = {
    id: string;
    username: string;
};
type TargetRow = {
    id: string;
    username: string;
    is_active: boolean;
    password_hash: string;
};
function errorResponse(message: string, status: number) {
    return NextResponse.json(
        { success: false, error: message },
        { status }
    );
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
export async function POST(request: Request, context: RouteContext) {
    let client: PoolClient | undefined;
    let transactionStarted = false;
    let discardConnection = false;
    let commitOutcomeUnknown = false;
    try {
        const origin = request.headers.get("origin");
        const allowedOrigins = new Set(
            (process.env.AUTH_ALLOWED_ORIGINS ?? "")
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean)
        );
        if (!origin || !allowedOrigins.has(origin)) {
            return errorResponse("مصدر الطلب غير مسموح به.", 403);
        }
        const session = await getCurrentSession();
        if (!session) {
            return errorResponse("يجب تسجيل الدخول أولًا.", 401);
        }
        if (session.mustChangePassword) {
            return errorResponse("يجب تغيير كلمة مرورك أولًا.", 403);
        }
        const { id } = await context.params;
        if (
            !/^[1-9][0-9]*$/.test(id) ||
            BigInt(id) > BigInt("9223372036854775807")
        ) {
            return errorResponse("معرّف المستخدم غير صالح.", 400);
        }
        if (String(session.userId) === id) {
            return errorResponse(
                "لا يمكنك إعادة تعيين كلمة مرور حسابك الشخصي.",
                403
            );
        }
        const contentType = request.headers.get("content-type") ?? "";
        if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
            return errorResponse("نوع البيانات غير مدعوم.", 415);
        }
        const contentLength = request.headers.get("content-length");
        if (contentLength !== null) {
            const size = Number(contentLength);
            if (!Number.isSafeInteger(size) || size < 0 || size > 8192) {
                return errorResponse("حجم الطلب غير صالح.", 413);
            }
        }
        const reader = request.body?.getReader();
        if (!reader) {
            return errorResponse("الطلب لا يحتوي على بيانات.", 400);
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
            return errorResponse("تعذر قراءة بيانات الطلب.", 400);
        } finally {
            reader.releaseLock();
        }
        if (tooLarge) {
            return errorResponse("حجم الطلب يتجاوز الحد المسموح.", 413);
        }
        let body: unknown;
        try {
            const raw = Buffer.concat(
                chunks.map((chunk) => Buffer.from(chunk))
            ).toString("utf8");
            body = JSON.parse(raw);
        } catch {
            return errorResponse("بيانات JSON غير صالحة.", 400);
        }
        if (
            typeof body !== "object" ||
            body === null ||
            Array.isArray(body)
        ) {
            return errorResponse("بيانات الطلب غير صالحة.", 400);
        }
        const payload = body as Record<string, unknown>;
        if (
            Object.keys(payload).length !== 1 ||
            !Object.prototype.hasOwnProperty.call(payload, "newPassword")
        ) {
            return errorResponse("بيانات الطلب غير صالحة.", 400);
        }
        const validationError = validateNewPassword(payload.newPassword);
        if (validationError) {
            return errorResponse(validationError, 400);
        }
        const newPassword = payload.newPassword as string;
        const passwordHash = await bcrypt.hash(newPassword, 12);
        client = await pool.connect();
        await client.query("BEGIN");
        transactionStarted = true;
        const actorResult = await client.query<ActorRow>(
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
                     AND p.code = 'users.reset_password'
               )
             FOR UPDATE OF u`,
            [session.userId]
        );
        const actor = actorResult.rows[0];
        if (!actor) {
            await client.query("ROLLBACK");
            transactionStarted = false;
            return errorResponse(
                "ليس لديك صلاحية إعادة تعيين كلمات المرور.",
                403
            );
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
            return errorResponse(
                "انتهت صلاحية الجلسة. يرجى تسجيل الدخول مجددًا.",
                401
            );
        }
        const targetResult = await client.query<TargetRow>(
            `SELECT id, username, is_active, password_hash
             FROM public.users
             WHERE id = $1
             FOR UPDATE`,
            [id]
        );
        const target = targetResult.rows[0];
        if (!target) {
            await client.query("ROLLBACK");
            transactionStarted = false;
            return errorResponse("المستخدم المطلوب غير موجود.", 404);
        }
        if (String(actor.id) === String(target.id)) {
            await client.query("ROLLBACK");
            transactionStarted = false;
            return errorResponse(
                "لا يمكنك إعادة تعيين كلمة مرور حسابك الشخصي.",
                403
            );
        }
        if (!target.is_active) {
            await client.query("ROLLBACK");
            transactionStarted = false;
            return errorResponse(
                "لا يمكن إعادة تعيين كلمة مرور حساب معطّل. يجب تفعيله أولًا.",
                409
            );
        }
        const samePassword = await bcrypt.compare(
            newPassword,
            target.password_hash
        );
        if (samePassword) {
            await client.query("ROLLBACK");
            transactionStarted = false;
            return errorResponse(
                "يجب اختيار كلمة مرور مختلفة عن كلمة المرور الحالية.",
                400
            );
        }
        await client.query(
            `UPDATE public.users
             SET password_hash = $1,
                 must_change_password = TRUE,
                 updated_at = NOW()
             WHERE id = $2`,
            [passwordHash, id]
        );
        await client.query(
            `UPDATE public.user_sessions
             SET revoked_at = NOW(),
                 revocation_reason = 'password_reset_by_admin'
             WHERE user_id = $1
               AND revoked_at IS NULL`,
            [id]
        );
        await client.query(
            `INSERT INTO public.audit_logs (
                user_id,
                actor_username,
                action,
                entity_type,
                entity_id,
                success
            )
            VALUES ($1, $2, $3, $4, $5, TRUE)`,
            [
                actor.id,
                actor.username,
                "users.password_reset",
                "users",
                id,
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
            message: "تمت إعادة تعيين كلمة المرور وإلغاء جلسات المستخدم بنجاح.",
            userId: id,
        });
    } catch (error) {
        if (client && transactionStarted && !commitOutcomeUnknown) {
            try {
                await client.query("ROLLBACK");
                transactionStarted = false;
            } catch (rollbackError) {
                discardConnection = true;
                console.error("Password reset rollback failed:", {
                    code: getErrorCode(rollbackError),
                });
            }
        }
        if (commitOutcomeUnknown) {
            return errorResponse(
                "تعذر التأكد من نتيجة العملية. راجع حالة الحساب قبل إعادة المحاولة.",
                503
            );
        }
        console.error("Password reset API failed:", {
            code: getErrorCode(error),
        });
        return errorResponse(
            "تعذرت إعادة تعيين كلمة المرور حاليًا.",
            500
        );
    } finally {
        client?.release(discardConnection);
    }
}
