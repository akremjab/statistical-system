
import { redirect } from "next/navigation";

import { AUTH_CONFIG } from "@/lib/auth-config";
import { getCurrentSession } from "@/lib/current-session";

export default async function ProtectedLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const session = await getCurrentSession();

    if (!session) {
        redirect(AUTH_CONFIG.loginPath);
    }

    if (session.mustChangePassword) {
        redirect(AUTH_CONFIG.changePasswordPath);
    }

    return <>{children}</>;
}
