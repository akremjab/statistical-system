
import "server-only";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcrypt";

import pool from "@/lib/db";
import { AUTH_CONFIG } from "@/lib/auth-config";
import { hashSessionToken } from "@/lib/session-token";
import { validateNewPassword } from "@/lib/password-policy";
import {
    checkPasswordChangeRateLimit,
    recordPasswordChangeFailure,
} from "@/lib/login-rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
    let client;
    let transactionStarted = false;

    try {
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
                { error: "طلب غير مسموح به" },
                { status: 403 }
            );
        }

        // قراءة رمز الجلسة من الكوكي
        const cookieStore = await cookies();
        const token = cookieStore.get(
            AUTH_CONFIG.cookieName
        )?.value;

        if (!token || !/^[a-f0-9]{64}$/.test(token)) {
            return NextResponse.json(
                { error: "يجب تسجيل الدخول أولًا" },
                { status: 401 }
            );
        }

        const body = await request.json();

        const currentPassword = body?.currentPassword;
        const newPassword = body?.newPassword;

        if (
            typeof currentPassword !== "string" ||
            currentPassword.length === 0 ||
            currentPassword.length > 1024
        ) {
            return NextResponse.json(
                { error: "كلمة المرور الحالية غير صحيحة" },
                { status: 400 }
            );
        }

        const validationError =
            validateNewPassword(newPassword);

        if (validationError) {
            return NextResponse.json(
                { error: validationError },
                { status: 400 }
            );
        }

        client = await pool.connect();

        await client.query("BEGIN");
        transactionStarted = true;

        const tokenHash = hashSessionToken(token);


        // قفل الجلسة والحساب أثناء تغيير كلمة المرور

        const result = await client.query<{
            user_id: number;
            username: string;
            password_hash: string;
        }>(
            `
    WITH locked_user AS MATERIALIZED (
        SELECT
            u.id,
            u.username,
            u.password_hash
        FROM public.users AS u
        WHERE u.id = (
            SELECT s.user_id
            FROM public.user_sessions AS s
            WHERE s.token_hash = $1
              AND s.revoked_at IS NULL
              AND s.expires_at > NOW()
        )
          AND u.is_active = TRUE
        FOR UPDATE
    )
    SELECT
        u.id AS user_id,
        u.username,
        u.password_hash
    FROM locked_user AS u
    INNER JOIN public.user_sessions AS s
      ON s.user_id = u.id
    WHERE s.token_hash = $1
      AND s.revoked_at IS NULL
      AND s.expires_at > NOW()
    FOR UPDATE OF s
    `,
            [tokenHash]
        );


        const user = result.rows[0];

        if (!user) {
            await client.query("ROLLBACK");
            transactionStarted = false;

            return NextResponse.json(
                { error: "انتهت الجلسة. يرجى تسجيل الدخول مجددًا" },
                { status: 401 }
            );
        }


        const passwordChangeAllowed =
            await checkPasswordChangeRateLimit(
                client,
                user.user_id
            );

        if (!passwordChangeAllowed) {
            await client.query("COMMIT");
            transactionStarted = false;

            return NextResponse.json(
                {
                    error: "تم تجاوز عدد المحاولات المسموح بها. حاول بعد 15 دقيقة.",
                },
                { status: 429 }
            );
        }

        const currentPasswordValid = await bcrypt.compare(
            currentPassword,
            user.password_hash
        );

        if (!currentPasswordValid) {
            await recordPasswordChangeFailure(
                client,
                user.user_id
            );

            await client.query("COMMIT");
            transactionStarted = false;

            return NextResponse.json(
                { error: "كلمة المرور الحالية غير صحيحة" },
                { status: 400 }
            );
        }


        const samePassword = await bcrypt.compare(
            newPassword,
            user.password_hash
        );

        if (samePassword) {
            await client.query("ROLLBACK");
            transactionStarted = false;

            return NextResponse.json(
                {
                    error: "يجب اختيار كلمة مرور مختلفة عن الحالية",
                },
                { status: 400 }
            );
        }

        // تشفير كلمة المرور الجديدة
        const newPasswordHash = await bcrypt.hash(
            newPassword,
            12
        );

        // تحديث الحساب وإلغاء إلزام تغيير كلمة المرور
        await client.query(
            `
            UPDATE public.users
            SET
                password_hash = $1,
                must_change_password = FALSE,
                updated_at = NOW()
            WHERE id = $2
            `,
            [newPasswordHash, user.user_id]
        );

        // إلغاء جميع الجلسات بعد تغيير كلمة المرور
        await client.query(
            `
            UPDATE public.user_sessions
            SET
                revoked_at = NOW(),
                revocation_reason = 'password_changed'
            WHERE user_id = $1
              AND revoked_at IS NULL
            `,
            [user.user_id]
        );

        // تسجيل العملية في سجل التدقيق
        await client.query(
            `
            INSERT INTO public.audit_logs (
                user_id,
                actor_username,
                action,
                entity_type,
                entity_id,
                success
            )
            VALUES ($1, $2, $3, $4, $5, TRUE)
            `,
            [
                user.user_id,
                user.username,
                "auth.password_changed",
                "users",
                String(user.user_id),
            ]
        );

        await client.query("COMMIT");
        transactionStarted = false;

        const response = NextResponse.json({
            success: true,
            message: "تم تغيير كلمة المرور بنجاح",
            redirectTo: AUTH_CONFIG.loginPath,
        });

        response.cookies.delete(AUTH_CONFIG.cookieName);

        return response;
    } catch (error) {
        if (client && transactionStarted) {
            await client.query("ROLLBACK").catch(() => { });
        }

        console.error("Change password failed:", error);

        return NextResponse.json(
            { error: "تعذر تغيير كلمة المرور حاليًا" },
            { status: 500 }
        );
    } finally {
        client?.release();
    }
}
