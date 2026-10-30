
export const PASSWORD_POLICY = {
    minLength: 12,
    maxLength: 128,
    maxBytes: 72,
} as const;

export function validateNewPassword(
    password: unknown
): string | null {
    if (typeof password !== "string") {
        return "كلمة المرور غير صالحة";
    }

    if (password.length < PASSWORD_POLICY.minLength) {
        return "يجب ألا تقل كلمة المرور عن 12 حرفًا";
    }

    if (password.length > PASSWORD_POLICY.maxLength) {
        return "يجب ألا تتجاوز كلمة المرور 128 حرفًا";
    }

    if (password.trim().length === 0) {
        return "كلمة المرور لا يمكن أن تكون فراغات فقط";
    }

    // bcrypt يعالج أول 72 بايت فقط.
    // TextEncoder يحسب حجم النص بترميز UTF-8.
    const byteLength = new TextEncoder()
        .encode(password).length;

    if (byteLength > PASSWORD_POLICY.maxBytes) {
        return "كلمة المرور طويلة جدًا. الحد الأقصى 72 بايت";
    }

    return null;
}
