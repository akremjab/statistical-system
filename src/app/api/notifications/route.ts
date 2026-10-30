
import { NextResponse } from "next/server";

import pool from "@/lib/db";
import { getCurrentSession } from "@/lib/current-session";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const session = await getCurrentSession();

        if (!session) {
            return NextResponse.json(
                {
                    success: false,
                    message: "يجب تسجيل الدخول أولاً.",
                },
                { status: 401 }
            );
        }

        if (session.mustChangePassword) {
            return NextResponse.json(
                {
                    success: false,
                    message: "يجب تغيير كلمة المرور قبل المتابعة.",
                },
                { status: 403 }
            );
        }

        const allowed = await hasPermission("contracts.view");

        if (!allowed) {
            return NextResponse.json(
                {
                    success: false,
                    message: "ليس لديك صلاحية عرض الإشعارات.",
                },
                { status: 403 }
            );
        }

        const result = await pool.query(
            `
            SELECT
                id,
                notification_type,
                title,
                message,
                entity_type,
                entity_id,
                is_read,
                read_at,
                created_at
            FROM public.notifications
            WHERE user_id = $1
              AND dismissed_at IS NULL
            ORDER BY created_at DESC, id DESC
            LIMIT 30
            `,
            [session.userId]
        );

        const countResult = await pool.query(
            `
            SELECT COUNT(*)::integer AS unread_count
            FROM public.notifications
            WHERE user_id = $1
              AND is_read = FALSE
              AND dismissed_at IS NULL
            `,
            [session.userId]
        );

        return NextResponse.json(
            {
                success: true,
                notifications: result.rows,
                unreadCount:
                    countResult.rows[0]?.unread_count ?? 0,
            },
            {
                status: 200,
                headers: {
                    "Cache-Control": "no-store",
                },
            }
        );
    } catch (error) {
        console.error("Notifications API error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "حدث خطأ أثناء جلب الإشعارات.",
            },
            { status: 500 }
        );
    }
}
