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
type DelegablePermission = {
    id: string;
    code: string;
};

async function getDelegablePermissions(
    client: PoolClient,
    actorId: string
): Promise<DelegablePermission[]> {
    const result = await client.query<DelegablePermission>(
        `SELECT p.id, p.code
         FROM public.user_permissions AS up
         INNER JOIN public.permissions AS p
             ON p.id = up.permission_id
         WHERE up.user_id = $1
         ORDER BY p.code
         FOR UPDATE OF up`,
        [actorId]
    );
    return result.rows;
}
type PermissionRecord = {
    id: string;
    code: string;
    name_ar: string;
    description: string | null;
    granted: boolean;
};

function respond(error: string, status: number) {
    return NextResponse.json({ success: false, error }, { status });
}

export async function GET(_request: Request, context: RouteContext) {
    try {
        const session = await getCurrentSession();
        if (!session) {
            return respond("يجب تسجيل الدخول أولًا.", 401);
        }
        if (session.mustChangePassword) {
            return respond("يجب تغيير كلمة المرور قبل المتابعة.", 403);
        }
        if (!(await hasPermission("users.manage_permissions"))) {
            return respond("ليس لديك صلاحية إدارة صلاحيات المستخدمين.", 403);
        }

        const { id } = await context.params;
        if (!/^[1-9][0-9]*$/.test(id) || BigInt(id) > BigInt("9223372036854775807")) {
            return respond("معرّف المستخدم غير صالح.", 400);
        }

        const accountResult = await pool.query<{
            id: string;
            username: string;
            account_type: "system_admin" | "standard";
            is_active: boolean;
        }>(
            `SELECT id, username, account_type, is_active
             FROM public.users
             WHERE id = $1
             LIMIT 1`,
            [id]
        );

        const account = accountResult.rows[0];
        if (!account) {
            return respond("المستخدم المطلوب غير موجود.", 404);
        }

        const result = await pool.query<PermissionRecord>(
            `SELECT
                p.id,
                p.code,
                p.name_ar,
                p.description,
                (up.user_id IS NOT NULL) AS granted
             FROM public.permissions AS p
             LEFT JOIN public.user_permissions AS up
                ON up.permission_id = p.id
                AND up.user_id = $1
             ORDER BY p.code`,
            [id]
        );

        return NextResponse.json({
            success: true,
            account: {
                id: account.id,
                username: account.username,
                accountType: account.account_type,
                isActive: account.is_active,
                protected: account.account_type === "system_admin",
            },
            permissions: result.rows,
        });
    } catch (error) {
        console.error("User permissions GET failed:", error);
        return respond("تعذر تحميل صلاحيات المستخدم حاليًا.", 500);
    }
}






type PermissionActorRecord = {
    id: string;
    username: string;
};

type PermissionTargetRecord = {
    id: string;
    username: string;
    account_type: "system_admin" | "standard";
    is_active: boolean;
};
type PermissionsPayload = {
    permissionCodes: string[];
    expectedPermissionCodes: string[];
};

