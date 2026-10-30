import Link from "next/link";
import GovernmentLayout from "@/components/GovernmentLayout";
import { getCurrentSession } from "@/lib/current-session";
import {
    hasPermission,
    getUserPermissions,
} from "@/lib/permissions";
import pool from "@/lib/db";


type ContractRow = {
    id: string;
    incoming_number: string;
    administrative_entity: string;
    national_id_snapshot: string;
    full_name_snapshot: string;
    job_title: string;
    contract_type: string;
};

type ContractsPageProps = {
    searchParams: Promise<{
        q?: string | string[];
    }>;
};

export default async function ContractsPage({
    searchParams,
}: ContractsPageProps) {
    const params = await searchParams;

    const search = (
        typeof params.q === "string" ? params.q : ""
    ).trim().slice(0, 100);
    const session = await getCurrentSession();

    if (!session) {
        return null;
    }

    const permissions = await getUserPermissions(session.userId);

    const user = {
        id: session.userId,
        username: session.username,
        fullName: session.fullName,
    };
    const allowed = await hasPermission("contracts.view");

    if (!allowed) {
        return (
            <main dir="rtl" style={{ padding: 24 }}>
                <h2>غير مصرح بالوصول</h2>
                <p>ليس لديك صلاحية عرض العقود.</p>
            </main>
        );
    }

    const result = await pool.query<ContractRow>(
        `
    SELECT
        c.id,
        ic.incoming_number,
        ic.administrative_entity,
        c.national_id_snapshot,
        c.full_name_snapshot,
        c.job_title,
        c.contract_type
    FROM public.contracts AS c
    INNER JOIN public.contract_correspondences AS cc
        ON cc.contract_id = c.id
    INNER JOIN public.incoming_correspondences AS ic
        ON ic.id = cc.correspondence_id
    WHERE
        $1 = ''
        OR ic.incoming_number ILIKE '%' || $1 || '%'
        OR ic.administrative_entity ILIKE '%' || $1 || '%'
        OR c.national_id_snapshot ILIKE '%' || $1 || '%'
        OR c.full_name_snapshot ILIKE '%' || $1 || '%'
    ORDER BY c.id DESC
    LIMIT 100
    `,
        [search]
    );

    return (
        <GovernmentLayout user={user} permissions={permissions}>
            <main
                className="gov-main-content"
                dir="rtl"
                style={{ padding: "24px", flex: 1, minWidth: 0 }}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 16,
                        marginBottom: 24,
                    }}
                >
                    <div>
                        <h1 style={{ margin: 0, color: "#17365d" }}>
                            قائمة العقود
                        </h1>
                        <p style={{ color: "#64748b" }}>
                            عرض العقود المسجلة في قاعدة البيانات.
                        </p>
                    </div>

                    <Link
                        href="/contracts/new"
                        style={{
                            padding: "10px 18px",
                            borderRadius: 8,
                            background: "#1d4ed8",
                            color: "#fff",
                            textDecoration: "none",
                        }}
                    >
                        + إضافة عقد جديد
                    </Link>
                </div>
                <form
                    action="/contracts"
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
                        placeholder="ابحث برقم الوارد، الرقم الوطني، الاسم أو الجهة الإدارية..."
                        maxLength={100}
                        aria-label="البحث في العقود"
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
                            href="/contracts"
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
                        background: "#fff",
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
                            minWidth: 900,
                        }}
                    >
                        <thead style={{ background: "#f1f5f9" }}>
                            <tr>
                                {[
                                    "رقم الوارد",
                                    "الجهة الإدارية",
                                    "الرقم الوطني",
                                    "الاسم الكامل",
                                    "المسمى الوظيفي",
                                    "نوع العقد",
                                ].map((heading) => (
                                    <th
                                        key={heading}
                                        style={{
                                            padding: 14,
                                            color: "#334155",
                                            fontSize: 13,
                                        }}
                                    >
                                        {heading}
                                    </th>
                                ))}
                            </tr>
                        </thead>

                        <tbody>
                            {result.rows.map((contract) => (
                                <tr
                                    key={contract.id}
                                    style={{
                                        borderTop: "1px solid #e2e8f0",
                                    }}
                                >
                                    <td style={{ padding: 14 }}>
                                        {contract.incoming_number}
                                    </td>
                                    <td style={{ padding: 14 }}>
                                        {contract.administrative_entity}
                                    </td>
                                    <td style={{ padding: 14 }}>
                                        {contract.national_id_snapshot}
                                    </td>
                                    <td style={{ padding: 14 }}>
                                        {contract.full_name_snapshot}
                                    </td>
                                    <td style={{ padding: 14 }}>
                                        {contract.job_title}
                                    </td>
                                    <td style={{ padding: 14 }}>
                                        {contract.contract_type}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {result.rows.length === 0 && (
                        <p
                            style={{
                                padding: 24,
                                textAlign: "center",
                                color: "#64748b",
                            }}
                        >
                            {search
                                ? "لم يتم العثور على عقود تطابق البحث."
                                : "لا توجد عقود مسجلة حتى الآن."}
                        </p>
                    )}
                </div>
            </main>
        </GovernmentLayout>
    );
}