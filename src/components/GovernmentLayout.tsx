
"use client";

import { useState } from "react";

import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";

type GovernmentLayoutProps = {
    children: React.ReactNode;
    user: {
        id: number;
        username: string;
        fullName: string;
        accountType?: string;
    };
    permissions: string[];
};

export default function GovernmentLayout({
    children,
    user,
    permissions,
}: GovernmentLayoutProps) {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    return (
        <div className="app-shell gov-app-shell">
            <Header
                user={user}
                onOpenMobileMenu={() =>
                    setMobileMenuOpen(true)
                }
            />

            <div className="gov-app-body">
                <Sidebar
                    permissions={permissions}
                    mobileOpen={mobileMenuOpen}
                    onCloseMobileMenu={() =>
                        setMobileMenuOpen(false)
                    }
                />

                {children}
            </div>
        </div>
    );
}
