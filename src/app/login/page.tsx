
"use client";


import { useState, type FormEvent } from "react";
import {
    Building2,
    LockKeyhole,
    UserRound,
    Eye,
    EyeOff,
    ShieldCheck,
    LogIn,
} from "lucide-react";

import "./login.css";

export default function LoginPage() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);


    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        try {
            const response = await fetch("/api/auth/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                credentials: "same-origin",
                cache: "no-store",
                body: JSON.stringify({
                    username,
                    password,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                alert(
                    typeof data.error === "string"
                        ? data.error
                        : "تعذر تسجيل الدخول"
                );
                return;
            }

            if (data.success === true) {
                setPassword("");

                const destination =
                    data.redirectTo === "/change-password"
                        ? "/change-password"
                        : "/";

                window.location.assign(destination);
            }
        } catch {
            alert("تعذر الاتصال بالخادم. حاول مرة أخرى.");
        }
    }


    return (
        <main className="login-page" dir="rtl">
            <div className="login-container">
                <header className="login-brand">
                    <div className="login-logo">
                        <Building2 size={32} strokeWidth={1.7} />
                    </div>

                    <h1>وزارة الخدمة المدنية</h1>
                    <p>المنظومة الإدارية والإحصائية</p>
                </header>

                <section className="login-card" aria-labelledby="login-title">
                    <div className="login-security">
                        <ShieldCheck size={19} />
                        <span>الدخول المخصص للمستخدمين المخوّلين</span>
                    </div>

                    <h2 id="login-title">تسجيل الدخول</h2>

                    <p className="login-description">
                        أدخل بيانات حسابك للوصول إلى المنظومة.
                    </p>

                    <form className="login-form" onSubmit={handleSubmit}>
                        <div className="login-field">
                            <label htmlFor="username">اسم المستخدم</label>

                            <div className="login-input-wrapper">
                                <UserRound
                                    size={19}
                                    className="login-input-icon"
                                    aria-hidden="true"
                                />

                                <input
                                    id="username"
                                    name="username"
                                    type="text"
                                    autoComplete="username"
                                    required
                                    maxLength={50}
                                    dir="ltr"
                                    placeholder="Username"
                                    value={username}
                                    onChange={(event) => setUsername(event.target.value)}
                                />
                            </div>
                        </div>

                        <div className="login-field">
                            <label htmlFor="password">كلمة المرور</label>

                            <div className="login-input-wrapper">
                                <LockKeyhole
                                    size={19}
                                    className="login-input-icon"
                                    aria-hidden="true"
                                />

                                <input
                                    id="password"
                                    name="password"
                                    type={showPassword ? "text" : "password"}
                                    autoComplete="current-password"
                                    required
                                    dir="ltr"
                                    placeholder="••••••••••••"
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                />

                                <button
                                    type="button"
                                    className="login-password-toggle"
                                    onClick={() => setShowPassword((previous) => !previous)}
                                    aria-label={
                                        showPassword
                                            ? "إخفاء كلمة المرور"
                                            : "إظهار كلمة المرور"
                                    }
                                    aria-pressed={showPassword}
                                >
                                    {showPassword ? (
                                        <EyeOff size={19} />
                                    ) : (
                                        <Eye size={19} />
                                    )}
                                </button>
                            </div>
                        </div>

                        <button type="submit" className="login-submit">
                            <LogIn size={18} />
                            <span>تسجيل الدخول</span>
                        </button>
                    </form>
                </section>

                <footer className="login-footer">
                    نظام مخصص للمستخدمين المخوّلين فقط
                    {" • "}
                    جميع الحقوق محفوظة
                </footer>
            </div>
        </main>
    );
}
