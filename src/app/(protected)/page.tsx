
import { redirect } from "next/navigation";

import GovernmentLayout from "@/components/GovernmentLayout";
import StatsCards from "@/components/StatsCards";
import Departments from "@/components/Departments";
import DashboardOverview from "@/components/DashboardOverview";
import Footer from "@/components/Footer";
import { getUserPermissions } from "@/lib/permissions";
import { getCurrentSession } from "@/lib/current-session";
import { AUTH_CONFIG } from "@/lib/auth-config";

export default async function Home() {
  const session = await getCurrentSession();

  if (!session) {
    redirect(AUTH_CONFIG.loginPath);
  }

  if (session.mustChangePassword) {
    redirect(AUTH_CONFIG.changePasswordPath);
  }

  const user = {
    id: session.userId,
    username: session.username,
    fullName: session.fullName,
    accountType: session.accountType,
  };
  const permissions = await getUserPermissions(session.userId);
  return (
    <GovernmentLayout
      user={user}
      permissions={permissions}
    >
      <div className="app-content gov-app-content">
        <main className="dashboard">
          <StatsCards />
          <Departments />
          <DashboardOverview />
        </main>

        <Footer />
      </div>
    </GovernmentLayout>
  );
}
