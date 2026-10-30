// صفحة تعديل الجهة الإدارية: التحقق من المستخدم وصلاحية التعديل وتحميل بيانات الجهة.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import GovernmentLayout from "@/components/GovernmentLayout";
import { getCurrentSession } from "@/lib/current-session";
import { getUserPermissions, hasPermission } from "@/lib/permissions";
import { AUTH_CONFIG } from "@/lib/auth-config";
import pool from "@/lib/db";
// استيراد نموذج تعديل الجهة الإدارية لعرض بياناتها الحالية.
import EditEntityForm from "./EditEntityForm";
type PageProps = {
    params: Promise<{ id: string }>;
};

type EntityRow = {
    id: string;
    name: string;
    entity_type: string;
    city: string;
    has_independent_financial_liability: boolean;
    notes: string | null;
};

export default async function EditEntityPage({ params }: PageProps) {
    const session = await getCurrentSession();
    if (!session) redirect(AUTH_CONFIG.loginPath);
    if (session.mustChangePassword) redirect(AUTH_CONFIG.changePasswordPath);
    if (!(await hasPermission("entities.edit"))) redirect("/unauthorized");

    const { id } = await params;
    if (!/^[1-9]\d*$/.test(id)) notFound();

    const result = await pool.query<EntityRow>(
        `SELECT
            id::text AS id,
            name,
            entity_type,
            city,
            has_independent_financial_liability,
            notes
         FROM public.administrative_entities
         WHERE id = $1::bigint`,
        [id]
    );

    const entity = result.rows[0];
    if (!entity) notFound();

    const permissions = await getUserPermissions(session.userId);
    const user = {
        id: session.userId,
        username: session.username,
        fullName: session.fullName,
        accountType: session.accountType
    };

    return (
        <GovernmentLayout user={user} permissions={permissions}>
            <main className="gov-main-content" dir="rtl" style={{ padding: 24, flex: 1, minWidth: 0 }}>
                <h1 style={{ margin: 0, color: "#17365d", fontSize: 24 }}>
                    تعديل الجهة الإدارية
                </h1>
                <p style={{ marginTop: 12, color: "#64748b", fontSize: 14 }}>
                    الجهة المحددة: {entity.name}
                </p>
                <section style={{ marginTop: 24, padding: 20, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12 }}>
                    <h2 style={{ margin: 0, color: "#17365d", fontSize: 17 }}>
                        بيانات الجهة الإدارية
                    </h2>
                    {/* عرض نموذج التعديل بالبيانات الحقيقية للجهة المحددة. */}
                    <div style={{ marginTop: 20 }}>
                        <EditEntityForm entity={entity} />
                    </div>
                </section>
                <Link
                    href="/employee-committees/entities"
                    style={{ display: "inline-block", marginTop: 20, padding: "11px 20px", background: "#17365d", color: "#fff", borderRadius: 8, textDecoration: "none", fontSize: 13, fontWeight: 700 }}
                >
                    العودة إلى الجهات الإدارية
                </Link>
            </main>
        </GovernmentLayout>
    );
}