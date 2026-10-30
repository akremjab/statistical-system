
import { ShieldCheck } from "lucide-react";

export default function Footer() {
    return (
        <footer className="gov-page-footer">
            <div className="gov-page-footer-right">
                <ShieldCheck size={17} />
                <span>
                    منظومة إدارة شؤون الموظفين بالوحدات الإدارية
                </span>
                <span className="gov-page-footer-divider">|</span>
                <span>الإصدار 1.0</span>
            </div>

            <div className="gov-page-footer-left">
                <span>© 2026 وزارة الخدمة المدنية</span>
                <span className="gov-page-footer-divider">|</span>
                <span>جميع الحقوق محفوظة</span>
            </div>
        </footer>
    );
}
