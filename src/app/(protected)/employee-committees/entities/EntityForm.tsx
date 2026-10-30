"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const entityTypes = [
    "وزارة", "هيئة", "مصلحة", "مؤسسة", "جهاز", "مركز",
    "بلدية", "شركة عامة", "جامعة", "مستشفى", "جهة أخرى"
];

const labelStyle = {
    display: "grid",
    gap: 8,
    color: "#334155",
    fontSize: 13,
    fontWeight: 700
} as const;

const inputStyle = {
    padding: 12,
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    background: "#fff",
    minWidth: 0,
    fontSize: 13
} as const;

export default function EntityForm() {
    const [name, setName] = useState("");
    const [entityType, setEntityType] = useState("");
    const [city, setCity] = useState("");
    const [financial, setFinancial] = useState<boolean | null>(null);
    const [notes, setNotes] = useState("");
    const router = useRouter();
    const savingRef = useRef(false);
    // الاحتفاظ بمفتاح عملية الإنشاء حتى لا يتغير عند إعادة إرسال نفس الطلب.
    const idempotencyKeyRef = useRef<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [saveUncertain, setSaveUncertain] = useState(false);

    async function handleSave() {
        // السماح بإعادة محاولة نفس العملية مع الاحتفاظ بمفتاح الحفظ الأصلي.
        if (savingRef.current) return;
        setError("");
        setSuccess("");

        const cleanName = name.trim();
        const cleanCity = city.trim();
        const cleanNotes = notes.trim();

        if (!cleanName || cleanName.length > 255) {
            setError("يرجى إدخال اسم جهة إدارية صالح.");
            return;
        }
        if (!entityTypes.includes(entityType)) {
            setError("يرجى اختيار نوع الجهة الإدارية.");
            return;
        }
        if (!cleanCity || cleanCity.length > 150) {
            setError("يرجى إدخال اسم المدينة.");
            return;
        }
        if (financial === null) {
            setError("يرجى تحديد حالة الذمة المالية المستقلة.");
            return;
        }
        if (cleanNotes.length > 2000) {
            setError("الملاحظات تتجاوز الحد المسموح.");
            return;
        }

        // إنشاء مفتاح فريد عند بدء عملية حفظ جديدة فقط.
        if (!idempotencyKeyRef.current) {
            idempotencyKeyRef.current = crypto.randomUUID();
        }
        savingRef.current = true;
        setSaving(true);

        try {
            const response = await fetch("/api/administrative-entities", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Idempotency-Key": idempotencyKeyRef.current!
                },
                credentials: "same-origin",
                body: JSON.stringify({
                    name: cleanName,
                    entityType,
                    city: cleanCity,
                    hasIndependentFinancialLiability: financial,
                    notes: cleanNotes
                })
            });

            if (response.status >= 500) {
                setSaveUncertain(true);
                setError("تعذر التأكد من نتيجة الحفظ. راجع قائمة الجهات قبل إعادة المحاولة، لتجنب تسجيل الجهة مرتين.");
                router.refresh();
                return;
            }
            // قراءة استجابة الخادم قبل تغيير مفتاح عملية الحفظ.
            const result: unknown = await response.json();

            // رفض الطلب بشكل مؤكد يسمح ببدء عملية جديدة بمفتاح جديد.
            if (response.status >= 400 && response.status < 500) {
                idempotencyKeyRef.current = null;
                setSaveUncertain(false);
            }
            if (typeof result !== "object" || result === null || !("success" in result) || result.success !== true) {
                const message = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
                    ? result.error : "تعذر حفظ الجهة الإدارية.";
                throw new Error(message);
            }
            // انتهت العملية بنجاح، ويمكن استخدام مفتاح جديد للإضافة التالية.
            idempotencyKeyRef.current = null;
            // إغلاق حالة عدم اليقين بعد تأكيد نجاح العملية من الخادم.
            setSaveUncertain(false);
            setSuccess("تمت إضافة الجهة الإدارية بنجاح.");
            setName("");
            setEntityType("");
            setCity("");
            setFinancial(null);
            setNotes("");
            router.refresh();
        } catch (cause) {
            if (cause instanceof TypeError || cause instanceof SyntaxError) {
                setSaveUncertain(true);
                setError("تعذر التأكد من نتيجة الحفظ بسبب مشكلة في الاتصال أو استجابة الخادم. راجع قائمة الجهات قبل إعادة المحاولة.");
                router.refresh();
            } else {
                setError(cause instanceof Error ? cause.message : "حدث خطأ أثناء الحفظ.");
            }
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    }

    return (
        <section style={{ marginTop: 24, padding: 20, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12 }}>
            <h2 style={{ margin: 0, paddingBottom: 14, borderBottom: "1px solid #e2e8f0", color: "#17365d", fontSize: 17 }}>
                بيانات الجهة الإدارية
            </h2>
            {/* منع تعديل بيانات الطلب عندما تكون نتيجة الحفظ غير مؤكدة. */}
            <fieldset disabled={saving || saveUncertain} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 16, marginTop: 20 }}>
                    <label style={labelStyle}>
                        اسم الجهة الإدارية *
                        <input type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="أدخل اسم الجهة الإدارية" maxLength={255} style={inputStyle} />
                    </label>
                    <label style={labelStyle}>
                        نوع الجهة الإدارية *
                        <select value={entityType} onChange={(event) => setEntityType(event.target.value)} style={inputStyle}>
                            <option value="">اختر نوع الجهة</option>
                            {entityTypes.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                    </label>
                    <label style={labelStyle}>
                        المدينة *
                        <input type="text" value={city} onChange={(event) => setCity(event.target.value)} placeholder="أدخل المدينة" maxLength={150} style={inputStyle} />
                    </label>
                    <fieldset style={{ margin: 0, padding: 0, border: 0 }}>
                        <legend style={{ marginBottom: 12, color: "#334155", fontSize: 13, fontWeight: 700 }}>
                            الذمة المالية المستقلة *
                        </legend>
                        <div style={{ display: "flex", gap: 20 }}>
                            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13 }}>
                                <input type="radio" name="entity-financial" checked={financial === true} onChange={() => setFinancial(true)} /> نعم
                            </label>
                            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13 }}>
                                <input type="radio" name="entity-financial" checked={financial === false} onChange={() => setFinancial(false)} /> لا
                            </label>
                        </div>
                    </fieldset>
                </div>
                <label style={{ ...labelStyle, marginTop: 20 }}>
                    ملاحظات
                    <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} maxLength={2000} placeholder="أدخل أي ملاحظات إضافية..." style={{ ...inputStyle, resize: "vertical" }} />
                </label>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 20, paddingTop: 16, borderTop: "1px solid #e2e8f0" }}>
                    {/* تنفيذ حفظ الجهة الإدارية ومنع الضغط المتكرر أثناء المعالجة. */}
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving || saveUncertain}
                        style={{
                            padding: "11px 28px",
                            background: saving ? "#94a3b8" : "#17365d",
                            color: "#fff",
                            border: 0,
                            borderRadius: 8,
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: saving ? "not-allowed" : "pointer"
                        }}
                    >
                        {saving ? "جارٍ الحفظ..." : "حفظ الجهة الإدارية"}
                    </button>
                </div>
            </fieldset>
            {/* إعادة إرسال نفس عملية الحفظ بالمفتاح الأصلي دون إنشاء طلب جديد. */}
            {saveUncertain && (
                <div style={{ marginTop: 12, padding: 12, background: "#fffbeb", borderRadius: 8 }}>
                    <p role="alert" style={{ margin: 0, color: "#92400e", fontSize: 13 }}>
                        تعذر التأكد من نتيجة الحفظ. يمكنك إعادة المحاولة بأمان باستخدام نفس مفتاح العملية.
                    </p>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        style={{ marginTop: 12, padding: "10px 18px", background: "#b45309", color: "#fff", border: 0, borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}
                    >
                        {saving ? "جارٍ التحقق..." : "إعادة محاولة الحفظ"}
                    </button>
                </div>
            )}

            {error && (
                <p role="alert" style={{ marginTop: 12, padding: 12, background: "#fef2f2", color: "#b91c1c", borderRadius: 8, fontSize: 13 }}>
                    {error}
                </p>
            )}
            {success && (
                <p role="status" style={{ marginTop: 12, padding: 12, background: "#f0fdf4", color: "#15803d", borderRadius: 8, fontSize: 13 }}>
                    {success}
                </p>
            )}
        </section>
    );
}