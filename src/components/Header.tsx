
"use client";

import { useEffect, useState } from "react";
import {
    Bell,
    CalendarDays,
    ChevronDown,
    Clock3,
    Landmark,
    LogOut,
    Menu,
    UserRound,
} from "lucide-react";

type HeaderProps = {
    onOpenMobileMenu: () => void;
    user: {
        id: number;
        username: string;
        fullName: string;
        accountType?: string;
    };
};

export default function Header({
    onOpenMobileMenu,
    user,
}: HeaderProps) {
    const [profileOpen, setProfileOpen] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);
    const [logoutError, setLogoutError] = useState("");
    const [unreadCount, setUnreadCount] = useState(0);
    type NotificationItem = {
        id: number;
        notification_type: string;
        title: string;
        message: string;
        entity_type: string | null;
        entity_id: string | null;
        is_read: boolean;
        read_at: string | null;
        created_at: string;
    };

    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [notificationsLoading, setNotificationsLoading] = useState(false);
    const [notificationsError, setNotificationsError] = useState("");
    const [markingReadId, setMarkingReadId] = useState<number | null>(null);
    const [clearingId, setClearingId] = useState<number | null>(null);
    const [clearingAll, setClearingAll] = useState(false);
    useEffect(() => {
        let active = true;

        async function loadUnreadCount() {
            try {
                const response = await fetch("/api/notifications", {
                    method: "GET",
                    credentials: "same-origin",
                    cache: "no-store",
                });

                if (!response.ok) return;

                const data: unknown = await response.json();

                if (
                    active &&
                    typeof data === "object" &&
                    data !== null &&
                    "unreadCount" in data &&
                    typeof data.unreadCount === "number"
                ) {
                    setUnreadCount(data.unreadCount);
                }
            } catch {
                // نحتفظ بالعدد السابق عند تعذر الاتصال.
            }
        }

        void loadUnreadCount();

        const interval = window.setInterval(() => {
            void loadUnreadCount();
        }, 30000);

        return () => {
            active = false;
            window.clearInterval(interval);
        };
    }, []);

    const today = new Intl.DateTimeFormat("ar-LY", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Africa/Tripoli",
    }).format(new Date());
    async function handleNotificationsClick() {
        if (notificationsOpen) {
            setNotificationsOpen(false);
            return;
        }

        setProfileOpen(false);
        setNotificationsOpen(true);
        setNotificationsLoading(true);
        setNotificationsError("");

        try {
            const response = await fetch("/api/notifications", {
                method: "GET",
                credentials: "same-origin",
                cache: "no-store",
            });

            if (!response.ok) {
                throw new Error("Failed to load notifications");
            }

            const data = await response.json();

            setNotifications(
                Array.isArray(data.notifications)
                    ? data.notifications
                    : []
            );

            setUnreadCount(
                typeof data.unreadCount === "number"
                    ? data.unreadCount
                    : 0
            );
        } catch {
            setNotificationsError("تعذر تحميل الإشعارات. حاول مرة أخرى.");
        } finally {
            setNotificationsLoading(false);
        }
    }
    async function handleMarkAsRead(notificationId: number) {
        if (markingReadId !== null) return;

        setMarkingReadId(notificationId);
        setNotificationsError("");

        try {
            const response = await fetch("/api/notifications/read", {
                method: "PATCH",
                credentials: "same-origin",
                cache: "no-store",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ notificationId }),
            });

            if (!response.ok) {
                throw new Error("Failed to mark notification as read");
            }

            setNotifications((current) =>
                current.map((notification) =>
                    notification.id === notificationId
                        ? { ...notification, is_read: true }
                        : notification
                )
            );

            setUnreadCount((count) => Math.max(0, count - 1));
        } catch {
            setNotificationsError(
                "تعذر تحديد الإشعار كمقروء. حاول مرة أخرى."
            );
        } finally {
            setMarkingReadId(null);
        }
    }
    async function handleClearNotification(notificationId: number) {
        if (clearingId !== null || clearingAll || markingReadId !== null) {
            return;
        }

        const notification = notifications.find(
            (item) => item.id === notificationId
        );

        if (!notification) return;

        setClearingId(notificationId);
        setNotificationsError("");

        try {
            const response = await fetch("/api/notifications/clear", {
                method: "PATCH",
                credentials: "same-origin",
                cache: "no-store",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ notificationId }),
            });

            if (!response.ok) {
                throw new Error("Failed to clear notification");
            }

            setNotifications((current) =>
                current.filter((item) => item.id !== notificationId)
            );

            if (!notification.is_read) {
                setUnreadCount((count) => Math.max(0, count - 1));
            }
        } catch {
            setNotificationsError(
                "تعذر إخفاء الإشعار. حاول مرة أخرى."
            );
        } finally {
            setClearingId(null);
        }
    }
    async function handleClearAllNotifications() {
        if (clearingAll || clearingId !== null || markingReadId !== null) {
            return;
        }

        const confirmed = window.confirm(
            "هل أنت متأكد من إخفاء جميع الإشعارات؟\n\n" +
            "ستختفي جميع إشعاراتك الحالية من القائمة، " +
            "لكن ستبقى محفوظة في قاعدة البيانات."
        );

        if (!confirmed) {
            return;
        }

        setClearingAll(true);
        setNotificationsError("");

        try {
            const response = await fetch("/api/notifications/clear-all", {
                method: "PATCH",
                credentials: "same-origin",
                cache: "no-store",
            });

            if (!response.ok) {
                throw new Error("Failed to clear all notifications");
            }

            setNotifications([]);
            setUnreadCount(0);
        } catch {
            setNotificationsError(
                "تعذر إخفاء جميع الإشعارات. حاول مرة أخرى."
            );
        } finally {
            setClearingAll(false);
        }
    }
    async function handleLogout() {
        if (loggingOut) return;

        setLoggingOut(true);
        setLogoutError("");

        try {
            const response = await fetch("/api/auth/logout", {
                method: "POST",
                credentials: "same-origin",
                cache: "no-store",
            });

            if (!response.ok) {
                throw new Error("Logout failed");
            }

            window.location.replace("/login");
        } catch {
            setLogoutError(
                "تعذر تسجيل الخروج. حاول مرة أخرى."
            );
            setLoggingOut(false);
        }
    }

    return (
        <header className="gov-header" dir="rtl">
            <div
                className="gov-header-background"
                aria-hidden="true"
            />

            <div className="gov-header-brand">
                <div className="gov-header-emblem">
                    <Landmark size={39} strokeWidth={1.5} />
                </div>

                <div className="gov-header-brand-text">
                    <h1>وزارة الخدمة المدنية</h1>
                    <h2>
                        منظومة إدارة شؤون الموظفين بالوحدات الإدارية
                    </h2>
                    <p>بيانات دقيقة .. قرارات أفضل</p>
                </div>
            </div>

            <div className="gov-header-actions">
                <div className="gov-header-date">
                    <Clock3 size={19} />
                    <span>{today}</span>
                    <CalendarDays size={17} />
                </div>


                <div style={{ position: "relative", display: "flex" }}>
                    <button
                        type="button"
                        className="gov-header-notification"
                        onClick={handleNotificationsClick}
                        aria-label={`الإشعارات، ${unreadCount} غير مقروءة`}
                        aria-expanded={notificationsOpen}
                        aria-haspopup="dialog"
                        title="الإشعارات"
                    >
                        <Bell size={22} />
                    </button>

                    {unreadCount > 0 && (
                        <span
                            aria-hidden="true"
                            style={{
                                position: "absolute",
                                top: -5,
                                left: -5,
                                minWidth: 19,
                                height: 19,
                                padding: "0 4px",
                                borderRadius: 999,
                                background: "#dc2626",
                                color: "#ffffff",
                                fontSize: 11,
                                fontWeight: 700,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                pointerEvents: "none",
                                border: "2px solid #ffffff",
                            }}
                        >
                            {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                    )}

                    {notificationsOpen && (
                        <div
                            role="dialog"
                            aria-label="قائمة الإشعارات"
                            style={{
                                position: "absolute",
                                top: "calc(100% + 14px)",
                                left: 0,
                                width: 360,
                                maxWidth: "calc(100vw - 32px)",
                                maxHeight: 430,
                                overflowY: "auto",
                                background: "#ffffff",
                                color: "#1f3555",
                                border: "1px solid #e2e8f0",
                                borderRadius: 14,
                                boxShadow: "0 16px 40px rgba(0,0,0,0.18)",
                                zIndex: 200,
                                padding: 12,
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    marginBottom: 12,
                                }}
                            >
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 10,
                                    }}
                                >
                                    <strong>الإشعارات</strong>

                                    {!notificationsLoading && notifications.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => void handleClearAllNotifications()}
                                            disabled={
                                                clearingAll ||
                                                clearingId !== null ||
                                                markingReadId !== null
                                            }
                                            title="إخفاء جميع الإشعارات"
                                            style={{
                                                border: "1px solid #fecaca",
                                                background: "#fff7f7",
                                                color: "#b42318",
                                                borderRadius: 7,
                                                padding: "5px 9px",
                                                fontSize: 11,
                                                fontWeight: 600,
                                                cursor:
                                                    clearingAll ||
                                                        clearingId !== null ||
                                                        markingReadId !== null
                                                        ? "wait"
                                                        : "pointer",
                                                opacity:
                                                    clearingAll ||
                                                        clearingId !== null ||
                                                        markingReadId !== null
                                                        ? 0.6
                                                        : 1,
                                            }}
                                        >
                                            {clearingAll ? "جارٍ الإخفاء..." : "Clear All"}
                                        </button>
                                    )}
                                </div>                                <button
                                    type="button"
                                    onClick={() => setNotificationsOpen(false)}
                                    style={{
                                        border: 0,
                                        background: "transparent",
                                        color: "#64748b",
                                        cursor: "pointer",
                                        font: "inherit",
                                    }}
                                >
                                    إغلاق
                                </button>
                            </div>

                            {notificationsLoading ? (
                                <p>جارٍ تحميل الإشعارات...</p>
                            ) : notificationsError ? (
                                <p role="alert" style={{ color: "#b42318" }}>
                                    {notificationsError}
                                </p>
                            ) : notifications.length === 0 ? (
                                <p style={{ color: "#64748b", textAlign: "center" }}>
                                    لا توجد إشعارات حاليًا.
                                </p>
                            ) : (
                                <div style={{ display: "grid", gap: 8 }}>
                                    {notifications.map((notification) => (
                                        <div
                                            key={notification.id}
                                            style={{
                                                padding: 12,
                                                borderRadius: 10,
                                                background: notification.is_read
                                                    ? "#f8fafc"
                                                    : "#eff6ff",
                                                border: "1px solid #e2e8f0",
                                            }}
                                        >
                                            <div
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "space-between",
                                                    gap: 8,
                                                }}
                                            >
                                                <strong style={{ fontSize: 13 }}>
                                                    {notification.title}
                                                </strong>
                                                <button
                                                    type="button"
                                                    onClick={() => void handleClearNotification(notification.id)}
                                                    disabled={
                                                        clearingId !== null ||
                                                        clearingAll ||
                                                        markingReadId !== null
                                                    }
                                                    title="إخفاء هذا الإشعار"
                                                    aria-label={`إخفاء الإشعار: ${notification.title}`}
                                                    style={{
                                                        border: "1px solid #e2e8f0",
                                                        background: "#ffffff",
                                                        color: "#64748b",
                                                        borderRadius: 7,
                                                        padding: "5px 9px",
                                                        fontSize: 11,
                                                        fontWeight: 600,
                                                        cursor:
                                                            clearingId !== null ||
                                                                clearingAll ||
                                                                markingReadId !== null
                                                                ? "wait"
                                                                : "pointer",
                                                        opacity:
                                                            clearingId !== null ||
                                                                clearingAll ||
                                                                markingReadId !== null
                                                                ? 0.6
                                                                : 1,
                                                    }}
                                                >
                                                    {clearingId === notification.id ? "جارٍ الإخفاء..." : "Clear"}
                                                </button>
                                                {!notification.is_read && (
                                                    <span
                                                        style={{
                                                            width: 8,
                                                            height: 8,
                                                            borderRadius: "50%",
                                                            background: "#2563eb",
                                                            flexShrink: 0,
                                                        }}
                                                    />
                                                )}
                                            </div>

                                            <p
                                                style={{
                                                    margin: "6px 0",
                                                    fontSize: 12,
                                                    lineHeight: 1.7,
                                                }}
                                            >
                                                {notification.message}
                                            </p>

                                            <div
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "space-between",
                                                    gap: 8,
                                                    marginTop: 8,
                                                }}
                                            >
                                                <small style={{ color: "#64748b" }}>
                                                    {new Intl.DateTimeFormat("ar-LY", {
                                                        dateStyle: "medium",
                                                        timeStyle: "short",
                                                        timeZone: "Africa/Tripoli",
                                                    }).format(
                                                        new Date(notification.created_at)
                                                    )}
                                                </small>

                                                {!notification.is_read && (
                                                    <button
                                                        type="button"
                                                        onClick={() => void handleMarkAsRead(notification.id)}
                                                        disabled={markingReadId !== null}
                                                        style={{
                                                            border: "1px solid #bfdbfe",
                                                            background: "#ffffff",
                                                            color: "#1d4ed8",
                                                            borderRadius: 7,
                                                            padding: "5px 9px",
                                                            fontSize: 11,
                                                            fontWeight: 600,
                                                            cursor: markingReadId !== null
                                                                ? "wait"
                                                                : "pointer",
                                                        }}
                                                    >
                                                        {markingReadId === notification.id
                                                            ? "جارٍ التحديث..."
                                                            : "تحديد كمقروء"}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="gov-header-separator" />

                <div
                    className="gov-header-profile"
                    style={{ position: "relative" }}
                >
                    <button
                        type="button"
                        onClick={() =>
                            setProfileOpen((value) => !value)
                        }
                        aria-expanded={profileOpen}
                        aria-haspopup="menu"
                        aria-label="قائمة المستخدم"
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            background: "transparent",
                            border: 0,
                            color: "inherit",
                            cursor: "pointer",
                            font: "inherit",
                            padding: 0,
                        }}
                    >
                        <div className="gov-header-profile-info">
                            <strong>{user.fullName || user.username}</strong>
                            <span>{user.username}</span>
                            {user.accountType === "system_admin" && (
                                <span style={{ color: "#facc15", fontSize: 11, fontWeight: 700 }}>
                                    مدير المنظومة
                                </span>
                            )}
                        </div>

                        <ChevronDown size={16} />

                        <div className="gov-header-avatar">
                            <UserRound size={25} />
                        </div>
                    </button>

                    {profileOpen && (
                        <div
                            role="menu"
                            aria-label="خيارات المستخدم"
                            style={{
                                position: "absolute",
                                top: "calc(100% + 12px)",
                                left: 0,
                                minWidth: 220,
                                padding: 8,
                                background: "#ffffff",
                                color: "#1f3555",
                                border: "1px solid #e2e8f0",
                                borderRadius: 12,
                                boxShadow:
                                    "0 12px 32px rgba(0,0,0,0.15)",
                                zIndex: 100,
                            }}
                        >
                            <button
                                type="button"
                                role="menuitem"
                                onClick={handleLogout}
                                disabled={loggingOut}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 10,
                                    width: "100%",
                                    padding: "12px",
                                    background: "transparent",
                                    border: 0,
                                    borderRadius: 8,
                                    color: "#b42318",
                                    font: "inherit",
                                    cursor: loggingOut
                                        ? "wait"
                                        : "pointer",
                                    textAlign: "right",
                                }}
                            >
                                <LogOut size={18} />
                                {loggingOut
                                    ? "جارٍ تسجيل الخروج..."
                                    : "تسجيل الخروج"}
                            </button>

                            {logoutError && (
                                <p
                                    role="alert"
                                    style={{
                                        margin: "8px 4px 4px",
                                        fontSize: 12,
                                        color: "#b42318",
                                    }}
                                >
                                    {logoutError}
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <button
                type="button"
                className="gov-header-menu-button"
                onClick={onOpenMobileMenu}
                aria-label="فتح القائمة الرئيسية"
                aria-controls="gov-main-sidebar"
                title="القائمة الرئيسية"
            >
                <Menu size={23} />
            </button>
        </header>
    );
}
