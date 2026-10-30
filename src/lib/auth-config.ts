
export const AUTH_CONFIG = {
    cookieName: "statistical_session",

    // مدة الخمول المسموحة: 30 دقيقة
    idleTimeoutMinutes: 30,

    // إظهار تحذير بعد 25 دقيقة من الخمول
    idleWarningMinutes: 25,

    // حجم رمز الجلسة العشوائي
    sessionTokenBytes: 32,

    // مسارات المصادقة
    loginPath: "/login",
    dashboardPath: "/",
    changePasswordPath: "/change-password",
} as const;

export const SESSION_IDLE_TIMEOUT_MS =
    AUTH_CONFIG.idleTimeoutMinutes * 60 * 1000;

export const SESSION_WARNING_MS =
    AUTH_CONFIG.idleWarningMinutes * 60 * 1000;
