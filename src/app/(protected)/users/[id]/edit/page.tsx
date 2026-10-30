
import "server-only";
import Link from "next/link";
import { notFound } from "next/navigation";
import GovernmentLayout from "@/components/GovernmentLayout";
import EditUserForm from "./EditUserForm";
import { getCurrentSession } from "@/lib/current-session";
import pool from "@/lib/db";
import { getUserPermissions, hasPermission } from "@/lib/permissions";
type EditUserPageProps = {
    params: Promise<{ id: string }>;
};
type UserRecord = {
    id: string;
    username: string;
    full_name: string;
};
export default async function EditUserPage({ params }: EditUserPageProps) {
    const session = await getCurrentSession();
    if (!session) {
        return null;
    }
    if (session.mustChangePassword) {
        return (
            <main dir="rtl" style={{ padding: 24 }}>
                <h2>يلزم تغيير كلمة المرور</h2>
                <p>يرجى تغيير كلمة المرور قبل متابعة استخدام المنظومة.</p>
            </main>
        );
    }
    const allowed = await hasPermission("users.edit");
    if (!allowed) {
        return (
            <main dir="rtl" style={{ padding: 24 }}>
                <h2>غير مصرح بالوصول</h2>
                <p>ليس لديك صلاحية تعديل بيانات المستخدمين.</p>
            </main>
        );
    }
    const { id } = await params;
    if (!/^[1-9][0-9]*$/.test(id)) {
        notFound();
    }
    if (BigInt(id) > BigInt("9223372036854775807")) {
        notFound();
    }
    const result = await pool.query<UserRecord>(
        `SELECT id, username, full_name
         FROM public.users
         WHERE id = $1
         LIMIT 1`,
        [id]
    );
    const account = result.rows[0];
    if (!account) {
        notFound();
    }
    const permissions = await getUserPermissions(session.userId);
    const currentUser = {
        id: session.userId,
        username: session.username,
        fullName: session.fullName,
    };

    return (
        <GovernmentLayout user={currentUser} permissions={permissions}>
            <main
                className="gov-main-content"
                dir="rtl"
                style={{ padding: 24, flex: 1, minWidth: 0 }}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 16,
                        flexWrap: "wrap",
                        marginBottom: 24,
                    }}
                >
                    <div>
                        <h1 style={{ margin: 0, color: "#17365d" }}>
                            تعديل بيانات المستخدم
                        </h1>
                        <p style={{ color: "#64748b", marginTop: 12 }}>
                            تعديل الاسم الكامل واسم المستخدم فقط.
                        </p>
                    </div>
                    <Link
                        href={`/users/${account.id}`}
                        style={{
                            padding: "11px 20px",
                            background: "#ffffff",
                            border: "1px solid #cbd5e1",
                            borderRadius: 8,
                            color: "#17365d",
                            textDecoration: "none",
                            fontSize: 13,
                            fontWeight: 700,
                        }}
                    >
                        العودة إلى تفاصيل المستخدم
                    </Link>
                </div>
                <section
                    style={{
                        background: "#ffffff",
                        border: "1px solid #e2e8f0",
                        borderRadius: 12,
                        padding: 24,
                        maxWidth: 720,
                    }}
                >
                    <h2
                        style={{
                            margin: "0 0 24px",
                            color: "#17365d",
                            fontSize: 18,
                        }}
                    >
                        البيانات الأساسية
                    </h2>
                    <EditUserForm
                        userId={String(account.id)}
                        initialFullName={account.full_name}
                        initialUsername={account.username}
                    />
                </section>
            </main>
        </GovernmentLayout>
    );
}
