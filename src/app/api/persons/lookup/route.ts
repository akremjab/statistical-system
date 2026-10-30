
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getCurrentSession } from "@/lib/current-session";
import { hasPermission } from "@/lib/permissions";

// البحث عن بيانات شخص موجود قبل إنشاء عقد جديد له.
export async function GET(request: Request) {
    const session = await getCurrentSession();

    if (!session) {
        return NextResponse.json(
            { success: false, message: "يجب تسجيل الدخول أولاً." },
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

    const allowed = await hasPermission("contracts.create");

    if (!allowed) {
        return NextResponse.json(
            {
                success: false,
                message: "ليس لديك صلاحية البحث عن بيانات الأشخاص.",
            },
            { status: 403 }
        );
    }

    // قراءة الرقم الوطني من عنوان الطلب.
    const { searchParams } = new URL(request.url);
    const nationalNumber = searchParams.get("nationalNumber")?.trim();

    // التحقق من وجود الرقم الوطني وطوله المسموح.
    if (!nationalNumber || nationalNumber.length > 30) {
        return NextResponse.json(
            {
                success: false,
                message: "يجب إدخال رقم وطني صالح لا يتجاوز 30 حرفًا.",
            },
            { status: 400 }
        );
    }

    // البحث عن الشخص باستخدام الرقم الوطني.
    try {
        const result = await pool.query<{
            id: string;
            national_id: string;
            full_name: string;
            qualification: string;
            specialization: string | null;
            version: string;
        }>(
            `
            SELECT
                id,
                national_id,
                full_name,
                qualification,
                specialization,
                md5(
                    jsonb_build_array(
                        full_name,
                        qualification,
                        specialization
                    )::text
                ) AS version
            FROM public.persons
            WHERE national_id = $1
            LIMIT 1
            `,
            [nationalNumber]
        );

        // الرقم الوطني غير مسجل في قاعدة البيانات.
        if (result.rows.length === 0) {
            return NextResponse.json({
                success: true,
                exists: false,
                person: null,
            });
        }

        const person = result.rows[0];

        // إرجاع البيانات الحالية مع بصمتها دون تعديلها.
        return NextResponse.json({
            success: true,
            exists: true,
            person: {
                id: person.id,
                nationalNumber: person.national_id,
                fullName: person.full_name,
                qualification: person.qualification,
                specialization: person.specialization ?? "",
                version: person.version,
            },
        });
    } catch (error) {
        console.error("Person lookup error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "حدث خطأ أثناء البحث عن بيانات الشخص.",
            },
            { status: 500 }
        );
    }
}
