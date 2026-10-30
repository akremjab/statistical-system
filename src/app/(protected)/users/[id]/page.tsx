import "server-only";
import Link from "next/link";
import { notFound } from "next/navigation";
import GovernmentLayout from "@/components/GovernmentLayout";
import UserStatusControl from "./UserStatusControl";
import ResetUserPasswordControl from "./ResetUserPasswordControl";
import { getCurrentSession } from "@/lib/current-session";
import pool from "@/lib/db";
import { getUserPermissions, hasPermission } from "@/lib/permissions";
type UserDetails = {
    id: string;
    account_type: "system_admin" | "standard";
    username: string;
    full_name: string;
    is_active: boolean;
    must_change_password: boolean;
    last_login_at: Date | null;
    created_at: Date;
    updated_at: Date;
};
type UserDetailsPageProps = {
    params: Promise<{ id: string }>;
};
const dateFormatter = new Intl.DateTimeFormat("ar-LY", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Tripoli",
});
function formatDate(value: Date | null): string {
    return value ? dateFormatter.format(new Date(value)) : "لا توجد بيانات";
}
const cardStyle = {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    padding: 24,
};
const labelStyle = {
    color: "#64748b",
    fontSize: 13,
    marginBottom: 8,
};
const valueStyle = {
    color: "#17365d",
    fontSize: 15,
    fontWeight: 600,
    overflowWrap: "anywhere" as const,
};
const gridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
    gap: 24,
};
const headingStyle = {
    margin: "0 0 22px",
    color: "#17365d",
    fontSize: 18,
};
export default async function UserDetailsPage({ params }: UserDetailsPageProps) {
    const session = await getCurrentSession();
    if (!session) return null;
    if (session.mustChangePassword) {
        return (
            <main dir="rtl" style={{ padding: 24 }}>
                <h2>يلزم تغيير كلمة المرور</h2>
                <p>يرجى تغيير كلمة المرور قبل متابعة استخدام المنظومة.</p>
            </main>
        );
    }
    if (!(await hasPermission("users.view"))) {
        return (
            <main dir="rtl" style={{ padding: 24 }}>
                <h2>غير مصرح بالوصول</h2>
                <p>ليس لديك صلاحية عرض تفاصيل المستخدمين.</p>
            </main>
        );
    }
    const { id } = await params;
    if (!/^[1-9][0-9]*$/.test(id)) notFound();
    if (BigInt(id) > BigInt("9223372036854775807")) notFound();
    const result = await pool.query<UserDetails>(
        `SELECT id, username, full_name, account_type, is_active, must_change_password,
                last_login_at, created_at, updated_at
         FROM public.users
         WHERE id = $1
         LIMIT 1`,
        [id]
    );
    const account = result.rows[0];
    if (!account) notFound();
    const permissions = await getUserPermissions(session.userId);
    const currentUser = {
        id: session.userId,
        username: session.username,
        fullName: session.fullName,
        accountType: session.accountType,
    };
    const canEditUser = permissions.includes("users.edit");
    const canManageStatus = permissions.includes("users.manage_status");
    const canResetPassword = permissions.includes("users.reset_password");
    const canManagePermissions = permissions.includes("users.manage_permissions");
    const isCurrentUser = String(account.id) === String(session.userId);
    return (
        <GovernmentLayout user={currentUser} permissions={permissions}>
            <main className="gov-main-content" dir="rtl" style={{ padding: 24, flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
                    <div>
                        <h1 style={{ margin: 0, color: "#17365d" }}>تفاصيل المستخدم</h1>
                        <p style={{ color: "#64748b", marginTop: 12 }}>عرض بيانات الحساب وحالته داخل المنظومة.</p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        {canEditUser && (
                            <Link href={`/users/${account.id}/edit`} style={{ padding: "11px 20px", background: "#1d4ed8", border: "1px solid #1d4ed8", borderRadius: 8, color: "#ffffff", textDecoration: "none", fontSize: 13, fontWeight: 700 }}>
                                تعديل البيانات
                            </Link>
                        )}
                        <Link href="/users" style={{ padding: "11px 20px", background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: 8, color: "#17365d", textDecoration: "none", fontSize: 13, fontWeight: 700 }}>
                            العودة إلى المستخدمين
                        </Link>
                    </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 430px), 1fr))", gap: 18, alignItems: "start" }}>
                    <section style={cardStyle}>
                        <h2 style={headingStyle}>البيانات الأساسية</h2>
                        <div style={gridStyle}>
                            <div>
                                <div style={labelStyle}>الاسم الكامل</div>
                                <div style={valueStyle}>{account.full_name}</div>
                            </div>
                            <div>
                                <div style={labelStyle}>اسم المستخدم</div>
                                <div style={{ ...valueStyle, direction: "ltr", textAlign: "right" }}>{account.username}</div>
                            </div>
                            <div>
                                <div style={labelStyle}>رقم الحساب</div>
                                <div style={valueStyle}>{account.id}</div>
                                <div>
                                    <div style={labelStyle}>نوع الحساب</div>
                                    <span
                                        style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            padding: "7px 12px",
                                            borderRadius: 8,
                                            background: account.account_type === "system_admin"
                                                ? "#edf3fc"
                                                : "#f1f5f9",
                                            border: "1px solid #dbe5f3",
                                            color: account.account_type === "system_admin"
                                                ? "#1d4ed8"
                                                : "#475569",
                                            fontSize: 13,
                                            fontWeight: 700,
                                        }}
                                    >
                                        {account.account_type === "system_admin"
                                            ? "🛡️ مدير المنظومة"
                                            : "مستخدم عادي"}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </section>
                    <section style={cardStyle}>
                        <h2 style={headingStyle}>حالة الحساب والأمان</h2>
                        <div style={gridStyle}>
                            <div>
                                <div style={labelStyle}>حالة الحساب</div>
                                <div style={{ ...valueStyle, color: account.is_active ? "#15803d" : "#b91c1c" }}>
                                    {account.is_active ? "نشط" : "معطل"}
                                </div>
                            </div>
                            <div>
                                <div style={labelStyle}>حالة كلمة المرور</div>
                                <div style={valueStyle}>
                                    {account.must_change_password ? "مطلوب تغيير كلمة المرور" : "لا يلزم تغيير كلمة المرور"}
                                </div>
                            </div>
                        </div>
                        {isCurrentUser && (
                            <div style={{ marginTop: 24 }}>
                                <Link
                                    href="/change-password"
                                    style={{
                                        display: "block",
                                        padding: "11px 20px",
                                        background: "#eff6ff",
                                        border: "1px solid #bfdbfe",
                                        borderRadius: 8,
                                        color: "#1d4ed8",
                                        textDecoration: "none",
                                        textAlign: "center",
                                        fontSize: 13,
                                        fontWeight: 700,
                                    }}
                                >
                                    تغيير كلمة المرور
                                </Link>
                            </div>
                        )}
                        {canManageStatus && (
                            <div style={{ marginTop: 24 }}>
                                <UserStatusControl
                                    userId={String(account.id)}
                                    username={account.username}
                                    isActive={account.is_active}
                                    isCurrentUser={isCurrentUser}
                                />
                            </div>
                        )}
                        {canResetPassword && !isCurrentUser && account.is_active && (
                            <div style={{ marginTop: 16 }}>
                                <ResetUserPasswordControl
                                    userId={String(account.id)}
                                    username={account.username}
                                    isActive={account.is_active}
                                    isCurrentUser={isCurrentUser}
                                />
                            </div>
                        )}
                    </section>
                    <section style={{ ...cardStyle, gridColumn: "1 / -1" }}>
                        <h2 style={headingStyle}>صلاحيات المستخدم</h2>
                        <p style={{ color: "#64748b", fontSize: 13, lineHeight: 1.8, margin: "0 0 18px" }}>
                            يمكنك الاطلاع على الصلاحيات الممنوحة لهذا الحساب وإدارتها وفقًا لمستوى التفويض المسموح به.
                        </p>
                        {canManagePermissions ? (
                            <div>
                                <Link
                                    href={`/users/${account.id}/permissions`}
                                    style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        padding: "11px 20px",
                                        background: "#eff6ff",
                                        border: "1px solid #bfdbfe",
                                        borderRadius: 8,
                                        color: "#1d4ed8",
                                        textDecoration: "none",
                                        fontSize: 13,
                                        fontWeight: 700,
                                    }}
                                >
                                    إدارة الصلاحيات
                                </Link>
                            </div>
                        ) : (
                            <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>
                                لا تملك صلاحية إدارة أذونات هذا الحساب.
                            </p>
                        )}
                    </section>
                    <section style={{ ...cardStyle, gridColumn: "1 / -1" }}>
                        <h2 style={headingStyle}>التواريخ والنشاط</h2>
                        <div style={gridStyle}>
                            <div>
                                <div style={labelStyle}>آخر تسجيل دخول</div>
                                <div style={valueStyle}>{account.last_login_at ? formatDate(account.last_login_at) : "لم يسجل الدخول"}</div>
                            </div>
                            <div>
                                <div style={labelStyle}>تاريخ إنشاء الحساب</div>
                                <div style={valueStyle}>{formatDate(account.created_at)}</div>
                            </div>
                            <div>
                                <div style={labelStyle}>آخر تحديث للحساب</div>
                                <div style={valueStyle}>{formatDate(account.updated_at)}</div>
                            </div>
                        </div>
                    </section>
                </div>
            </main>
        </GovernmentLayout>
    );
}
