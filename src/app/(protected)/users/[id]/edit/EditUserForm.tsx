
"use client";
import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
type EditUserFormProps = {
    userId: string;
    initialFullName: string;
    initialUsername: string;
};
type ApiResponse = {
    success?: boolean;
    changed?: boolean;
    error?: string;
    message?: string;
};
export default function EditUserForm({
    userId,
    initialFullName,
    initialUsername,
}: EditUserFormProps) {
    const router = useRouter();
    const [fullName, setFullName] = useState(initialFullName);
    const [username, setUsername] = useState(initialUsername);
    const [error, setError] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const submittingRef = useRef(false);
    const inputStyle = {
        width: "100%",
        boxSizing: "border-box" as const,
        padding: "12px 14px",
        border: "1px solid #cbd5e1",
        borderRadius: 8,
        fontSize: 14,
        color: "#17365d",
        background: "#ffffff",
    };
    const labelStyle = {
        display: "block",
        marginBottom: 8,
        fontSize: 13,
        fontWeight: 700,
        color: "#334155",
    };
    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (submittingRef.current) return;
        setError("");
        const cleanFullName = fullName.trim();
        const cleanUsername = username.trim();
        if (!cleanFullName || cleanFullName.length > 255) {
            setError("الاسم الكامل غير صالح.");
            return;
        }
        if (!/^[a-zA-Z0-9._-]{3,100}$/.test(cleanUsername)) {
            setError("اسم المستخدم يجب أن يتكون من 3 إلى 100 حرف إنجليزي أو رقم أو نقطة أو شرطة.");
            return;
        }
        if (
            cleanFullName === initialFullName &&
            cleanUsername === initialUsername
        ) {
            setError("لم يتم إجراء أي تغييرات على البيانات.");
            return;
        }
        submittingRef.current = true;
        setIsSubmitting(true);
        try {
            const response = await fetch(
                `/api/users/${encodeURIComponent(userId)}`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    credentials: "same-origin",
                    body: JSON.stringify({
                        fullName: cleanFullName,
                        username: cleanUsername,
                    }),
                }
            );
            const data: ApiResponse = await response.json();
            if (!response.ok || data.success !== true) {
                setError(data.error || "تعذر حفظ التعديلات.");
                return;
            }
            router.push(`/users/${userId}`);
            router.refresh();
        } catch {
            setError(
                "تعذر التأكد من نتيجة الحفظ. يرجى مراجعة بيانات المستخدم قبل إعادة المحاولة."
            );
        } finally {
            submittingRef.current = false;
            setIsSubmitting(false);
        }
    }
    return (
        <form onSubmit={handleSubmit} noValidate={false}>
            <div style={{ display: "grid", gap: 20 }}>
                <div>
                    <label htmlFor="editFullName" style={labelStyle}>
                        الاسم الكامل
                    </label>
                    <input
                        id="editFullName"
                        name="fullName"
                        type="text"
                        value={fullName}
                        onChange={(event) => setFullName(event.target.value)}
                        maxLength={255}
                        required
                        disabled={isSubmitting}
                        style={inputStyle}
                    />
                </div>
                <div>
                    <label htmlFor="editUsername" style={labelStyle}>
                        اسم المستخدم
                    </label>
                    <input
                        id="editUsername"
                        name="username"
                        type="text"
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        maxLength={100}
                        minLength={3}
                        pattern="[a-zA-Z0-9._-]+"
                        required
                        dir="ltr"
                        disabled={isSubmitting}
                        style={inputStyle}
                    />
                </div>
                {error && (
                    <p
                        role="alert"
                        style={{
                            margin: 0,
                            padding: "12px 14px",
                            borderRadius: 8,
                            background: "#fef2f2",
                            border: "1px solid #fecaca",
                            color: "#b91c1c",
                            fontSize: 13,
                        }}
                    >
                        {error}
                    </p>
                )}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        flexWrap: "wrap",
                    }}
                >
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        style={{
                            padding: "12px 24px",
                            border: "none",
                            borderRadius: 8,
                            background: "#1d4ed8",
                            color: "#ffffff",
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: isSubmitting ? "not-allowed" : "pointer",
                            opacity: isSubmitting ? 0.7 : 1,
                        }}
                    >
                        {isSubmitting ? "جارٍ حفظ التعديلات..." : "حفظ التعديلات"}
                    </button>
                </div>
            </div>
        </form>
    );
}
