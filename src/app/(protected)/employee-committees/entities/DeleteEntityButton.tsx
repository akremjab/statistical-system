"use client";

// زر حذف الجهة الإدارية مع تأكيد المستخدم وعرض نتيجة العملية.
import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
    entityId: string;
    entityName: string;
};

export default function DeleteEntityButton({ entityId, entityName }: Props) {
    const router = useRouter();
    const [deleting, setDeleting] = useState(false);

    async function handleDelete() {
        const confirmed = window.confirm(
            `هل أنت متأكد من حذف الجهة الإدارية "${entityName}" نهائيًا؟\n\nلا يمكن التراجع عن الحذف.`
        );

        if (!confirmed) return;

        setDeleting(true);

        try {
            const response = await fetch(
                `/api/administrative-entities/${encodeURIComponent(entityId)}`,
                { method: "DELETE" }
            );

            const result: { success?: boolean; error?: string } =
                await response.json();

            if (!response.ok || !result.success) {
                window.alert(result.error || "تعذر حذف الجهة الإدارية.");
                return;
            }

            window.alert("تم حذف الجهة الإدارية بنجاح.");
            router.refresh();
        } catch {
            window.alert(
                "تعذر التأكد من نتيجة الحذف. يرجى تحديث الصفحة والتحقق قبل إعادة المحاولة."
            );
        } finally {
            setDeleting(false);
        }
    }

    return (
        <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "8px 16px",
                background: "#fef2f2",
                color: "#dc2626",
                border: "1px solid #fecaca",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                cursor: deleting ? "wait" : "pointer",
                whiteSpace: "nowrap",
            }}
        >
            {deleting ? "جارٍ الحذف..." : "حذف"}
        </button>
    );
}