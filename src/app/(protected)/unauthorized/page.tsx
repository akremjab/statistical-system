
import Link from "next/link";

export default function UnauthorizedPage() {
    return (
        <main
            dir="rtl"
            style={{
                minHeight: "100vh",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "16px",
                padding: "24px",
                textAlign: "center",
                backgroundColor: "#F3F6FB",
                color: "#243858",
            }}
        >
            <h1 style={{ fontSize: "32px", fontWeight: 700 }}>
                غير مصرح بالوصول
            </h1>

            <p style={{ fontSize: "16px" }}>
                ليس لديك الصلاحية المطلوبة للوصول إلى هذه الصفحة.
            </p>

            <Link
                href="/"
                style={{
                    marginTop: "12px",
                    padding: "12px 24px",
                    borderRadius: "10px",
                    backgroundColor: "#243858",
                    color: "#FFFFFF",
                    textDecoration: "none",
                }}
            >
                العودة إلى الرئيسية
            </Link>
        </main>
    );
}
