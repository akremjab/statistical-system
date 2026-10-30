"use client";

import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";

const contractsData = [
    { name: "معتمدة", value: 87, color: "#3689d6" },
    { name: "غير معتمدة", value: 23, color: "#ff9b3d" },
];

const committeesData = [
    { name: "غير شاغرة", value: 112, fill: "#4daf73" },
    { name: "شاغرة", value: 48, fill: "#e45f69" },
];

const regions = [
    { name: "طرابلس", value: 42, color: "#3989d4" },
    { name: "بنغازي", value: 38, color: "#f59b3c" },
    { name: "مصراتة", value: 22, color: "#35a36b" },
    { name: "الزاوية", value: 12, color: "#7d59c7" },
    { name: "سبها", value: 10, color: "#df5965" },
    { name: "الجنوب", value: 8, color: "#23a6ad" },
];

export default function DashboardCharts() {
    return (
        <section className="charts-grid">
            {/* Contracts */}

            <div className="chart-card">
                <h3 className="chart-title">العقود حسب الحالة</h3>

                <div className="contract-chart-body">
                    <div className="donut-wrapper">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={contractsData}
                                    dataKey="value"
                                    nameKey="name"
                                    innerRadius="62%"
                                    outerRadius="88%"
                                    paddingAngle={1}
                                    stroke="none"
                                >
                                    {contractsData.map((entry) => (
                                        <Cell key={entry.name} fill={entry.color} />
                                    ))}
                                </Pie>

                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>

                        <div className="donut-center">
                            <strong>110</strong>
                            <span>إجمالي العقود</span>
                        </div>
                    </div>

                    <div className="contract-legend">
                        <div>
                            <span
                                className="legend-dot"
                                style={{ background: "#3689d6" }}
                            />
                            <span>معتمدة</span>
                            <strong>87</strong>
                            <small>79.1%</small>
                        </div>

                        <div>
                            <span
                                className="legend-dot"
                                style={{ background: "#ff9b3d" }}
                            />
                            <span>غير معتمدة</span>
                            <strong>23</strong>
                            <small>20.9%</small>
                        </div>
                    </div>
                </div>
            </div>

            {/* Committees */}

            <div className="chart-card">
                <h3 className="chart-title">اللجان حسب الحالة</h3>

                <div className="bar-chart-wrapper">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={committeesData}
                            margin={{
                                top: 15,
                                right: 5,
                                left: 5,
                                bottom: 0,
                            }}
                        >
                            <CartesianGrid
                                strokeDasharray="3 3"
                                vertical={false}
                                stroke="#e7edf3"
                            />

                            <XAxis
                                dataKey="name"
                                tick={{ fontSize: 10, fill: "#60758a" }}
                                axisLine={{ stroke: "#dce5ed" }}
                                tickLine={false}
                            />

                            <YAxis
                                domain={[0, 120]}
                                ticks={[0, 30, 60, 90, 120]}
                                tick={{ fontSize: 9, fill: "#8091a3" }}
                                axisLine={false}
                                tickLine={false}
                            />

                            <Tooltip />

                            <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                                {committeesData.map((entry) => (
                                    <Cell key={entry.name} fill={entry.fill} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Regions */}

            <div className="chart-card regions-card">
                <h3 className="chart-title">توزيع اللجان حسب المناطق</h3>

                <div className="regions-body">
                    <div className="map-placeholder">
                        <div className="map-shape map-shape-1" />
                        <div className="map-shape map-shape-2" />
                        <div className="map-shape map-shape-3" />
                        <div className="map-shape map-shape-4" />
                        <div className="map-shape map-shape-5" />

                        <span className="map-pin pin-1">●</span>
                        <span className="map-pin pin-2">●</span>
                        <span className="map-pin pin-3">●</span>
                        <span className="map-pin pin-4">●</span>
                    </div>

                    <div className="regions-list">
                        <div className="regions-heading">
                            <span>المنطقة / المدينة</span>
                            <span>عدد اللجان</span>
                        </div>

                        {regions.map((region) => (
                            <div className="region-row" key={region.name}>
                                <div>
                                    <span
                                        className="region-pin"
                                        style={{ color: region.color }}
                                    >
                                        ●
                                    </span>

                                    <span>{region.name}</span>
                                </div>

                                <strong>{region.value}</strong>
                            </div>
                        ))}

                        <p className="map-note">
                            يمكن عرض الخريطة بشكل تفاعلي لاحقًا
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
}