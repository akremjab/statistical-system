const contracts = [
    {
        id: 1,
        department: "إدارة التخطيط والمتابعة",
        approved: 18,
        pending: 4,
        total: 22,
    },
    {
        id: 2,
        department: "إدارة الشؤون الإدارية والمالية",
        approved: 12,
        pending: 3,
        total: 15,
    },
    {
        id: 3,
        department: "إدارة الموارد البشرية وتطوير الأداء",
        approved: 10,
        pending: 5,
        total: 15,
    },
    {
        id: 4,
        department: "إدارة الشؤون القانونية والخدمات الإدارية",
        approved: 9,
        pending: 3,
        total: 12,
    },
    {
        id: 5,
        department: "الإدارة العامة لشؤون الخدمة",
        approved: 8,
        pending: 4,
        total: 12,
    },
    {
        id: 6,
        department: "إدارة التنظيم الإداري والملاك",
        approved: 6,
        pending: 3,
        total: 9,
    },
];

const committees = [
    {
        id: 1,
        name: "لجنة شؤون الموظفين",
        status: "شاغرة",
        city: "طرابلس",
        region: "غرب ليبيا",
    },
    {
        id: 2,
        name: "لجنة الترقيات",
        status: "شاغرة",
        city: "بنغازي",
        region: "شرق ليبيا",
    },
    {
        id: 3,
        name: "لجنة العقود",
        status: "غير شاغرة",
        city: "مصراتة",
        region: "غرب ليبيا",
    },
    {
        id: 4,
        name: "لجنة التدريب",
        status: "غير شاغرة",
        city: "الزاوية",
        region: "غرب ليبيا",
    },
    {
        id: 5,
        name: "لجنة الجزاءات",
        status: "شاغرة",
        city: "سبها",
        region: "جنوب ليبيا",
    },
    {
        id: 6,
        name: "لجنة الملاك",
        status: "غير شاغرة",
        city: "طرابلس",
        region: "غرب ليبيا",
    },
];

const reports = [
    {
        icon: "▤",
        title: "تقرير العقود المعتمدة وغير المعتمدة",
    },
    {
        icon: "♟",
        title: "تقرير اللجان الشاغرة وغير الشاغرة",
    },
    {
        icon: "●",
        title: "تقرير حسب المنطقة / المدينة",
    },
    {
        icon: "▥",
        title: "تقرير تفصيلي بالجهات الإدارية",
    },
    {
        icon: "X",
        title: "تصدير البيانات إلى Excel",
    },
];

export default function DashboardTables() {
    return (
        <section className="dashboard-bottom-grid">
            {/* Contracts Table */}

            <div className="data-panel contracts-panel">
                <div className="data-panel-header">
                    <h3>حصر العقود حسب الجهة الإدارية</h3>

                    <div className="table-actions">
                        <button type="button">تصدير</button>
                        <button type="button" title="Excel">
                            X
                        </button>
                        <button type="button" title="PDF">
                            PDF
                        </button>
                        <button type="button" title="طباعة">
                            ⎙
                        </button>
                    </div>
                </div>

                <div className="table-wrapper">
                    <table className="dashboard-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>الجهة الإدارية</th>
                                <th>معتمد</th>
                                <th>غير معتمد</th>
                                <th>الإجمالي</th>
                            </tr>
                        </thead>

                        <tbody>
                            {contracts.map((contract) => (
                                <tr key={contract.id}>
                                    <td>{contract.id}</td>
                                    <td className="table-name">{contract.department}</td>
                                    <td>{contract.approved}</td>
                                    <td>{contract.pending}</td>
                                    <td>{contract.total}</td>
                                </tr>
                            ))}
                        </tbody>

                        <tfoot>
                            <tr>
                                <td colSpan={2}>الإجمالي</td>
                                <td>87</td>
                                <td>23</td>
                                <td>110</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            {/* Committees Table */}

            <div className="data-panel committees-panel">
                <div className="data-panel-header">
                    <h3>حصر اللجان حسب الحالة والمكان</h3>

                    <div className="table-actions">
                        <button type="button">تصدير</button>
                        <button type="button">X</button>
                        <button type="button">PDF</button>
                        <button type="button">⎙</button>
                    </div>
                </div>

                <div className="table-wrapper">
                    <table className="dashboard-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>اسم اللجنة</th>
                                <th>الحالة</th>
                                <th>المدينة</th>
                                <th>المنطقة</th>
                            </tr>
                        </thead>

                        <tbody>
                            {committees.map((committee) => (
                                <tr key={committee.id}>
                                    <td>{committee.id}</td>

                                    <td className="table-name">
                                        {committee.name}
                                    </td>

                                    <td>
                                        <span
                                            className={
                                                committee.status === "شاغرة"
                                                    ? "status-badge status-vacant"
                                                    : "status-badge status-filled"
                                            }
                                        >
                                            {committee.status}
                                        </span>
                                    </td>

                                    <td>{committee.city}</td>
                                    <td>{committee.region}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="committee-summary">
                    <span>
                        إجمالي اللجان
                        <strong>160</strong>
                    </span>

                    <span className="summary-green">
                        غير شاغرة
                        <strong>112</strong>
                    </span>

                    <span className="summary-red">
                        شاغرة
                        <strong>48</strong>
                    </span>
                </div>
            </div>

            {/* Quick Reports */}

            <div className="data-panel reports-panel">
                <div className="data-panel-header">
                    <h3>تقارير سريعة</h3>
                </div>

                <div className="quick-reports">
                    {reports.map((report) => (
                        <button
                            className="quick-report"
                            type="button"
                            key={report.title}
                        >
                            <span className="report-icon">{report.icon}</span>

                            <span>{report.title}</span>

                            <strong>‹</strong>
                        </button>
                    ))}
                </div>

                <div className="reports-footer">
                    <span className="reports-chart">▥</span>

                    <div>
                        <strong>نحو إدارة أكثر كفاءة</strong>
                        <span>بالبيانات والتحليل</span>
                    </div>
                </div>
            </div>
        </section>
    );
}