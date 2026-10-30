import Link from "next/link";
import NewUserForm from "./NewUserForm";
import GovernmentLayout from "@/components/GovernmentLayout";
import { getCurrentSession } from "@/lib/current-session";
import {
    getUserPermissions,
    hasPermission,
} from "@/lib/permissions";

export default async function NewUserPage() {
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

    const allowed = await hasPermission("users.create");

    if (!allowed) {
        return (
            <main dir="rtl" style={{ padding: 24 }}>
                <h2>غير مصرح بالوصول</h2>
                <p>ليس لديك صلاحية إضافة مستخدمين.</p>
            </main>
        );
    }

    const permissions = await getUserPermissions(session.userId);

    const user = {
        id: session.userId,
        username: session.username,
        fullName: session.fullName,
    };

    return (
        <GovernmentLayout user={user} permissions={permissions}>
            <main
                className="gov-main-content"
                dir="rtl"
                style={{
                    padding: 24,
                    flex: 1,
                    minWidth: 0,
                }}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 16,
                        flexWrap: "wrap",
                    }}
                >
                    <div>
                        <h1
                            style={{
                                margin: 0,
                                color: "#17365d",
                            }}
                        >
                            إضافة مستخدم جديد
                        </h1>

                        <p
                            style={{
                                color: "#64748b",
                                marginTop: 12,
                            }}
                        >
                            إنشاء حساب جديد لأحد مستخدمي المنظومة.
                        </p>
                    </div>

                    <Link
                        href="/users"
                        style={{
                            padding: "11px 18px",
                            background: "#ffffff",
                            border: "1px solid #cbd5e1",
                            borderRadius: 8,
                            color: "#334155",
                            textDecoration: "none",
                            fontSize: 13,
                            fontWeight: 600,
                        }}
                    >
                        العودة إلى المستخدمين
                    </Link>
                </div>

                <section
                    style={{
                        marginTop: 24,
                        padding: 24,
                        background: "#ffffff",
                        border: "1px solid #e2e8f0",
                        borderRadius: 12,
                    }}
                >
                    <h2
                        style={{
                            margin: 0,
                            color: "#17365d",
                            fontSize: 18,
                        }}
                    >
                        بيانات المستخدم الجديد
                    </h2>

                    <div style={{ marginTop: 24 }}>
                        <NewUserForm />
                    </div>
                </section>
            </main>
        </GovernmentLayout>
    );
}