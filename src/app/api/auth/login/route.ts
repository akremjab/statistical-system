
import "server-only";

import { NextResponse } from "next/server";

import pool from "@/lib/db";
import { AUTH_CONFIG } from "@/lib/auth-config";
import { verifyUserCredentials } from "@/lib/auth-user";
import { createUserSession } from "@/lib/auth-session";
import {
    checkLoginRateLimit,
    recordLoginAttempt,
} from "@/lib/login-rate-limit";

export const runtime = "nodejs";


export async function POST(request: Request) {
    let client;
    let transactionStarted = false;

    try {
        // التأكد أن الطلب صادر من نفس موقع المنظومة
        const origin = request.headers.get("origin");

        if (!origin || origin === "null") {
            return NextResponse.json(
                { error: "طلب غير مسموح به" },
                { status: 403 }
            );
        }


        const configuredOrigins = (
            process.env.AUTH_ALLOWED_ORIGINS ?? ""
        )
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean);

        const allowedOrigins = new Set(
            configuredOrigins.flatMap((value) => {
                try {
                    const url = new URL(value);

                    if (
                        !["http:", "https:"].includes(url.protocol) ||
                        url.username ||
                        url.password ||
                        url.pathname !== "/" ||
                        url.search ||
                        url.hash
                    ) {
                        return [];
                    }

                    return [url.origin];
                } catch {
                    return [];
                }
            })
        );

        if (!allowedOrigins.has(origin)) {
            return NextResponse.json(
                { error: "طلب غير مسموح به" },
                { status: 403 }
            );
        }


        const body = await request.json();


        const username = body?.username;
        const password = body?.password;

        if (
            typeof username !== "string" ||
            typeof password !== "string" ||
            !/^[a-zA-Z0-9_]{3,50}$/.test(username) ||
            password.length === 0 ||
            password.length > 1024
        ) {
            return NextResponse.json(
                { error: "اسم المستخدم أو كلمة المرور غير صحيحة" },
                { status: 401 }
            );
        }

        client = await pool.connect();


        await client.query("BEGIN");
        transactionStarted = true;

        // فحص عدد المحاولات مع قفل يمنع تجاوز الحد بالتزامن.
        const loginAllowed = await checkLoginRateLimit(
            client,
            username
        );

        if (!loginAllowed) {
            await client.query("COMMIT");
            transactionStarted = false;

            return NextResponse.json(
                {
                    error: "تعذر تسجيل الدخول حاليًا. حاول مرة أخرى لاحقًا",
                },
                { status: 429 }
            );
        }

        // التحقق من اسم المستخدم وكلمة المرور.
        const user = await verifyUserCredentials(
            client,
            username,
            password
        );

        if (!user) {
            // نحفظ المحاولة الفاشلة حتى لا تضيع مع ROLLBACK.
            await recordLoginAttempt(client, username, false);

            await client.query("COMMIT");
            transactionStarted = false;

            return NextResponse.json(
                {
                    error: "اسم المستخدم أو كلمة المرور غير صحيحة",
                },
                { status: 401 }
            );
        }

        // تسجيل نجاح التحقق داخل نفس المعاملة.
        await recordLoginAttempt(client, username, true);


        const session = await createUserSession(client, {
            userId: user.id,
            userAgent: request.headers.get("user-agent"),
        });

        await client.query(
            `
      UPDATE public.users
      SET last_login_at = NOW()
      WHERE id = $1
      `,
            [user.id]
        );

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
      VALUES ($1, $2, $3, $4, $5, true)
      `,
            [
                user.id,
                user.username,
                "auth.login",
                "users",
                String(user.id),
            ]
        );

        await client.query("COMMIT");
        transactionStarted = false;

        const response = NextResponse.json({
            success: true,
            mustChangePassword: user.must_change_password,
            redirectTo: user.must_change_password
                ? AUTH_CONFIG.changePasswordPath
                : AUTH_CONFIG.dashboardPath,
        });

        response.cookies.set(
            AUTH_CONFIG.cookieName,
            session.token,
            {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "strict",
                path: "/",
                expires: session.expiresAt,
            }
        );

        return response;
    } catch (error) {
        if (client && transactionStarted) {
            await client.query("ROLLBACK").catch(() => { });
        }

        console.error("Login failed:", error);

        return NextResponse.json(
            { error: "تعذر تسجيل الدخول حاليًا" },
            { status: 500 }
        );
    } finally {
        client?.release();
    }
}
