import Link from "next/link";
import { redirect } from "next/navigation";
import GovernmentLayout from "@/components/GovernmentLayout";
import { getCurrentSession } from "@/lib/current-session";
import { getUserPermissions, hasPermission } from "@/lib/permissions";
import { AUTH_CONFIG } from "@/lib/auth-config";
import NewEntityForm from "./NewEntityForm";

export default async function NewEntityPage() {
    const session = await getCurrentSession();
    if (!session) redirect(AUTH_CONFIG.loginPath);
    if (session.mustChangePassword) redirect(AUTH_CONFIG.changePasswordPath);
    if (!(await hasPermission("entities.create"))) redirect("/unauthorized");

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
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                    <div>
                        <h1 style={{ margin: 0, color: "#17365d" }}>إضافة جهة إدارية جديدة</h1>
                        <p style={{ color: "#64748b", marginTop: 12 }}>تسجيل جهة أو وحدة إدارية جديدة ضمن الجهات التابعة للدولة.</p>
                    </div>
                    <Link href="/employee-committees/entities" style={{ padding: "11px 18px", background: "#fff", border: "1px solid #cbd5e1", borderRadius: 8, color: "#334155", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>
                        العودة إلى الجهات الإدارية
                    </Link>
                </div>
                <section style={{ marginTop: 24, padding: 24, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12 }}>
                    <h2 style={{ margin: 0, color: "#17365d", fontSize: 18 }}>بيانات الجهة الإدارية</h2>
                    <div style={{ marginTop: 24 }}>
                        <NewEntityForm />
                    </div>
                </section>
            </main>
        </GovernmentLayout>
    );
}