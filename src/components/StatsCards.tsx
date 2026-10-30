
import {
    UsersRound,
    Search,
    X,
    Hourglass,
    CircleCheck,
    FileText,
} from "lucide-react";

const stats = [
    {
        title: "إجمالي الموظفين",
        value: 3642,
        unit: "موظف",
        icon: UsersRound,
        color: "teal",
    },
    {
        title: "مراجعة العقود",
        value: 98,
        unit: "عقد",
        icon: Search,
        color: "blue",
    },
    {
        title: "العقود غير المعتمدة",
        value: 140,
        unit: "عقد",
        icon: X,
        color: "red",
    },
    {
        title: "قيد الإجراء",
        value: 216,
        unit: "عقد",
        icon: Hourglass,
        color: "amber",
    },
    {
        title: "العقود المعتمدة",
        value: 892,
        unit: "عقد",
        icon: CircleCheck,
        color: "green",
    },
    {
        title: "إجمالي العقود المستلمة",
        value: 1248,
        unit: "عقد",
        icon: FileText,
        color: "purple",
    },
];

export default function StatsCards() {
    return (
        <section className="gov-stats-grid" aria-label="ملخص الإحصائيات">
            {stats.map((stat) => {
                const Icon = stat.icon;

                return (
                    <article
                        key={stat.title}
                        className={`gov-stat-card gov-stat-${stat.color}`}
                    >
                        <div className="gov-stat-icon">
                            <Icon size={29} strokeWidth={2.2} />
                        </div>

                        <div className="gov-stat-content">
                            <h3>{stat.title}</h3>

                            <strong className="gov-stat-value">
                                {stat.value.toLocaleString("en-US")}
                            </strong>

                            <span className="gov-stat-unit">
                                {stat.unit}
                            </span>
                        </div>
                    </article>
                );
            })}
        </section>
    );
}
