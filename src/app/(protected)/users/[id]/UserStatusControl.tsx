
"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
type UserStatusControlProps = {
    userId: string;
    username: string;
    isActive: boolean;
    isCurrentUser: boolean;
};
type StatusResponse = {
    success?: boolean;
    changed?: boolean;
    message?: string;
    error?: string;
};
export default function UserStatusControl({
    userId,
    username,
    isActive,
    isCurrentUser,
}: UserStatusControlProps) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const submittingRef = useRef(false);
    const actionLabel = isActive ? "تعطيل الحساب" : "تفعيل الحساب";
    const isDisabled = isSubmitting || (isActive && isCurrentUser);
    async function handleStatusChange() {
        if (submittingRef.current || isDisabled) return;
        setError("");
        setSuccess("");
        const confirmationMessage = isActive
            ? `هل أنت متأكد من تعطيل حساب "${username}"؟\n\nسيتم إنهاء جميع جلسات المستخدم النشطة، ولن يتمكن من تسجيل الدخول حتى إعادة تفعيل حسابه.`
            : `هل أنت متأكد من إعادة تفعيل حساب "${username}"؟\n\nسيتمكن المستخدم من تسجيل الدخول مجددًا، ولن تُستعاد جلساته القديمة.`;
        if (!window.confirm(confirmationMessage)) return;
        submittingRef.current = true;
        setIsSubmitting(true);
        try {
            const response = await fetch(
                `/api/users/${encodeURIComponent(userId)}/status`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    credentials: "same-origin",
                    body: JSON.stringify({ isActive: !isActive }),
                }
            );
            const data: StatusResponse = await response.json();
            if (!response.ok || data.success !== true) {
                setError(data.error || "تعذر تغيير حالة الحساب.");
                return;
            }
            setSuccess(data.message || "تم تحديث حالة الحساب بنجاح.");
            router.refresh();
        } catch {
            setError("تعذر التأكد من نتيجة العملية. يرجى تحديث الصفحة ومراجعة حالة الحساب قبل إعادة المحاولة.");
        } finally {
            submittingRef.current = false;
            setIsSubmitting(false);
        }
    }
    return (
        <div style={{ display: "grid", gap: 10 }}>
            <button
                type="button"
                onClick={handleStatusChange}
                disabled={isDisabled}
                style={{
                    padding: "11px 20px",
                    border: "1px solid",
                    borderColor: isActive ? "#fecaca" : "#bbf7d0",
                    borderRadius: 8,
                    background: isActive ? "#fff1f2" : "#f0fdf4",
                    color: isActive ? "#b91c1c" : "#15803d",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: isDisabled ? "not-allowed" : "pointer",
                    opacity: isDisabled ? 0.55 : 1,
                }}
            >
                {isSubmitting ? "جارٍ تنفيذ العملية..." : actionLabel}
            </button>
            {isActive && isCurrentUser && (
                <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>
                    لا يمكنك تعطيل حسابك الشخصي.
                </p>
            )}
            {error && (
                <p role="alert" style={{ margin: 0, color: "#b91c1c", fontSize: 13 }}>
                    {error}
                </p>
            )}
            {success && (
                <p role="status" style={{ margin: 0, color: "#15803d", fontSize: 13 }}>
                    {success}
                </p>
            )}
        </div>
    );
}
