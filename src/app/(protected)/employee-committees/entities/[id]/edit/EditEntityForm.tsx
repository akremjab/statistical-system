// نموذج تعديل الجهة الإدارية: عرض البيانات الحالية والسماح بتعديلها دون حفظ حتى تجهيز API.
"use client";

// إدارة حالة الحفظ وإرسال بيانات التعديل إلى واجهة API.
import { useState } from "react";
import { useRouter } from "next/navigation";

type EntityData = {
    id: string;
    name: string;
    entity_type: string;
    city: string;
    has_independent_financial_liability: boolean;
    notes: string | null;
};

const entityTypes = [
    "وزارة", "هيئة", "مصلحة", "مؤسسة", "جهاز", "مركز",
    "بلدية", "شركة عامة", "جامعة", "مستشفى", "جهة أخرى"
];

const inputStyle = {
    padding: 12,
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    background: "#fff",
    fontSize: 13,
    minWidth: 0
} as const;

const labelStyle = {
    display: "grid",
    gap: 8,
    color: "#334155",
    fontSize: 13,
    fontWeight: 700
} as const;

export default function EditEntityForm({ entity }: { entity: EntityData }) {
    const [name, setName] = useState(entity.name);
    const [entityType, setEntityType] = useState(entity.entity_type);
    const [city, setCity] = useState(entity.city);
    const [financial, setFinancial] = useState(entity.has_independent_financial_liability);
    const [notes, setNotes] = useState(entity.notes ?? "");
    // إرسال التعديلات وإظهار نتيجة عملية الحفظ.
    const router = useRouter();
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    async function handleSave() {
        if (saving) return;

        setSaving(true);
        setMessage("");
        setError("");

        try {
            const response = await fetch(
                `/api/administrative-entities/${entity.id}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        name,
                        entityType,
                        city,
                        hasIndependentFinancialLiability: financial,
                        notes
                    })
                }
            );

            const result = await response.json();

            if (!response.ok || !result.success) {
                setError(
                    result.error ?? "تعذر حفظ التعديلات."
                );
                return;
            }

            setMessage(
                result.message ?? "تم حفظ التعديلات بنجاح."
            );

            router.refresh();
        } catch {
            setError(
                "تعذر تأكيد نتيجة الحفظ. حدّث الصفحة وتحقق من البيانات قبل إعادة المحاولة."
            );
        } finally {
            setSaving(false);
        }
    }
    return (
        <div style={{ display: "grid", gap: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 16 }}>
                <label style={labelStyle}>
                    اسم الجهة الإدارية *
                    <input value={name} onChange={(event) => setName(event.target.value)} maxLength={255} style={inputStyle} />
                </label>
                <label style={labelStyle}>
                    نوع الجهة الإدارية *
                    <select value={entityType} onChange={(event) => setEntityType(event.target.value)} style={inputStyle}>
                        {entityTypes.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                </label>
                <label style={labelStyle}>
                    المدينة *
                    <input value={city} onChange={(event) => setCity(event.target.value)} maxLength={150} style={inputStyle} />
                </label>
                <fieldset style={{ margin: 0, padding: 0, border: 0 }}>
                    <legend style={{ marginBottom: 12, color: "#334155", fontSize: 13, fontWeight: 700 }}>
                        الذمة المالية المستقلة *
                    </legend>
                    <div style={{ display: "flex", gap: 20 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13 }}>
                            <input type="radio" name="edit-entity-financial" checked={financial} onChange={() => setFinancial(true)} /> نعم
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13 }}>
                            <input type="radio" name="edit-entity-financial" checked={!financial} onChange={() => setFinancial(false)} /> لا
                        </label>
                    </div>
                </fieldset>
            </div>
            <label style={labelStyle}>
                ملاحظات
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} maxLength={2000} style={{ ...inputStyle, resize: "vertical" }} />
            </label>
            {/* زر حفظ تعديلات الجهة الإدارية مع عرض رسائل النجاح والأخطاء. */}
            <div style={{ display: "grid", gap: 12, justifyItems: "start" }}>
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                        padding: "11px 24px",
                        background: saving ? "#94a3b8" : "#2563eb",
                        color: "#fff",
                        border: 0,
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: saving ? "not-allowed" : "pointer"
                    }}
                >
                    {saving ? "جاري حفظ التعديلات..." : "حفظ التعديلات"}
                </button>

                {message && (
                    <p style={{ margin: 0, color: "#15803d", fontSize: 13 }}>
                        {message}
                    </p>
                )}

                {error && (
                    <p style={{ margin: 0, color: "#dc2626", fontSize: 13 }}>
                        {error}
                    </p>
                )}
            </div>
        </div>
    );
}