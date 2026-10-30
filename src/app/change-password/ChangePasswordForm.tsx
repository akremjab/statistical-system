
"use client";

import { useState, type FormEvent } from "react";

import { validateNewPassword } from "@/lib/password-policy";

export default function ChangePasswordForm() {
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");

    async function handleSubmit(
        event: FormEvent<HTMLFormElement>
    ) {
        event.preventDefault();
        setError("");

        const validationError = validateNewPassword(newPassword);

        if (validationError) {
            setError(validationError);
            return;
        }

        if (newPassword !== confirmPassword) {
            setError("تأكيد كلمة المرور غير مطابق");
            return;
        }

        if (newPassword === currentPassword) {
            setError("يجب اختيار كلمة مرور مختلفة عن الحالية");
            return;
        }

        try {
            const response = await fetch(
                "/api/auth/change-password",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    credentials: "same-origin",
                    cache: "no-store",
                    body: JSON.stringify({
                        currentPassword,
                        newPassword,
                    }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                setError(
                    typeof data.error === "string"
                        ? data.error
                        : "تعذر تغيير كلمة المرور"
                );
                return;
            }

            if (data.success === true) {
                setCurrentPassword("");
                setNewPassword("");
                setConfirmPassword("");

                alert(
                    "تم تغيير كلمة المرور بنجاح. يرجى تسجيل الدخول مجددًا."
                );

                window.location.assign("/login");
                return;
            }

            setError("تعذر تأكيد تغيير كلمة المرور");
        } catch {
            setError("تعذر الاتصال بالخادم. حاول مرة أخرى.");
        }
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="change-password-form"
        >
            <div className="change-password-field">
                <label htmlFor="current-password">
                    كلمة المرور الحالية
                </label>

                <input
                    id="current-password"
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(event) =>
                        setCurrentPassword(event.target.value)
                    }
                    required
                    dir="ltr"
                />
            </div>

            <div className="change-password-field">
                <label htmlFor="new-password">
                    كلمة المرور الجديدة
                </label>

                <input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) =>
                        setNewPassword(event.target.value)
                    }
                    required
                    minLength={12}
                    maxLength={128}
                    dir="ltr"
                />
            </div>

            <div className="change-password-field">
                <label htmlFor="confirm-password">
                    تأكيد كلمة المرور الجديدة
                </label>

                <input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) =>
                        setConfirmPassword(event.target.value)
                    }
                    required
                    dir="ltr"
                />
            </div>

            {error && (
                <p
                    className="change-password-error"
                    role="alert"
                >
                    {error}
                </p>
            )}

            <button
                type="submit"
                className="change-password-submit"
            >
                تغيير كلمة المرور
            </button>
        </form>
    );
}
