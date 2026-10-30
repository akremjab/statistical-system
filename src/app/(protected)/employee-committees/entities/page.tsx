// صفحة إدارة الجهات الإدارية: عرض الجهات والبحث والتصفية والإضافة والتعديل.
import Link from "next/link";
import { redirect } from "next/navigation";
import GovernmentLayout from "@/components/GovernmentLayout";
import { getCurrentSession } from "@/lib/current-session";
import { getUserPermissions, hasPermission } from "@/lib/permissions";
import { AUTH_CONFIG } from "@/lib/auth-config";
import pool from "@/lib/db";
import EntityForm from "./EntityForm";
// زر حذف الجهة الإدارية مع نافذة التأكيد.
import DeleteEntityButton from "./DeleteEntityButton";
type EntityRow = {
    id: string;
    name: string;
    entity_type: string;
    city: string;
    has_independent_financial_liability: boolean;
    notes: string | null;
};

type PageProps = {
    searchParams: Promise<{
        q?: string;
        type?: string;
        city?: string;
        page?: string;
    }>;
};

export default async function EntitiesPage({ searchParams }: PageProps) {
    const session = await getCurrentSession();
    if (!session) redirect(AUTH_CONFIG.loginPath);
    if (session.mustChangePassword) redirect(AUTH_CONFIG.changePasswordPath);
    if (!(await hasPermission("entities.view"))) redirect("/unauthorized");

    const params = await searchParams;
    const search = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
    const type = typeof params.type === "string" ? params.type.trim().slice(0, 50) : "";
    const city = typeof params.city === "string" ? params.city.trim().slice(0, 100) : "";
    const pageSize = 20;
    const requestedPage = typeof params.page === "string" && /^[1-9]\d{0,8}$/.test(params.page) ? Number(params.page) : 1;
    const filters = [search, type, city];
    const countResult = await pool.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total
         FROM public.administrative_entities
         WHERE ($1 = '' OR name ILIKE '%' || $1 || '%')
           AND ($2 = '' OR entity_type = $2)
           AND ($3 = '' OR city ILIKE '%' || $3 || '%')`,
        filters
    );
    const total = Number(countResult.rows[0].total);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const offset = (page - 1) * pageSize;
    const pageUrl = (number: number) => {
        const query = new URLSearchParams();
        if (search) query.set("q", search);
        if (type) query.set("type", type);
        if (city) query.set("city", city);
        query.set("page", String(number));
        return `/employee-committees/entities?${query.toString()}`;
    };
    const result = await pool.query<EntityRow>(
        `SELECT id::text AS id, name, entity_type, city, has_independent_financial_liability, notes
         FROM public.administrative_entities
         WHERE ($1 = '' OR name ILIKE '%' || $1 || '%')
           AND ($2 = '' OR entity_type = $2)
           AND ($3 = '' OR city ILIKE '%' || $3 || '%')
         ORDER BY name ASC, id ASC
         LIMIT $4 OFFSET $5`,
        [...filters, pageSize, offset]
    );

    const permissions = await getUserPermissions(session.userId);
    const user = {
        id: session.userId,
        username: session.username,
        fullName: session.fullName,
        accountType: session.accountType
    };

    const inputStyle = {
        padding: "11px 14px",
        border: "1px solid #cbd5e1",
        borderRadius: 8,
        fontSize: 13,
        minWidth: 0
    };

    const entityTypes = [
        "وزارة", "هيئة", "مصلحة", "مؤسسة", "جهاز", "مركز",
        "بلدية", "شركة عامة", "جامعة", "مستشفى", "جهة أخرى"
    ];

    return (
        <GovernmentLayout user={user} permissions={permissions}>
            <main className="gov-main-content" dir="rtl" style={{ padding: 24, flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                    <div>
                        <h1 style={{ margin: 0, color: "#17365d" }}>إدارة الجهات والوحدات الإدارية</h1>
                        <p style={{ color: "#64748b", marginTop: 12 }}>تسجيل الجهات الإدارية وعرض بياناتها والبحث فيها وتحديثها.</p>
                    </div>

                </div>
                {permissions.includes("entities.create") && <EntityForm />}

                <section style={{ marginTop: 24 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                        <h2 style={{ margin: 0, color: "#17365d", fontSize: 17 }}>البحث وتصفية الجهات الإدارية</h2>
                        <span style={{ color: "#64748b", fontSize: 12 }}>يمكن البحث باسم الجهة أو تصفية النتائج حسب النوع والمدينة</span>
                    </div>
                    <form id="entities-filters" action="/employee-committees/entities" method="GET" style={{ display: "flex", gap: 12, flexWrap: "wrap", padding: 16, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, marginTop: 0 }}>
                        <input name="q" type="search" defaultValue={search} placeholder="ابحث باسم الجهة الإدارية..." maxLength={100} aria-label="اسم الجهة" style={{ ...inputStyle, flex: "2 1 250px" }} />
                        <select name="type" defaultValue={type} aria-label="نوع الجهة" style={{ ...inputStyle, flex: "1 1 160px" }}>
                            <option value="">جميع أنواع الجهات</option>
                            {entityTypes.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                        <input name="city" defaultValue={city} placeholder="المدينة..." maxLength={100} aria-label="المدينة" style={{ ...inputStyle, flex: "1 1 160px" }} />
                        <button type="submit" style={{ padding: "11px 24px", background: "#1d4ed8", color: "#fff", border: 0, borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>بحث</button>
                        {(search || type || city) && (
                            <Link href="/employee-committees/entities" style={{ ...inputStyle, textDecoration: "none", color: "#475569" }}>مسح البحث</Link>
                        )}
                    </form>
                </section>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24, marginBottom: 12 }}>
                    <h2 style={{ margin: 0, fontSize: 17, color: "#17365d" }}>الجهات الإدارية المسجلة</h2>
                    <span style={{ padding: "7px 14px", background: "#e8eef7", color: "#17365d", borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
                        إجمالي الجهات: {total} | الصفحة {page} من {totalPages}
                    </span>
                </div>

                {/* جدول الجهات الإدارية مع الترقيم المتواصل عبر الصفحات. */}
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "right", minWidth: 950 }}>
                        <thead style={{ background: "#f1f5f9" }}>
                            <tr>
                                {["م", "اسم الجهة الإدارية", "نوع الجهة", "المدينة", "ذمة مالية مستقلة", "الملاحظات", "الإجراءات"].map((heading) => (
                                    <th key={heading} scope="col" style={{ padding: 16, color: "#334155", fontSize: 13 }}>{heading}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {result.rows.map((entity, index) => (
                                <tr key={entity.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                                    <td style={{ padding: 16, color: "#64748b", fontWeight: 600 }}>{offset + index + 1}</td>
                                    <td style={{ padding: 16, fontWeight: 700, color: "#17365d" }}>{entity.name}</td>
                                    <td style={{ padding: 16 }}>{entity.entity_type}</td>
                                    <td style={{ padding: 16 }}>{entity.city}</td>
                                    <td style={{ padding: 16 }}>
                                        <span style={{
                                            display: "inline-block",
                                            padding: "6px 12px",
                                            borderRadius: 8,
                                            background: entity.has_independent_financial_liability ? "#dcfce7" : "#f1d3d3",
                                            color: entity.has_independent_financial_liability ? "#166534" : "#ff0000",
                                            fontSize: 12,
                                            fontWeight: 700
                                        }}>
                                            {entity.has_independent_financial_liability ? "نعم" : "لا"}
                                        </span>
                                    </td>
                                    <td style={{ padding: 16, maxWidth: 220 }}>
                                        <span title={entity.notes || ""} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#64748b", fontSize: 13 }}>
                                            {entity.notes?.trim() || "لا توجد ملاحظات"}
                                        </span>
                                    </td>
                                    {/* أزرار تعديل وحذف الجهة الإدارية حسب صلاحيات المستخدم. */}
                                    <td style={{ padding: 16 }}>
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 8,
                                                flexWrap: "nowrap",
                                            }}
                                        >
                                            {permissions.includes("entities.edit") && (
                                                <Link
                                                    href={`/employee-committees/entities/${entity.id}/edit`}
                                                    style={{
                                                        display: "inline-flex",
                                                        alignItems: "center",
                                                        justifyContent: "center",
                                                        padding: "8px 16px",
                                                        background: "#eff6ff",
                                                        color: "#1d4ed8",
                                                        border: "1px solid #bfdbfe",
                                                        borderRadius: 8,
                                                        fontSize: 13,
                                                        fontWeight: 700,
                                                        textDecoration: "none",
                                                        whiteSpace: "nowrap",
                                                    }}
                                                >
                                                    تعديل
                                                </Link>
                                            )}

                                            {/* إظهار زر الحذف للمستخدمين المخولين فقط. */}
                                            {permissions.includes("entities.delete") && (
                                                <DeleteEntityButton
                                                    entityId={entity.id}
                                                    entityName={entity.name}
                                                />
                                            )}

                                            {!permissions.includes("entities.edit") &&
                                                !permissions.includes("entities.delete") &&
                                                "—"}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {result.rows.length === 0 && (
                                <tr>
                                    <td colSpan={7} style={{ padding: 24, textAlign: "center", color: "#64748b" }}>
                                        {search || type || city ? "لم يتم العثور على جهات مطابقة للبحث." : "لا توجد جهات إدارية مسجلة حاليًا."}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <nav aria-label="ترقيم صفحات الجهات الإدارية" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
                    {page > 1 ? (
                        <Link href={pageUrl(page - 1)} style={{ padding: "10px 20px", background: "#fff", color: "#17365d", border: "1px solid #cbd5e1", borderRadius: 8, textDecoration: "none", fontWeight: 700 }}>السابق</Link>
                    ) : <span style={{ padding: "10px 20px", color: "#94a3b8" }}>السابق</span>}
                    <span style={{ color: "#475569", fontSize: 13 }}>صفحة {page} من {totalPages}</span>
                    {page < totalPages ? (
                        <Link href={pageUrl(page + 1)} style={{ padding: "10px 20px", background: "#17365d", color: "#fff", borderRadius: 8, textDecoration: "none", fontWeight: 700 }}>التالي</Link>
                    ) : <span style={{ padding: "10px 20px", color: "#94a3b8" }}>التالي</span>}
                </nav>
            </main>
        </GovernmentLayout>
    );
}