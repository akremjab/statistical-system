import "server-only";

import { NextResponse } from "next/server";

import pool from "@/lib/db";
import { getCurrentSession } from "@/lib/current-session";
import { hasPermission } from "@/lib/permissions";

export const runtime = "nodejs";

// استجابة موحدة للأخطاء دون كشف تفاصيل النظام الداخلية.
function respond(error: string, status: number) {
    return NextResponse.json(
        { success: false, error },
        { status }
    );
}

// جلب الجهات الإدارية التي يجوز تكليف المندوبين بها.
// هذا المسار مستقل عن API إدارة الجهات الإدارية العامة.
export async function GET() {
    try {
        // منع الوصول دون جلسة مستخدم صالحة.
        const session = await getCurrentSession();

        if (!session) {
            return respond("يجب تسجيل الدخول أولًا.", 401);
        }

        if (session.mustChangePassword) {
            return respond(
                "يجب تغيير كلمة المرور قبل المتابعة.",
                403
            );
        }

        // عرض الجهات متاح لمن يملك صلاحية عرض التكليفات أو إنشائها.
        const canView = await hasPermission(
            "delegates.assignments.view"
        );

        const canCreate = await hasPermission(
            "delegates.assignments.create"
        );

        if (!canView && !canCreate) {
            return respond(
                "ليس لديك صلاحية الاطلاع على جهات التكليف.",
                403
            );
        }

        // التصفية داخل قاعدة البيانات تضمن عدم إرجاع
        // أي جهة لا تتمتع بذمة مالية مستقلة.
        const result = await pool.query<{
            id: string;
            name: string;
        }>(
            `SELECT
                id::text AS id,
                name
             FROM public.administrative_entities
             WHERE has_independent_financial_liability = TRUE
             ORDER BY name ASC, id ASC`
        );

        // منع تخزين نتائج القوائم مؤقتًا حتى تظهر التغييرات الحديثة.
        return NextResponse.json(
            {
                success: true,
                entities: result.rows,
            },
            {
                headers: {
                    "Cache-Control": "no-store",
                },
            }
        );
    } catch (error) {
        const errorCode =
            typeof error === "object" &&
                error !== null &&
                "code" in error &&
                typeof error.code === "string"
                ? error.code
                : "UNKNOWN";

        // تسجيل رمز الخطأ داخليًا دون كشف تفاصيل PostgreSQL.
        console.error("Eligible assignment entities API failed:", {
            code: errorCode,
            operation: "delegates.assignments.entities.list",
        });

        return respond(
            "تعذر تحميل الجهات الإدارية المؤهلة حاليًا.",
            500
        );
    }
}