
import { redirect } from "next/navigation";
import GovernmentLayout from "@/components/GovernmentLayout";
import { getCurrentSession } from "@/lib/current-session";
import { getUserPermissions } from "@/lib/permissions";
import { AUTH_CONFIG } from "@/lib/auth-config";
import DelegatesTabs from "./DelegatesTabs";
// صفحة إدارة اللجان والمندوبين.
export default async function DelegatesPage() {
    // التحقق من جلسة المستخدم قبل عرض الصفحة.
    const session = await getCurrentSession();

    if (!session) {
        redirect(AUTH_CONFIG.loginPath);
    }

    // إلزام المستخدم بتغيير كلمة المرور عند الحاجة.
    if (session.mustChangePassword) {
        redirect(AUTH_CONFIG.changePasswordPath);
    }

    // جلب صلاحيات المستخدم لتمريرها إلى التخطيط العام.
    const permissions = await getUserPermissions(session.userId);

    // تجهيز بيانات المستخدم بنفس الطريقة المعتمدة في صفحة الجهات.
    const user = {
        id: session.userId,
        username: session.username,
        fullName: session.fullName,
        accountType: session.accountType,
    };

    return (
        <GovernmentLayout user={user} permissions={permissions}>
            <main
                className="gov-main-content"
                dir="rtl"
                style={{
                    padding: 24,
                    flex: 1,
                    minWidth: 0,
                }}
            >
                {/* عنوان الصفحة */}
                <div>
                    <h1 style={{ margin: 0, color: "#17365d" }}>
                        إدارة اللجان والمندوبين
                    </h1>

                    <p style={{ color: "#64748b", marginTop: 12 }}>
                        تسجيل بيانات المندوبين وإدارة تكليفاتهم بالجهات الإدارية.
                    </p>
                </div>

                <DelegatesTabs />
            </main>
        </GovernmentLayout>
    );
}
