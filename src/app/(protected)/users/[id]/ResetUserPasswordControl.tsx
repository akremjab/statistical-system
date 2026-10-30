
"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
type Props = {
    userId: string;
    username: string;
    isActive: boolean;
    isCurrentUser: boolean;
};
type ApiResponse = {
    success?: boolean;
    message?: string;
    error?: string;
};
export default function ResetUserPasswordControl({
    userId,
    username,
    isActive,
    isCurrentUser,
}: Props) {
    const router = useRouter();
    const submittingRef = useRef(false);
    const [isOpen, setIsOpen] = useState(false);
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const canReset = isActive && !isCurrentUser;
    function closeForm() {
        if (submittingRef.current) return;
        setIsOpen(false);
        setNewPassword("");
        setConfirmPassword("");
        setShowPassword(false);
        setError("");
    }
    async function handleReset(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (submittingRef.current || !canReset) return;
        setError("");
        setSuccess("");
        if (newPassword.length < 12) {
            setError("يجب ألا تقل كلمة المرور عن 12 حرفًا.");
            return;
        }
        if (newPassword.length > 128) {
            setError("يجب ألا تتجاوز كلمة المرور 128 حرفًا.");
            return;
        }
        if (new TextEncoder().encode(newPassword).length > 72) {
            setError("كلمة المرور طويلة جدًا. الحد الأقصى 72 بايت.");
            return;
        }
        if (newPassword.trim().length === 0) {
            setError("كلمة المرور لا يمكن أن تكون فراغات فقط.");
            return;
        }
        if (newPassword !== confirmPassword) {
            setError("كلمتا المرور غير متطابقتين.");
            return;
        }
        const confirmed = window.confirm(
            `هل أنت متأكد من إعادة تعيين كلمة مرور المستخدم "${username}"؟\n\nسيتم إلغاء جميع جلساته الحالية، وسيُطلب منه تغيير كلمة المرور عند تسجيل الدخول القادم.`
        );
        if (!confirmed) return;
        submittingRef.current = true;
        setIsSubmitting(true);
        try {
            const response = await fetch(
                `/api/users/${encodeURIComponent(userId)}/reset-password`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "same-origin",
                    body: JSON.stringify({ newPassword }),
                }
            );
            const data: ApiResponse = await response.json();
            if (!response.ok || data.success !== true) {
                setError(data.error || "تعذرت إعادة تعيين كلمة المرور.");
                return;
            }
            setNewPassword("");
            setConfirmPassword("");
            setShowPassword(false);
            setIsOpen(false);
            setSuccess(data.message || "تمت إعادة تعيين كلمة المرور بنجاح.");
            router.refresh();
        } catch {
            setError("تعذر التأكد من نتيجة العملية. يرجى مراجعة حالة الحساب قبل إعادة المحاولة.");
        } finally {
            submittingRef.current = false;
            setIsSubmitting(false);
        }
    }
    return (
        <div style={{ display: "grid", gap: 12 }}>
            {canReset && !isOpen && (
                <button
                    type="button"
                    onClick={() => {
                        setError("");
                        setSuccess("");
                        setIsOpen(true);
                    }}
                    style={{
                        padding: "11px 20px",
                        border: "1px solid #bfdbfe",
                        borderRadius: 8,
                        background: "#eff6ff",
                        color: "#1d4ed8",
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: "pointer",
                    }}
                >
                    إعادة تعيين كلمة المرور
                </button>
            )}
            {isOpen && canReset && (
                <form onSubmit={handleReset} style={{ display: "grid", gap: 12 }}>
                    <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
                        كلمة المرور الجديدة
                        <input
                            type={showPassword ? "text" : "password"}
                            value={newPassword}
                            onChange={(event) => setNewPassword(event.target.value)}
                            autoComplete="new-password"
                            minLength={12}
                            maxLength={128}
                            required
                            disabled={isSubmitting}
                            style={{
                                padding: 11,
                                border: "1px solid #cbd5e1",
                                borderRadius: 8,
                                fontSize: 13,
                                width: "100%",
                                boxSizing: "border-box",
                            }}
                        />
                    </label>
                    <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
                        تأكيد كلمة المرور الجديدة
                        <input
                            type={showPassword ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            autoComplete="new-password"
                            minLength={12}
                            maxLength={128}
                            required
                            disabled={isSubmitting}
                            style={{
                                padding: 11,
                                border: "1px solid #cbd5e1",
                                borderRadius: 8,
                                fontSize: 13,
                                width: "100%",
                                boxSizing: "border-box",
                            }}
                        />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                        <input
                            type="checkbox"
                            checked={showPassword}
                            onChange={(event) => setShowPassword(event.target.checked)}
                            disabled={isSubmitting}
                        />
                        إظهار كلمة المرور
                    </label>
                    <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
                        الحد الأدنى 12 حرفًا، والحد الأقصى 72 بايت. سيُطلب من المستخدم تغيير كلمة المرور عند دخوله القادم.
                    </p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            style={{
                                padding: "10px 18px",
                                border: 0,
                                borderRadius: 8,
                                background: "#1d4ed8",
                                color: "#fff",
                                fontSize: 13,
                                fontWeight: 700,
                                cursor: isSubmitting ? "wait" : "pointer",
                                opacity: isSubmitting ? 0.6 : 1,
                            }}
                        >
                            {isSubmitting ? "جارٍ إعادة التعيين..." : "تأكيد إعادة التعيين"}
                        </button>
                        <button
                            type="button"
                            onClick={closeForm}
                            disabled={isSubmitting}
                            style={{
                                padding: "10px 18px",
                                border: "1px solid #cbd5e1",
                                borderRadius: 8,
                                background: "#fff",
                                color: "#334155",
                                fontSize: 13,
                                cursor: isSubmitting ? "not-allowed" : "pointer",
                            }}
                        >
                            إلغاء
                        </button>
                    </div>
                </form>
            )}
            {error && (
                <p role="alert" style={{ margin: 0, color: "#b91c1c", fontSize: 12 }}>
                    {error}
                </p>
            )}
            {success && (
                <p role="status" style={{ margin: 0, color: "#15803d", fontSize: 12 }}>
                    {success}
                </p>
            )}
        </div>
    );
}
