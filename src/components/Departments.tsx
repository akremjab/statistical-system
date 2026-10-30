
import Link from "next/link";
import {
    FileText,
    BriefcaseBusiness,
    UsersRound,
    ClipboardList,
    CircleCheck,
    Hourglass,
    XCircle,
    Search,
    ChartColumnIncreasing,
    MessageSquareText,
    Clock3,
    AlertTriangle,
    Building2,
    UserRoundCheck,
    GraduationCap,
    ArrowLeft,
    LockKeyhole,
    FilePenLine,
    ContactRound,
    CalendarDays,
} from "lucide-react";

const departments = [
    {
        id: "contracts",
        title: "قسم العقود",
        description:
            "إدارة ومتابعة كافة أنواع العقود لكافة الجهات والبلديات.",
        code: "CT-003",
        icon: FileText,
        theme: "orange",
        managementHref: "/contracts",
        services: [
            {
                title: "إجمالي العقود المستلمة من الجهات",
                description: "تسجيل عدد العقود المستلمة وتوزيعها حسب الجهات",
                icon: ClipboardList,
                href: "/contracts",
            },
            {
                title: "العقود المعتمدة",
                description: "تسجيل العقود المعتمدة وعددها من أي جهة وردت",
                icon: CircleCheck,
                href: "/contracts?status=approved",
            },
            {
                title: "قيد الإجراء",
                description: "العقود المستوفية للشروط والمعلقة للاعتماد فقط",
                icon: Hourglass,
                href: "/contracts?status=processing",
            },
            {
                title: "العقود غير المعتمدة",
                description: "تسجيل عدد العقود غير المعتمدة والجهة الراجعة إليها",
                icon: XCircle,
                href: "/contracts?status=rejected",
            },
            {
                title: "مراجعة العقود",
                description: "التحقق من استيفاء الشروط وتسجيل السبب وتاريخ الإرجاع",
                icon: Search,
                href: "/contracts?status=review",
            },
            {
                title: "تقارير العقود",
                description: "تقارير شاملة بإجمالي العقود لكل جهة وحالتها",
                icon: ChartColumnIncreasing,
                href: "/contracts/reports",
            },
        ],
    },
    {
        id: "public-service",
        title: "قسم الوظيفة العامة",
        description:
            "متابعة أذونات التعاقد والآراء الفنية والردود الخاصة بالوظيفة العامة.",
        code: "GP-002",
        icon: BriefcaseBusiness,
        theme: "green",
        managementHref: "/public-service",
        services: [
            {
                title: "إذن التعاقد",
                description: "منح إذن التعاقد للجهات وفقًا للاحتياج واللوائح",
                icon: BriefcaseBusiness,
                href: "/public-service/permissions",
            },
            {
                title: "إبداء الرأي الفني",
                description: "إبداء الرأي الفني على العقود والطلبات الواردة",
                icon: FilePenLine,
                href: "/public-service/opinions",
            },
            {
                title: "الردود",
                description: "متابعة الردود على الطلبات والمراسلات",
                icon: MessageSquareText,
                href: "/public-service/follow-up",
            },
            {
                title: "سبب التأخير",
                description: "تسجيل سبب التأخير في الإجراءات (إن وجد)",
                icon: AlertTriangle,
                href: "/public-service/delays",
            },
            {
                title: "قيد الإجراء",
                description: "متابعة الطلبات قيد الإجراء حتى الاعتماد",
                icon: Hourglass,
                href: "/public-service/processing",
            },
            {
                title: "التقارير",
                description: "تقارير تفصيلية وإحصائية",
                icon: ChartColumnIncreasing,
                href: "/public-service/reports",
            },
        ],
    },
    {
        id: "committees",
        title: "متابعة لجان الموظفين بالوحدات الإدارية",
        description:
            "متابعة عمل لجان الموظفين وتنسيق أعمالها على مستوى الوحدات الإدارية.",
        code: "LJ-001",
        icon: UsersRound,
        theme: "blue",
        managementHref: "/committees",
        services: [
            {
                title: "الجهات واللجان",
                description: "إدخال أسماء الجهات واللجان لكافة الوحدات الإدارية",
                icon: Building2,
                href: "/committees",
            },
            {
                title: "المندوبين",
                description: "أسماء المندوبين واللجنة المكلف بها وتاريخ التكليف",
                icon: ContactRound,
                href: "/committees/delegates",
            },
            {
                title: "محاضر الاجتماعات",
                description: "مراجعة محاضر اجتماعات مندوبي لجان الموظفين",
                icon: ClipboardList,
                href: "/committees/meetings",
            },
            {
                title: "اللجان الشاغرة وغير الشاغرة",
                description: "متابعة وعرض اللجان الشاغرة وغير الشاغرة",
                icon: UserRoundCheck,
                href: "/committees/vacancies",
            },
            {
                title: "التدريب والدورات",
                description: "اقتراح برامج تدريبية وأسماء الدورات",
                icon: GraduationCap,
                href: "/committees/training",
            },
            {
                title: "التقارير",
                description: "تقارير شاملة حسب الحاجة",
                icon: ChartColumnIncreasing,
                href: "/committees/reports",
            },
        ],
    },
];

export default function Departments() {
    return (
        <section className="gov-departments" aria-label="أقسام المنظومة">
            {departments.map((department) => {
                const DepartmentIcon = department.icon;

                return (
                    <article
                        key={department.id}
                        className={`gov-department gov-department-${department.theme}`}
                    >
                        <header className="gov-department-header">
                            <DepartmentIcon size={28} strokeWidth={2} />
                            <h2>{department.title}</h2>
                        </header>

                        <div className="gov-department-body">
                            <p className="gov-department-description">
                                {department.description}
                            </p>

                            <div className="gov-department-services">
                                {department.services.map((service) => {
                                    const ServiceIcon = service.icon;

                                    return (
                                        <Link
                                            href={service.href}
                                            key={service.title}
                                            className="gov-department-service"
                                        >
                                            <span className="gov-department-service-icon">
                                                <ServiceIcon size={20} strokeWidth={2} />
                                            </span>

                                            <span className="gov-department-service-content">
                                                <strong>{service.title}</strong>
                                                <small>{service.description}</small>
                                            </span>
                                        </Link>
                                    );
                                })}
                            </div>

                            <footer className="gov-department-footer">
                                <Link href={department.managementHref}>
                                    <ArrowLeft size={16} />
                                    <span>إدارة القسم</span>
                                </Link>

                                <div>
                                    <span>الرمز الخاص بالقسم</span>
                                    <strong>{department.code}</strong>
                                    <LockKeyhole size={13} />
                                </div>
                            </footer>
                        </div>
                    </article>
                );
            })}
        </section>
    );
}
