"use client";

import { useState, type FormEvent } from "react";

const entityTypes = [
    "وزارة", "هيئة", "مصلحة", "مؤسسة", "جهاز", "مركز",
    "بلدية", "شركة عامة", "جامعة", "مستشفى", "جهة أخرى"
];

const inputStyle = {
    width: "100%", padding: "12px 14px", border: "1px solid #cbd5e1",
    borderRadius: 8, fontSize: 14, background: "#fff", boxSizing: "border-box" as const
};

const labelStyle = {
    display: "block", marginBottom: 8, fontSize: 13,
    fontWeight: 700, color: "#334155"
};

export default function NewEntityForm() {
    const [name, setName] = useState("");
    const [entityType, setEntityType] = useState("");
    const [city, setCity] = useState("");
    const [financialLiability, setFinancialLiability] = useState("");
    const [error, setError] = useState("");

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");

        if (!name.trim() || !entityType || !city.trim() || !financialLiability) {
            setError("يرجى تعبئة جميع الحقول المطلوبة.");
            return;
        }

        if (name.trim().length > 255 || city.trim().length > 150) {
            setError("تجاوز اسم الجهة أو المدينة الحد المسموح.");
            return;
        }

        setError("النموذج جاهز. سيتم تفعيل الحفظ بعد تجهيز واجهة API الآمنة.");
    }

    return (
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 20, maxWidth: 850 }}>
            <div>
                <label htmlFor="entity-name" style={labelStyle}>اسم الجهة الإدارية *</label>
                <input id="entity-name" value={name} onChange={(e) => setName(e.target.value)}
                    maxLength={255} required placeholder="أدخل اسم الجهة الإدارية" style={inputStyle} />
            </div>
            <div>
                <label htmlFor="entity-type" style={labelStyle}>نوع الجهة الإدارية *</label>
                <select id="entity-type" value={entityType} onChange={(e) => setEntityType(e.target.value)}
                    required style={inputStyle}>
                    <option value="">اختر نوع الجهة</option>
                    {entityTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
            </div>
            <div>
                <label htmlFor="entity-city" style={labelStyle}>المدينة *</label>
                <input id="entity-city" value={city} onChange={(e) => setCity(e.target.value)}
                    maxLength={150} required placeholder="أدخل اسم المدينة" style={inputStyle} />
            </div>
            <div>
                <label htmlFor="entity-financial" style={labelStyle}>هل للجهة ذمة مالية مستقلة؟ *</label>
                <select id="entity-financial" value={financialLiability}
                    onChange={(e) => setFinancialLiability(e.target.value)} required style={inputStyle}>
                    <option value="">اختر الإجابة</option>
                    <option value="yes">نعم</option>
                    <option value="no">لا</option>
                </select>
            </div>
            {error && <p role="alert" style={{ margin: 0, color: "#b91c1c", fontSize: 13 }}>{error}</p>}
            <div style={{ display: "flex", gap: 12, paddingTop: 8 }}>
                <button type="submit" disabled style={{
                    padding: "12px 28px", background: "#94a3b8", color: "#fff",
                    border: 0, borderRadius: 8, fontWeight: 700, cursor: "not-allowed"
                }}>حفظ البيانات</button>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
                زر الحفظ غير مفعّل حتى اكتمال ربط النموذج بواجهة API والتحقق من الصلاحيات.
            </p>
        </form>
    );
}