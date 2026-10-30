
import { NextRequest, NextResponse } from "next/server";

import pool from "@/lib/db";
import { getCurrentSession } from "@/lib/current-session";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest) {
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

        const body = await request.json().catch(() => null);
        const notificationId = body?.notificationId;

        if (
            typeof notificationId !== "number" ||
            !Number.isSafeInteger(notificationId) ||
            notificationId <= 0
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message: "معرّف الإشعار غير صالح.",
                },
                { status: 400 }
            );
        }

        const result = await pool.query(
            `
            UPDATE public.notifications
            SET dismissed_at = NOW()
            WHERE id = $1
              AND user_id = $2
              AND dismissed_at IS NULL
            RETURNING id
            `,
            [notificationId, session.userId]
        );

        if (result.rowCount === 0) {
            return NextResponse.json(
                {
                    success: false,
                    message: "الإشعار غير موجود أو تم إخفاؤه مسبقًا.",
                },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            message: "تم إخفاء الإشعار بنجاح.",
        });
    } catch (error) {
        console.error("Clear notification error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "حدث خطأ أثناء إخفاء الإشعار.",
            },
            { status: 500 }
        );
    }
}
