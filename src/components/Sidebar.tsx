
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
    House,
    Database,
    FileText,
    BriefcaseBusiness,
    UsersRound,
    ChartNoAxesCombined,
    Settings,
    LogOut,
    ChevronDown,
    ChevronLeft,
    X,
} from "lucide-react";

type SidebarProps = {
    mobileOpen: boolean;
    onCloseMobileMenu: () => void;
    permissions: string[];
};

const menuGroups = [

    {
        label: "قسم العقود",
        icon: FileText,
        children: [
            {
                label: "إدخال العقود",
                href: "/contracts/new",
                permission: "contracts.create",
            },
            {
                label: "قائمة العقود",
                href: "/contracts",
                permission: "contracts.view",
            },
            {
                label: "التقارير",
                href: "/contracts/reports",
                permission: "reports.view",
            },
        ],
    },
    {
        label: "قسم الوظيفة العامة",
        icon: BriefcaseBusiness,
        children: [
            { label: "إذن التعاقد", href: "/public-service/permissions" },
            { label: "إبداء الرأي الفني", href: "/public-service/opinions" },
            { label: "الردود والمتابعة", href: "/public-service/follow-up" },
            { label: "التقارير", href: "/public-service/reports" },
        ],
    },

    {
        label: "متابعة لجان الموظفين",
        icon: UsersRound,
        children: [
            { label: "إدارة الجهات والوحدات الإدارية", href: "/employee-committees/entities" },
            { label: "إدارة اللجان والمندوبين", href: "/employee-committees/delegates" },
            { label: "محاضر الاجتماعات", href: "/employee-committees/meetings" },
            { label: "اللجان الشاغرة", href: "/employee-committees/vacancies" },
            { label: "التدريب والدورات", href: "/employee-committees/training" },
            { label: "التقارير", href: "/employee-committees/reports" },
        ],
    },
];

export default function Sidebar({
    mobileOpen,
    onCloseMobileMenu,
    permissions,
}: SidebarProps) {
    const pathname = usePathname();
    const visibleMenuGroups = menuGroups
        .map((group) => {
            if (group.label !== "قسم العقود" || !group.children) {
                return group;
            }

            return {
                ...group,
                children: group.children.filter(
                    (child) =>
                        !("permission" in child) ||
                        permissions.includes(child.permission as string)
                ),
            };
        })
        .filter(
            (group) =>
                !("children" in group) ||
                !group.children ||
                group.children.length > 0
        );

    const [openGroups, setOpenGroups] = useState<string[]>([
        "قسم العقود",
        "قسم الوظيفة العامة",
        "متابعة لجان الموظفين",
    ]);

    function toggleGroup(label: string) {
        setOpenGroups((current) =>
            current.includes(label)
                ? current.filter((item) => item !== label)
                : [...current, label]
        );
    }

    function isCurrentPage(href: string) {
        return pathname === href;
    }

    return (
        <>
            {mobileOpen && (
                <button
                    type="button"
                    className="gov-sidebar-overlay"
                    onClick={onCloseMobileMenu}
                    aria-label="إغلاق القائمة"
                />
            )}

            <aside
                id="gov-main-sidebar"
                className={`gov-sidebar ${mobileOpen ? "mobile-open" : ""}`}
                dir="rtl"
            >
                <div className="gov-sidebar-mobile-header">
                    <strong>القائمة الرئيسية</strong>

                    <button
                        type="button"
                        onClick={onCloseMobileMenu}
                        aria-label="إغلاق القائمة"
                    >
                        <X size={22} />
                    </button>
                </div>

                <nav className="gov-sidebar-nav" aria-label="القائمة الرئيسية">
                    <Link
                        href="/"
                        onClick={onCloseMobileMenu}
                        aria-current={isCurrentPage("/") ? "page" : undefined}
                        className={`gov-sidebar-link ${isCurrentPage("/") ? "active" : ""
                            }`}
                    >
                        <House size={20} />
                        <span>الرئيسية</span>
                        <ChevronLeft size={16} className="gov-sidebar-arrow" />
                    </Link>

                    {visibleMenuGroups.map((group) => {
                        const Icon = group.icon;

                        if ("children" in group && group.children) {
                            const isOpen = openGroups.includes(group.label);

                            const isActive = group.children.some(
                                (child) =>
                                    pathname === child.href ||
                                    pathname.startsWith(child.href + "/")
                            );

                            return (
                                <div className="gov-sidebar-group" key={group.label}>
                                    <button
                                        type="button"
                                        className={`gov-sidebar-group-button ${isOpen ? "expanded" : ""
                                            } ${isActive ? "group-active" : ""}`}
                                        onClick={() => toggleGroup(group.label)}
                                        aria-expanded={isOpen}
                                    >
                                        <Icon size={20} />
                                        <span>{group.label}</span>

                                        {isOpen ? (
                                            <ChevronDown size={16} />
                                        ) : (
                                            <ChevronLeft size={16} />
                                        )}
                                    </button>

                                    {isOpen && (
                                        <div className="gov-sidebar-submenu">
                                            {group.children.map((child) => (
                                                <Link
                                                    href={child.href}
                                                    key={child.href}
                                                    onClick={onCloseMobileMenu}
                                                    aria-current={
                                                        isCurrentPage(child.href)
                                                            ? "page"
                                                            : undefined
                                                    }
                                                    className={`gov-sidebar-subitem ${isCurrentPage(child.href) ? "active" : ""
                                                        }`}
                                                >
                                                    <span>{child.label}</span>
                                                    <ChevronDown size={12} />
                                                </Link>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        }

                        return null;

                    })}
                    {permissions.includes("reports.view") && (
                        <Link
                            href="/reports"
                            onClick={onCloseMobileMenu}
                            aria-current={
                                isCurrentPage("/reports") ? "page" : undefined
                            }
                            className={`gov-sidebar-link ${isCurrentPage("/reports") ? "active" : ""
                                }`}
                        >
                            <ChartNoAxesCombined size={20} />
                            <span>الإحصائيات والتقارير</span>
                            <ChevronLeft size={16} className="gov-sidebar-arrow" />
                        </Link>
                    )}
                    {permissions.includes("users.view") && (
                        <Link
                            href="/users"
                            onClick={onCloseMobileMenu}
                            aria-current={isCurrentPage("/users") ? "page" : undefined}
                            className={`gov-sidebar-link ${isCurrentPage("/users") ? "active" : ""
                                }`}
                        >
                            <UsersRound size={20} />
                            <span>إدارة المستخدمين</span>
                            <ChevronLeft size={16} className="gov-sidebar-arrow" />
                        </Link>
                    )}
                    {permissions.includes("users.manage_permissions") && (
                        <Link
                            href="/settings"
                            onClick={onCloseMobileMenu}
                            aria-current={
                                isCurrentPage("/settings") ? "page" : undefined
                            }
                            className={`gov-sidebar-link ${isCurrentPage("/settings") ? "active" : ""
                                }`}
                        >
                            <Settings size={20} />
                            <span>إدارة النظام</span>
                            <ChevronLeft size={16} className="gov-sidebar-arrow" />
                        </Link>
                    )}
                    <button
                        type="button"
                        className="gov-sidebar-link gov-sidebar-logout"
                        disabled
                        title="يتفعّل بعد إضافة تسجيل الدخول"
                    >
                        <LogOut size={20} />
                        <span>تسجيل الخروج</span>
                        <ChevronLeft size={16} className="gov-sidebar-arrow" />
                    </button>
                </nav>
            </aside>
        </>
    );
}
