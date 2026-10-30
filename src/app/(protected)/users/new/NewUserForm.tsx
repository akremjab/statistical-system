"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { validateNewPassword } from "@/lib/password-policy";

export default function NewUserForm() {
    const [fullName, setFullName] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const router = useRouter();
    const submittingRef = useRef(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (submittingRef.current) return;

        setError("");

        const normalizedFullName = fullName.trim();
        const normalizedUsername = username.trim();

        if (!normalizedFullName || !normalizedUsername) {
            setError("يرجى تعبئة جميع البيانات المطلوبة.");
            return;
        }

        if (!/^[a-zA-Z0-9._-]{3,100}$/.test(normalizedUsername)) {
            setError(
                "اسم المستخدم يجب أن يتكون من 3 إلى 100 حرف إنجليزي أو رقم أو نقطة أو شرطة."
            );
            return;
        }

        const validationError = validateNewPassword(password);

        if (validationError) {
            setError(validationError);
            return;
        }

        if (password !== confirmPassword) {
            setError("تأكيد كلمة المرور غير مطابق.");
            return;
        }

        submittingRef.current = true;
        setIsSubmitting(true);

        try {
            const response = await fetch("/api/users", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                credentials: "same-origin",
                body: JSON.stringify({
                    fullName: normalizedFullName,
                    username: normalizedUsername,
                    password,
                }),
            });

            const result: unknown = await response.json();

            const data =
                typeof result === "object" &&
                    result !== null &&
                    !Array.isArray(result)
                    ? (result as Record<string, unknown>)
                    : {};

            if (!response.ok) {
                setError(
                    typeof data.error === "string"
                        ? data.error
                        : "تعذر إنشاء المستخدم. يرجى المحاولة مجددًا."
                );
                return;
            }

            // لا نعيد إرسال كلمة المرور بعد نجاح الحفظ
            setPassword("");
            setConfirmPassword("");

            router.push("/users");
            router.refresh();
        } catch {
            setError(
                "تعذر الاتصال بالخادم أو التأكد من نتيجة الطلب. " +
                "يرجى مراجعة قائمة المستخدمين قبل إعادة المحاولة."
            );
        } finally {
            submittingRef.current = false;
            setIsSubmitting(false);
        }
    }


    const inputStyle = {
        width: "100%",
        padding: "12px 14px",
        border: "1px solid #cbd5e1",
        borderRadius: 8,
        fontSize: 14,
        boxSizing: "border-box" as const,
    };

    const labelStyle = {
        display: "block",
        marginBottom: 8,
        color: "#334155",
        fontSize: 13,
        fontWeight: 600,
    };

    return (
        <form onSubmit={handleSubmit} autoComplete="off">
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns:
                        "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
                    gap: 20,
                }}
            >
                <div>
                    <label htmlFor="new-user-full-name" style={labelStyle}>
                        الاسم الكامل *
                    </label>

                    <input
                        id="new-user-full-name"
                        type="text"
                        disabled={isSubmitting}
                        value={fullName}
                        onChange={(event) =>
                            setFullName(event.target.value)
                        }
                        maxLength={255}
                        required
                        style={inputStyle}
                    />
                </div>

                <div>
                    <label htmlFor="new-user-username" style={labelStyle}>
                        اسم المستخدم *
                    </label>

                    <input
                        id="new-user-username"
                        type="text"
                        disabled={isSubmitting}
                        value={username}
                        onChange={(event) =>
                            setUsername(event.target.value)
                        }
                        maxLength={100}
                        autoCapitalize="none"
                        spellCheck={false}
                        required
                        dir="ltr"
                        style={inputStyle}
                    />
                </div>

                <div>
                    <label htmlFor="new-user-password" style={labelStyle}>
                        كلمة المرور المؤقتة *
                    </label>

                    <input
                        id="new-user-password"
                        type="password"
                        disabled={isSubmitting}
                        value={password}
                        onChange={(event) =>
                            setPassword(event.target.value)
                        }
                        minLength={12}
                        maxLength={128}
                        autoComplete="new-password"
                        required
                        dir="ltr"
                        style={inputStyle}
                    />
                </div>

                <div>
                    <label htmlFor="new-user-confirm-password" style={labelStyle}>
                        تأكيد كلمة المرور *
                    </label>

                    <input
                        id="new-user-confirm-password"
                        type="password"
                        disabled={isSubmitting}
                        value={confirmPassword}
                        onChange={(event) =>
                            setConfirmPassword(event.target.value)
                        }
                        minLength={12}
                        maxLength={128}
                        autoComplete="new-password"
                        required
                        dir="ltr"
                        style={inputStyle}
                    />
                </div>
            </div>

            <p
                style={{
                    marginTop: 18,
                    color: "#64748b",
                    fontSize: 12,
                }}
            >
                يجب ألا تقل كلمة المرور عن 12 حرفًا، وألا تتجاوز
                72 بايت بترميز UTF-8. سيُطلب من المستخدم تغيير
                كلمة المرور المؤقتة عند أول تسجيل دخول.
            </p>

            {error && (
                <p
                    role="alert"
                    style={{
                        marginTop: 16,
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
                    justifyContent: "flex-end",
                    marginTop: 24,
                }}
            >
                <button
                    type="submit"
                    disabled={isSubmitting}
                    style={{
                        padding: "12px 24px",
                        background: "#1d4ed8",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: isSubmitting ? "not-allowed" : "pointer",
                        opacity: isSubmitting ? 0.65 : 1,
                    }}
                >
                    {isSubmitting ? "جارٍ حفظ المستخدم..." : "حفظ المستخدم"}
                </button>
            </div>
        </form>
    );
}