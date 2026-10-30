import GovernmentLayout from "@/components/GovernmentLayout";
import { getCurrentSession } from "@/lib/current-session";
import pool from "@/lib/db";
import Link from "next/link";

import {
    getUserPermissions,
    hasPermission,
} from "@/lib/permissions";
type UserRow = {
    id: string;
    username: string;
    full_name: string;
    is_active: boolean;
    must_change_password: boolean;
    last_login_at: Date | null;
    created_at: Date;
};
type UsersPageProps = {
    searchParams: Promise<{
        q?: string | string[];
    }>;
};

export default async function UsersPage({
    searchParams,
}: UsersPageProps) {
    const params = await searchParams;

    const search = (
        typeof params.q === "string" ? params.q : ""
    ).trim().slice(0, 100);
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

    const allowed = await hasPermission("users.view");

    if (!allowed) {
        return (
            <main dir="rtl" style={{ padding: 24 }}>
                <h2>غير مصرح بالوصول</h2>
                <p>ليس لديك صلاحية عرض المستخدمين.</p>
            </main>
        );
    }

    const permissions = await getUserPermissions(session.userId);
    const result = await pool.query<UserRow>(
        `
    SELECT
        id,
        username,
        full_name,
        is_active,
        must_change_password,
        last_login_at,
        created_at
    FROM public.users
    WHERE
        $1 = ''
        OR username ILIKE '%' || $1 || '%'
        OR full_name ILIKE '%' || $1 || '%'
    ORDER BY id ASC
    LIMIT 100
    `,
        [search]
    );

    const users = result.rows;
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
                        <h1 style={{ margin: 0, color: "#17365d" }}>
                            إدارة المستخدمين
                        </h1>

                        <p style={{ color: "#64748b", marginTop: 12 }}>
                            إدارة حسابات مستخدمي المنظومة وصلاحياتهم.
                        </p>
                    </div>

                    {permissions.includes("users.create") && (
                        <Link
                            href="/users/new"
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                padding: "11px 20px",
                                background: "#1d4ed8",
                                color: "#ffffff",
                                borderRadius: 8,
                                textDecoration: "none",
                                fontSize: 13,
                                fontWeight: 700,
                            }}
                        >
                            + إضافة مستخدم جديد
                        </Link>
                    )}
                </div>
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginTop: 24,
                        marginBottom: 12,
                    }}
                >
                    <h2
                        style={{
                            margin: 0,
                            fontSize: 17,
                            color: "#17365d",
                        }}
                    >
                        قائمة المستخدمين
                    </h2>

                    <span
                        style={{
                            padding: "7px 14px",
                            background: "#e8eef7",
                            color: "#17365d",
                            borderRadius: 8,
                            fontSize: 13,
                            fontWeight: 600,
                        }}
                    >
                        عدد المستخدمين المعروضين: {users.length}
                    </span>
                </div>
                <form
                    action="/users"
                    method="GET"
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        flexWrap: "wrap",
                        padding: 16,
                        marginBottom: 16,
                        background: "#ffffff",
                        border: "1px solid #e2e8f0",
                        borderRadius: 12,
                    }}
                >
                    <input
                        type="search"
                        name="q"
                        defaultValue={search}
                        placeholder="ابحث بالاسم الكامل أو اسم المستخدم..."
                        maxLength={100}
                        aria-label="البحث عن المستخدمين"
                        style={{
                            flex: "1 1 320px",
                            minWidth: 0,
                            padding: "12px 14px",
                            border: "1px solid #cbd5e1",
                            borderRadius: 8,
                            fontSize: 13,
                            outlineColor: "#2563eb",
                        }}
                    />

                    <button
                        type="submit"
                        style={{
                            padding: "12px 24px",
                            background: "#1d4ed8",
                            color: "#ffffff",
                            border: "none",
                            borderRadius: 8,
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: "pointer",
                        }}
                    >
                        بحث
                    </button>

                    {search && (
                        <Link
                            href="/users"
                            style={{
                                padding: "12px 18px",
                                border: "1px solid #cbd5e1",
                                borderRadius: 8,
                                color: "#475569",
                                textDecoration: "none",
                                fontSize: 13,
                            }}
                        >
                            مسح البحث
                        </Link>
                    )}
                </form>
                <div
                    style={{
                        marginTop: 24,
                        background: "#ffffff",
                        border: "1px solid #e2e8f0",
                        borderRadius: 12,
                        overflowX: "auto",
                    }}
                >
                    <table
                        style={{
                            width: "100%",
                            borderCollapse: "collapse",
                            textAlign: "right",
                            minWidth: 850,
                        }}
                    >
                        <thead style={{ background: "#f1f5f9" }}>
                            <tr>
                                {[
                                    "اسم المستخدم",
                                    "الاسم الكامل",
                                    "حالة الحساب",
                                    "كلمة المرور",
                                    "آخر تسجيل دخول",
                                    "تاريخ إنشاء الحساب",
                                ].map((heading) => (
                                    <th
                                        key={heading}
                                        style={{
                                            padding: 16,
                                            fontSize: 13,
                                            color: "#334155",
                                        }}
                                    >
                                        {heading}
                                    </th>
                                ))}
                            </tr>
                        </thead>

                        <tbody>
                            {users.map((account) => (
                                <tr
                                    key={account.id}
                                    style={{
                                        borderTop: "1px solid #e2e8f0",
                                    }}
                                >
                                    <td style={{ padding: 16 }}>
                                        <Link
                                            href={`/users/${account.id}`}
                                            style={{
                                                color: "#1d4ed8",
                                                fontWeight: 700,
                                                textDecoration: "none",
                                            }}
                                        >
                                            {account.username}
                                        </Link>
                                    </td>

                                    <td style={{ padding: 16 }}>
                                        {account.full_name}
                                    </td>

                                    <td style={{ padding: 16 }}>
                                        <span
                                            style={{
                                                color: account.is_active
                                                    ? "#15803d"
                                                    : "#b91c1c",
                                                fontWeight: 600,
                                            }}
                                        >
                                            {account.is_active ? "نشط" : "معطل"}
                                        </span>
                                    </td>

                                    <td style={{ padding: 16 }}>
                                        {account.must_change_password
                                            ? "مطلوب تغييرها"
                                            : "لا يلزم تغييرها"}
                                    </td>

                                    <td style={{ padding: 16 }}>
                                        {account.last_login_at
                                            ? new Intl.DateTimeFormat("ar-LY", {
                                                dateStyle: "medium",
                                                timeStyle: "short",
                                                timeZone: "Africa/Tripoli",
                                            }).format(
                                                new Date(account.last_login_at)
                                            )
                                            : "لم يسجل الدخول"}
                                    </td>

                                    <td style={{ padding: 16 }}>
                                        {new Intl.DateTimeFormat("ar-LY", {
                                            dateStyle: "medium",
                                            timeZone: "Africa/Tripoli",
                                        }).format(new Date(account.created_at))}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {users.length === 0 && (
                        <p
                            style={{
                                padding: 24,
                                textAlign: "center",
                                color: "#64748b",
                            }}
                        >
                            {search
                                ? "لم يتم العثور على مستخدمين يطابقون البحث."
                                : "لا توجد حسابات مستخدمين حاليًا."}
                        </p>
                    )}
                </div>
            </main>
        </GovernmentLayout>
    );
}