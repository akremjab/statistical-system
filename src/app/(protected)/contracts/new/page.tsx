
import { redirect } from "next/navigation";
import NewContractsForm from "./NewContractsForm";
import GovernmentLayout from "@/components/GovernmentLayout";
import Footer from "@/components/Footer";

import { getCurrentSession } from "@/lib/current-session";
import { getUserPermissions, hasPermission } from "@/lib/permissions";
import { AUTH_CONFIG } from "@/lib/auth-config";

export default async function NewContractPage() {
    const session = await getCurrentSession();

    if (!session) {
        redirect(AUTH_CONFIG.loginPath);
    }

    if (session.mustChangePassword) {
        redirect(AUTH_CONFIG.changePasswordPath);
    }

    const allowed = await hasPermission("contracts.create");

    if (!allowed) {
        redirect("/unauthorized");
    }

    const user = {
        id: session.userId,
        username: session.username,
        fullName: session.fullName,
    };

    const permissions = await getUserPermissions(session.userId);

    return (
        <GovernmentLayout
            user={user}
            permissions={permissions}
        >
            <div className="app-content gov-app-content">
                <main className="dashboard">
                    <div>
                        <h1>إدخال العقود</h1>
                        <p>
                            تسجيل المراسلات الواردة وإضافة العقود
                            المرتبطة بها.
                        </p>
                    </div>

                    <NewContractsForm />
                </main>

                <Footer />
            </div>
        </GovernmentLayout>
    );
}
