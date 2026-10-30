export default function DashboardFilters() {
    return (
        <section className="dashboard-filters">
            <div className="filter-field date-field">
                <label>تاريخ الإحصاء</label>

                <div className="filter-input">
                    <span className="filter-calendar">▣</span>
                    <span>2026/10/03</span>
                </div>
            </div>

            <div className="filter-field">
                <label>اللجنة</label>

                <select defaultValue="all">
                    <option value="all">جميع اللجان</option>
                    <option value="1">لجنة شؤون الموظفين</option>
                    <option value="2">لجنة العقود</option>
                    <option value="3">لجنة التدريب</option>
                </select>
            </div>

            <div className="filter-field">
                <label>حالة العقد</label>

                <select defaultValue="all">
                    <option value="all">جميع الحالات</option>
                    <option value="approved">معتمد</option>
                    <option value="pending">غير معتمد</option>
                </select>
            </div>

            <div className="filter-field">
                <label>نوع العقد</label>

                <select defaultValue="all">
                    <option value="all">جميع الأنواع</option>
                    <option value="permanent">دائم</option>
                    <option value="temporary">مؤقت</option>
                    <option value="contract">عقد عمل</option>
                </select>
            </div>

            <div className="filter-field">
                <label>الجهة الإدارية</label>

                <select defaultValue="all">
                    <option value="all">جميع الجهات</option>
                    <option value="1">إدارة التخطيط والمتابعة</option>
                    <option value="2">إدارة الشؤون الإدارية</option>
                    <option value="3">إدارة الشؤون المالية</option>
                </select>
            </div>

            <div className="filter-field">
                <label>المنطقة / المدينة</label>

                <select defaultValue="all">
                    <option value="all">جميع المناطق</option>
                    <option value="tripoli">طرابلس</option>
                    <option value="benghazi">بنغازي</option>
                    <option value="misrata">مصراتة</option>
                    <option value="zawiya">الزاوية</option>
                    <option value="sabha">سبها</option>
                </select>
            </div>

            <button className="refresh-button" type="button">
                <span className="refresh-icon">↻</span>
                تحديث البيانات
            </button>
        </section>
    );
}