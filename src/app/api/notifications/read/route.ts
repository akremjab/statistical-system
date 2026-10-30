
import { NextResponse } from "next/server";

import pool from "@/lib/db";
import { getCurrentSession } from "@/lib/current-session";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
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

        let body: unknown;

        try {
            body = await request.json();
        } catch {
            return NextResponse.json(
                {
                    success: false,
                    message: "بيانات الطلب غير صالحة.",
                },
                { status: 400 }
            );
        }

        if (
            typeof body !== "object" ||
            body === null ||
            Array.isArray(body) ||
            !("notificationId" in body)
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message: "معرّف الإشعار مطلوب.",
                },
                { status: 400 }
            );
        }

        const notificationId = body.notificationId;

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
            SET
                is_read = TRUE,
                read_at = NOW()
            WHERE id = $1
              AND user_id = $2
              AND is_read = FALSE
            RETURNING id
            `,
            [notificationId, session.userId]
        );

        if (result.rowCount === 0) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "الإشعار غير موجود أو سبق تحديده كمقروء.",
                },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            message: "تم تحديد الإشعار كمقروء.",
            notificationId,
        });
    } catch (error) {
        console.error("Notification read API error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "حدث خطأ أثناء تحديث الإشعار.",
            },
            { status: 500 }
        );
    }
}
