
import { NextResponse } from "next/server";

import pool from "@/lib/db";
import { getCurrentSession } from "@/lib/current-session";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

export async function PATCH() {
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
                    message: "ليس لديك صلاحية إدارة الإشعارات.",
                },
                { status: 403 }
            );
        }

        const result = await pool.query(
            `
            UPDATE public.notifications
            SET dismissed_at = NOW()
            WHERE user_id = $1
              AND dismissed_at IS NULL
            `,
            [session.userId]
        );

        return NextResponse.json({
            success: true,
            message: "تم إخفاء جميع الإشعارات بنجاح.",
            clearedCount: result.rowCount ?? 0,
        });
    } catch (error) {
        console.error("Clear all notifications error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "حدث خطأ أثناء إخفاء الإشعارات.",
            },
            { status: 500 }
        );
    }
}
