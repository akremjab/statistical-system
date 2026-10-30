
import { redirect } from "next/navigation";
import Link from "next/link";
import "./change-password.css";
import { AUTH_CONFIG } from "@/lib/auth-config";
import { getCurrentSession } from "@/lib/current-session";
import ChangePasswordForm from "./ChangePasswordForm";

export default async function ChangePasswordPage() {
    const session = await getCurrentSession();


    if (!session) {
        redirect(AUTH_CONFIG.loginPath);
    }

    return (
        <main
            style={{
                minHeight: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "24px",
                backgroundColor: "#f3f6fb",
            }}
        >
            <section
                style={{
                    width: "100%",
                    maxWidth: "440px",
                    padding: "32px",
                    backgroundColor: "#ffffff",
                    borderRadius: "16px",
                    boxShadow: "0 12px 40px rgba(25, 45, 75, 0.08)",
                    textAlign: "center",
                }}
            >
                <h1
                    style={{
                        color: "#253858",
                        marginBottom: "12px",
                    }}
                >
                    تغيير كلمة المرور
                </h1>

                <p style={{ color: "#64748b", lineHeight: 1.8 }}>
                    مرحبًا {session.fullName}
                </p>


                <p style={{ color: "#64748b", lineHeight: 1.8 }}>
                    {session.mustChangePassword
                        ? "يجب تغيير كلمة المرور قبل متابعة استخدام المنظومة."
                        : "يمكنك تحديث كلمة مرور حسابك من هنا."}
                </p>

                <ChangePasswordForm />
                {!session.mustChangePassword && (
                    <Link
                        href={AUTH_CONFIG.dashboardPath}
                        style={{
                            display: "block",
                            marginTop: 16,
                            padding: "11px 20px",
                            background: "#ffffff",
                            border: "1px solid #cbd5e1",
                            borderRadius: 8,
                            color: "#17365d",
                            textDecoration: "none",
                            textAlign: "center",
                            fontSize: 13,
                            fontWeight: 700,
                        }}
                    >
                        العودة إلى المنظومة
                    </Link>
                )}

            </section>
        </main>
    );
}