function isPermissionsPayload(value: unknown): value is PermissionsPayload {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }
    const data = value as Record<string, unknown>;
    if (
        Object.keys(data).length !== 2 ||
        !Array.isArray(data.permissionCodes) ||
        !Array.isArray(data.expectedPermissionCodes)
    ) {
        return false;
    }
    if (
        data.permissionCodes.length > 100 ||
        data.expectedPermissionCodes.length > 100
    ) {
        return false;
    }
    const isValidCode = (code: unknown) =>
        typeof code === "string" &&
        /^[a-z][a-z0-9_.]{0,99}$/.test(code);

    return (
        data.permissionCodes.every(isValidCode) &&
        data.expectedPermissionCodes.every(isValidCode) &&
        new Set(data.permissionCodes).size === data.permissionCodes.length &&
        new Set(data.expectedPermissionCodes).size === data.expectedPermissionCodes.length
    );
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
        if (!(await hasPermission("users.manage_permissions"))) {
            return respond("ليس لديك صلاحية إدارة صلاحيات المستخدمين.", 403);
        }
        const { id } = await context.params;
        if (!/^[1-9][0-9]*$/.test(id) || BigInt(id) > BigInt("9223372036854775807")) {
            return respond("معرّف المستخدم غير صالح.", 400);
        }
        if (String(session.userId) === id) {
            return respond("لا يمكنك تعديل صلاحيات حسابك الشخصي.", 403);
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
        if (!isPermissionsPayload(body)) {
            return respond("قائمة الصلاحيات المرسلة غير صالحة.", 400);
        }
        client = await pool.connect();
        await client.query("BEGIN");
        transactionStarted = true;
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query("SET LOCAL statement_timeout = '15s'");

        const actorResult = await client.query<PermissionActorRecord>(
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
                     AND p.code = 'users.manage_permissions'
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

        const targetResult = await client.query<PermissionTargetRecord>(
            `SELECT id, username, account_type, is_active
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

        if (String(actor.id) === String(target.id)) {
            await client.query("ROLLBACK");
            transactionStarted = false;
            return respond("لا يمكنك تعديل صلاحيات حسابك الشخصي.", 403);
        }

        if (target.account_type === "system_admin") {
            await client.query("ROLLBACK");
            transactionStarted = false;
            return respond("صلاحيات مدير المنظومة محمية ولا يمكن تعديلها.", 403);
        }

        const delegablePermissions = await getDelegablePermissions(client, actor.id);
        const delegableCodes = new Set(delegablePermissions.map((permission) => permission.code));

        if (!delegableCodes.has("users.manage_permissions")) {
            await client.query("ROLLBACK");
            transactionStarted = false;
            return respond("لم تعد لديك صلاحية إدارة صلاحيات المستخدمين.", 403);
        }

        const currentPermissionsResult = await client.query<{ code: string }>(
            `SELECT p.code
             FROM public.user_permissions AS up
             INNER JOIN public.permissions AS p
                 ON p.id = up.permission_id
                      WHERE up.user_id = $1
         ORDER BY p.code
         FOR UPDATE OF up`,
            [id]
        );

        const currentCodes = new Set(currentPermissionsResult.rows.map((row) => row.code));
        const requestedCodes = new Set(body.permissionCodes);
        const expectedCodes = new Set(body.expectedPermissionCodes);

        const permissionsChangedSinceLoad =
            currentCodes.size !== expectedCodes.size ||
            [...currentCodes].some((code) => !expectedCodes.has(code));

        if (permissionsChangedSinceLoad) {
            await client.query("ROLLBACK");
            transactionStarted = false;
            return respond(
                "تم تعديل صلاحيات هذا المستخدم من جلسة أخرى. يرجى تحديث الصفحة ومراجعة الصلاحيات قبل الحفظ.",
                409
            );
        }

        const unknownPermissionsResult = await client.query<{ code: string }>(
            `SELECT requested.code
             FROM UNNEST($1::text[]) AS requested(code)
             LEFT JOIN public.permissions AS p
                 ON p.code = requested.code
             WHERE p.id IS NULL`,
            [body.permissionCodes]
        );

        if (unknownPermissionsResult.rows.length > 0) {
            await client.query("ROLLBACK");
            transactionStarted = false;
            return respond("قائمة الصلاحيات تحتوي على صلاحيات غير معروفة.", 400);
        }

        const addedCodes = [...requestedCodes].filter((code) => !currentCodes.has(code));
        const removedCodes = [...currentCodes].filter((code) => !requestedCodes.has(code));
        const changedCodes = [...addedCodes, ...removedCodes];

        const unauthorizedChanges = changedCodes.filter((code) => !delegableCodes.has(code));

        if (unauthorizedChanges.length > 0) {
            await client.query("ROLLBACK");
            transactionStarted = false;
            return respond("لا يمكنك منح أو سحب صلاحيات لا تمتلكها.", 403);
        }

        const finalCodes = [...requestedCodes].sort();

        if (changedCodes.length === 0) {
            await client.query("ROLLBACK");
            transactionStarted = false;
            return NextResponse.json({
                success: true,
                changed: false,
                message: "لا توجد تغييرات جديدة في الصلاحيات.",
                userId: id,
            });
        }

        const permissionsToAdd = delegablePermissions
            .filter((permission) => addedCodes.includes(permission.code))
            .map((permission) => permission.id);

        const permissionsToRemove = delegablePermissions
            .filter((permission) => removedCodes.includes(permission.code))
            .map((permission) => permission.id);

        if (permissionsToRemove.length > 0) {
            await client.query(
                `DELETE FROM public.user_permissions
                 WHERE user_id = $1
                   AND permission_id = ANY($2::bigint[])`,
                [id, permissionsToRemove]
            );
        }

        if (permissionsToAdd.length > 0) {
            await client.query(
                `INSERT INTO public.user_permissions (
                    user_id,
                    permission_id,
                    granted_by
                 )
                 SELECT $1, p.id, $3
                 FROM public.permissions AS p
                 WHERE p.id = ANY($2::bigint[])`,
                [id, permissionsToAdd, actor.id]
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
             VALUES (
                $1, $2, $3, $4, $5,
                $6::jsonb, $7::jsonb, TRUE
             )`,
            [
                actor.id,
                actor.username,
                "users.permissions_updated",
                "users",
                id,
                JSON.stringify({
                    permissions: [...currentCodes].sort(),
                }),
                JSON.stringify({
                    permissions: finalCodes,
                    added: addedCodes.sort(),
                    removed: removedCodes.sort(),
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
            message: "تم تحديث صلاحيات المستخدم بنجاح.",
            userId: id,
            addedCount: addedCodes.length,
            removedCount: removedCodes.length,
        });
    } catch (error) {
        if (client && transactionStarted && !commitOutcomeUnknown) {
            try {
                await client.query("ROLLBACK");
                transactionStarted = false;
            } catch (rollbackError) {
                discardConnection = true;
                console.error("User permissions rollback failed:", rollbackError);
            }
        }
        if (commitOutcomeUnknown) {
            console.error("User permissions COMMIT outcome unknown");
            return respond(
                "تعذر التأكد من نتيجة الحفظ. يرجى تحديث الصفحة ومراجعة الصلاحيات قبل إعادة المحاولة.",
                503
            );
        }
        console.error("User permissions PATCH failed:", error);

        const databaseError = error as { code?: string };

        if (databaseError?.code === "55P03" || databaseError?.code === "57014") {
            return respond(
                "قاعدة البيانات مشغولة حاليًا أو تجاوزت العملية المهلة المحددة. يرجى تحديث الصفحة ومراجعة الصلاحيات قبل إعادة المحاولة.",
                503
            );
        }

        return respond("تعذر معالجة طلب الصلاحيات حاليًا.", 500);
    } finally {
        client?.release(discardConnection);
    }
}