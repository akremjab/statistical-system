
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import {
    UserRoundPlus,
    FilePlus2,
    ChartNoAxesCombined,
    Search,
    ArrowLeft,
    CheckCircle2,
    XCircle,
    PlusCircle,
    Building2,
} from "lucide-react";

import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    Tooltip,
} from "recharts";

const quickActions = [
    {
        title: "إضافة موظف",
        href: "/employees/new",
        icon: UserRoundPlus,
        color: "blue",
    },
    {
        title: "إضافة عقد",
        href: "/contracts/new",
        icon: FilePlus2,
        color: "purple",
    },
    {
        title: "تقرير جديد",
        href: "/reports",
        icon: ChartNoAxesCombined,
        color: "violet",
    },
    {
        title: "البحث المتقدم",
        href: "/search",
        icon: Search,
        color: "orange",
    },
];

const administrativeUnits = [
    { name: "وزارة الخدمة المدنية", count: 245 },
    { name: "بلدية طرابلس", count: 312 },
    { name: "وزارة التربية والتعليم", count: 178 },
    { name: "وزارة الصحة", count: 206 },
    { name: "الهيئة العامة للموارد المائية", count: 143 },
];

const recentActivities = [
    {
        id: 1,
        title: "تم إضافة عقد جديد من جهة وزارة التربية والتعليم",
        time: "اليوم 09:45 ص",
        type: "new",
    },
    {
        id: 2,
        title: "تم اعتماد عقد رقم (2026/458) من جهة بلدية طرابلس",
        time: "اليوم 08:20 ص",
        type: "success",
    },
    {
        id: 3,
        title: "تم إرجاع عقد رقم (2026/312) لعدم استيفاء الشروط",
        time: "أمس 03:05 م",
        type: "success",
    },
    {
        id: 4,
        title: "تم تحديث بيانات موظف في قسم الوظيفة العامة",
        time: "أمس 11:20 ص",
        type: "error",
    },
];

const employeeDistribution = [
    { name: "القطاع العام", value: 45, color: "#287de5" },
    { name: "البلديات", value: 28, color: "#1fa695" },
    { name: "الهيئات والمؤسسات", value: 15, color: "#ffa332" },
    { name: "أخرى", value: 12, color: "#7957e5" },
];

export default function DashboardOverview() {
    const [search, setSearch] = useState("");

    const filteredUnits = useMemo(
        () =>
            administrativeUnits.filter((unit) =>
                unit.name.includes(search.trim())
            ),
        [search]
    );

    return (
        <section className="gov-overview-grid">

            {/* Quick actions */}
            <article className="gov-overview-panel">
                <h3 className="gov-overview-title">أدوات سريعة</h3>

                <div className="gov-quick-actions">
                    {quickActions.map((action) => {
                        const Icon = action.icon;

                        return (
                            <Link
                                key={action.title}
                                href={action.href}
                                className={`gov-quick-action gov-quick-${action.color}`}
                            >
                                <Icon size={24} strokeWidth={2.2} />
                                <span>{action.title}</span>
                            </Link>
                        );
                    })}
                </div>
            </article>

            {/* Administrative units */}
            <article className="gov-overview-panel">
                <h3 className="gov-overview-title">الوحدات الإدارية</h3>

                <div className="gov-unit-search">
                    <Search size={15} />
                    <input
                        type="search"
                        placeholder="ابحث عن جهة أو وحدة إدارية..."
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        aria-label="البحث عن وحدة إدارية"
                    />
                </div>

                <div className="gov-unit-list">
                    {filteredUnits.length > 0 ? (
                        filteredUnits.map((unit) => (
                            <div className="gov-unit-row" key={unit.name}>
                                <span>{unit.name}</span>
                                <strong>{unit.count}</strong>
                            </div>
                        ))
                    ) : (
                        <p className="gov-unit-empty">
                            لا توجد وحدات مطابقة للبحث
                        </p>
                    )}
                </div>

                <Link href="/basic-data" className="gov-overview-more">
                    عرض الكل
                    <ArrowLeft size={14} />
                </Link>
            </article>

            {/* Recent activities */}
            <article className="gov-overview-panel">
                <h3 className="gov-overview-title">أحدث الأنشطة</h3>

                <div className="gov-activity-list">
                    {recentActivities.map((activity) => (
                        <div className="gov-activity-row" key={activity.id}>
                            <span
                                className={`gov-activity-icon gov-activity-${activity.type}`}
                            >
                                {activity.type === "new" ? (
                                    <PlusCircle size={16} />
                                ) : activity.type === "success" ? (
                                    <CheckCircle2 size={16} />
                                ) : (
                                    <XCircle size={16} />
                                )}
                            </span>

                            <div className="gov-activity-content">
                                <strong>{activity.title}</strong>
                                <small>{activity.time}</small>
                            </div>
                        </div>
                    ))}
                </div>

                <Link href="/activities" className="gov-overview-more">
                    عرض الكل
                    <ArrowLeft size={14} />
                </Link>
            </article>

            {/* General statistics */}
            <article className="gov-overview-panel">
                <h3 className="gov-overview-title">إحصائيات عامة</h3>

                <div className="gov-general-stats">
                    <div className="gov-general-chart">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={employeeDistribution}
                                    dataKey="value"
                                    nameKey="name"
                                    innerRadius="66%"
                                    outerRadius="92%"
                                    stroke="#ffffff"
                                    strokeWidth={2}
                                    isAnimationActive={false}
                                >
                                    {employeeDistribution.map((entry) => (
                                        <Cell
                                            key={entry.name}
                                            fill={entry.color}
                                        />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value) => `${value}%`} />
                            </PieChart>
                        </ResponsiveContainer>

                        <div className="gov-general-center">
                            <strong>3,642</strong>
                            <span>موظف</span>
                        </div>
                    </div>

                    <div className="gov-general-legend">
                        {employeeDistribution.map((item) => (
                            <div key={item.name}>
                                <span
                                    className="gov-general-dot"
                                    style={{ background: item.color }}
                                />
                                <span>{item.name}</span>
                                <strong>{item.value}%</strong>
                            </div>
                        ))}
                    </div>
                </div>
            </article>
        </section>
    );
}
