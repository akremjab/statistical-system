import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import GovernmentLayout from "@/components/GovernmentLayout";
import pool from "@/lib/db";
import { getCurrentSession } from "@/lib/current-session";
import { getUserPermissions } from "@/lib/permissions";
import { AUTH_CONFIG } from "@/lib/auth-config";
import PermissionsEditor from "./PermissionsEditor";
type PageProps = {
    params: Promise<{ id: string }>;
};

type AccountRow = {
    id: string;
    username: string;
    full_name: string;
    account_type: "system_admin" | "standard";
    is_active: boolean;
};

type PermissionRow = {
    id: string;
    code: string;
    name_ar: string;
    description: string | null;
    granted: boolean;
};



export default async function UserPermissionsPage({ params }: PageProps) {
    const session = await getCurrentSession();
    if (!session) {
        redirect(AUTH_CONFIG.loginPath);
    }
    if (session.mustChangePassword) {
        redirect(AUTH_CONFIG.changePasswordPath);
    }

    const actorPermissions = await getUserPermissions(session.userId);
    if (!actorPermissions.includes("users.manage_permissions")) {
        redirect("/users");
    }

    const { id } = await params;
    if (!/^[1-9]\d*$/.test(id) || BigInt(id) > BigInt("9223372036854775807")) {
        notFound();
    }

    const accountResult = await pool.query<AccountRow>(
        `SELECT id, username, full_name, account_type, is_active
         FROM public.users
         WHERE id = $1
         LIMIT 1`,
        [id]
    );
    const account = accountResult.rows[0];
    if (!account) {
        notFound();
    }

    const permissionResult = await pool.query<PermissionRow>(
        `SELECT
            p.id,
            p.code,
            p.name_ar,
            p.description,
            (up.user_id IS NOT NULL) AS granted
         FROM public.permissions p
         LEFT JOIN public.user_permissions up
            ON up.permission_id = p.id
            AND up.user_id = $1
         ORDER BY p.code`,
        [id]
    );

    const allPermissions = permissionResult.rows;

    const currentUser = {
        id: session.userId,
        username: session.username,
        fullName: session.fullName,
        accountType: session.accountType,
    };

    return (
        <GovernmentLayout user={currentUser} permissions={actorPermissions}>
            <div className="app-content gov-app-content" dir="rtl">
                <main style={{ padding: 30, width: "100%" }}>
                    <Link href={`/users/${account.id}`} style={{ color: "#1d4ed8", textDecoration: "none", fontWeight: 700 }}>
                        العودة إلى تفاصيل المستخدم
                    </Link>
                    <h1 style={{ marginTop: 24, marginBottom: 8, color: "#17365d" }}>
                        إدارة صلاحيات المستخدم
                    </h1>
                    <p style={{ color: "#64748b", marginBottom: 24 }}>
                        {account.full_name} ({account.username})
                    </p>
                    <PermissionsEditor
                        userId={String(account.id)}
                        permissions={allPermissions}
                        accountType={account.account_type}
                        delegablePermissionCodes={actorPermissions}
                    />
                </main>
            </div>
        </GovernmentLayout>
    );
}