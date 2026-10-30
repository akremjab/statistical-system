
import "server-only";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import pool from "@/lib/db";
import { AUTH_CONFIG } from "@/lib/auth-config";
import { hashSessionToken } from "@/lib/session-token";

export const runtime = "nodejs";

export async function POST(request: Request) {
    try {
        // حماية الطلب من المواقع الخارجية
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

        const cookieStore = await cookies();
        const token = cookieStore.get(
            AUTH_CONFIG.cookieName
        )?.value;

        // إلغاء الجلسة من قاعدة البيانات
        if (token && /^[a-f0-9]{64}$/.test(token)) {
            const tokenHash = hashSessionToken(token);

            await pool.query(
                `
                UPDATE public.user_sessions
                SET
                    revoked_at = NOW(),
                    revocation_reason = 'logout'
                WHERE token_hash = $1
                  AND revoked_at IS NULL
                `,
                [tokenHash]
            );
        }

        // حذف كوكي الجلسة من المتصفح
        const response = NextResponse.json({
            success: true,
            redirectTo: AUTH_CONFIG.loginPath,
        });

        response.cookies.delete(AUTH_CONFIG.cookieName);

        return response;
    } catch (error) {
        console.error("Logout failed:", error);

        return NextResponse.json(
            { error: "تعذر تسجيل الخروج حاليًا" },
            { status: 500 }
        );
    }
}
