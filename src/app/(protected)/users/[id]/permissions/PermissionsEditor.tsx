"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type PermissionItem = {
    id: string;
    code: string;
    name_ar: string;
    description: string | null;
    granted: boolean;
};

type PermissionsEditorProps = {
    userId: string;
    permissions: PermissionItem[];
    accountType: "system_admin" | "standard";
    delegablePermissionCodes: string[];
};

const permissionGroups = [
    { prefix: "contracts.", title: "إدارة العقود" },
    { prefix: "correspondences.", title: "المراسلات" },
    { prefix: "attachments.", title: "المرفقات" },
    { prefix: "reports.", title: "التقارير" },
    { prefix: "audit.", title: "سجل التدقيق" },
    { prefix: "users.", title: "إدارة المستخدمين" },
    { prefix: "sessions.", title: "إدارة الجلسات" },
];

export default function PermissionsEditor({
    userId,
    permissions,
    accountType,
    delegablePermissionCodes,
}: PermissionsEditorProps) {
    const router = useRouter();
    const [original, setOriginal] = useState<string[]>(
        permissions.filter((item) => item.granted).map((item) => item.code)
    );
    const [selected, setSelected] = useState<string[]>(original);
    const isProtected = accountType === "system_admin";
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState("");
    const [saveSuccess, setSaveSuccess] = useState("");
    const [hasConflict, setHasConflict] = useState(false);

    const hasChanges =
        selected.length !== original.length ||
        selected.some((code) => !original.includes(code));

    useEffect(() => {
        const latest = permissions
            .filter((item) => item.granted)
            .map((item) => item.code);

        if (isSaving || hasChanges || hasConflict) return;

        const isDifferent =
            latest.length !== original.length ||
            latest.some((code) => !original.includes(code));

        if (isDifferent) {
            setOriginal(latest);
            setSelected(latest);
            setSaveSuccess("");
        }
    }, [permissions, isSaving, hasChanges, hasConflict, original]);
    function togglePermission(code: string) {
        if (isProtected || isSaving || !delegablePermissionCodes.includes(code)) return;
        setSaveSuccess("");
        setSaveError("");
        setSelected((current) =>
            current.includes(code)
                ? current.filter((item) => item !== code)
                : [...current, code]
        );
    }

    function resetChanges() {
        if (isSaving) return;
        setSelected(original);
        setSaveSuccess("");
        if (!hasConflict) setSaveError("");
    }
    async function saveChanges() {
        if (isProtected || isSaving || !hasChanges || hasConflict) return;
        setIsSaving(true);
        setSaveError("");
        setSaveSuccess("");
        try {
            const response = await fetch(
                `/api/users/${encodeURIComponent(userId)}/permissions`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    credentials: "same-origin",
                    body: JSON.stringify({
                        permissionCodes: selected,
                        expectedPermissionCodes: original,
                    }),
                }
            );
            const result: {
                success?: boolean;
                error?: string;
                message?: string;
            } = await response.json();
            if (response.status === 409 || response.status === 503) {
                setHasConflict(true);
                setSaveError(
                    result.error ||
                    "تغيّرت صلاحيات المستخدم من جلسة أخرى. حدّث الصفحة وراجع الصلاحيات قبل الحفظ."
                );
                return;
            }
            if (!response.ok || !result.success) {
                setSaveError(
                    result.error ||
                    "تعذر حفظ الصلاحيات. يرجى المحاولة لاحقًا."
                );
                return;
            }
            setOriginal([...selected]);
            setSaveSuccess(result.message || "تم حفظ الصلاحيات بنجاح.");
        } catch {
            setHasConflict(true);
            setSaveError(
                "انقطع الاتصال أو تعذر قراءة استجابة الخادم. قد تكون الصلاحيات حُفظت بالفعل. يرجى تحديث الصفحة ومراجعتها قبل إعادة المحاولة."
            );
        } finally {
            setIsSaving(false);
        }
    }
    return (
        <div style={{ display: "grid", gap: 20 }}>
            <section style={{
                padding: 20,
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: 12,
            }}>
                <strong style={{ color: "#17365d" }}>
                    الصلاحيات المحددة: {selected.length} من {permissions.length}
                </strong>
                <p style={{ color: "#64748b", fontSize: 13, marginBottom: 0 }}>
                    {isProtected
                        ? "حساب مدير المنظومة محمي من تعديل الصلاحيات."
                        : "يمكنك منح أو سحب الصلاحيات التي تمتلكها فقط. تُسجّل جميع التغييرات في سجل التدقيق."}
                </p>
            </section>

            {permissionGroups.map((group) => {
                const items = permissions.filter((item) =>
                    item.code.startsWith(group.prefix)
                );
                if (items.length === 0) return null;

                return (
                    <section key={group.prefix} style={{
                        padding: 24,
                        background: "#ffffff",
                        border: "1px solid #e2e8f0",
                        borderRadius: 12,
                    }}>
                        <h2 style={{
                            color: "#17365d",
                            fontSize: 18,
                            marginTop: 0,
                        }}>
                            {group.title}
                        </h2>
                        <div style={{ display: "grid", gap: 12 }}>
                            {items.map((permission) => (
                                <label key={permission.id} style={{
                                    display: "flex",
                                    alignItems: "flex-start",
                                    gap: 12,
                                    padding: 12,
                                    background: "#f8fafc",
                                    borderRadius: 8,
                                    cursor: isProtected || !delegablePermissionCodes.includes(permission.code)
                                        ? "not-allowed"
                                        : "pointer",
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={selected.includes(permission.code)}
                                        disabled={isProtected || isSaving || !delegablePermissionCodes.includes(permission.code)}
                                        onChange={() => togglePermission(permission.code)}
                                        style={{ marginTop: 5 }}
                                    />
                                    <span>
                                        <strong style={{
                                            display: "block",
                                            color: "#17365d",
                                        }}>
                                            {permission.name_ar}
                                        </strong>
                                        <small style={{
                                            color: "#64748b",
                                            lineHeight: 1.8,
                                        }}>
                                            {permission.description || permission.code}
                                            {!isProtected && !delegablePermissionCodes.includes(permission.code) && (
                                                <span style={{ display: "block", color: "#b45309" }}>
                                                    لا تملك صلاحية منح أو سحب هذا الإذن.
                                                </span>
                                            )}
                                        </small>
                                    </span>
                                </label>
                            ))}
                        </div>
                    </section>
                );
            })}

            {!isProtected && (
                <section style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                }}>
                    <button
                        type="button"
                        onClick={saveChanges}
                        disabled={!hasChanges || isSaving || hasConflict}
                        style={{
                            padding: "12px 24px",
                            background: !hasChanges || isSaving || hasConflict
                                ? "#94a3b8"
                                : "#17365d",
                            color: "#ffffff",
                            border: 0,
                            borderRadius: 8,
                            fontWeight: 700,
                            cursor: !hasChanges || isSaving || hasConflict
                                ? "not-allowed"
                                : "pointer",
                        }}
                    >
                        {isSaving ? "جارٍ حفظ الصلاحيات..." : "حفظ التغييرات"}
                    </button>
                    <button
                        type="button"
                        onClick={resetChanges}
                        disabled={!hasChanges || isSaving}
                        style={{
                            padding: "12px 24px",
                            background: "#ffffff",
                            color: "#17365d",
                            border: "1px solid #cbd5e1",
                            borderRadius: 8,
                            fontWeight: 700,
                            cursor: hasChanges ? "pointer" : "not-allowed",
                        }}
                    >
                        التراجع عن التغييرات
                    </button>
                    {saveError && (
                        <p role="alert" style={{
                            color: "#b91c1c",
                            fontSize: 13,
                            margin: 0,
                        }}>
                            {saveError}
                        </p>
                    )}
                    {saveSuccess && (
                        <p role="status" style={{
                            color: "#15803d",
                            fontSize: 13,
                            margin: 0,
                        }}>
                            {saveSuccess}
                        </p>
                    )}
                    {hasChanges && (
                        <span style={{ color: "#b45309", fontSize: 13 }}>
                            توجد تغييرات غير محفوظة.
                        </span>
                    )}
                    {hasConflict && (
                        <button
                            type="button"
                            onClick={() => window.location.reload()}
                            style={{
                                padding: "12px 24px",
                                background: "#17365d",
                                color: "#ffffff",
                                border: 0,
                                borderRadius: 8,
                                fontWeight: 700,
                                cursor: "pointer",
                            }}
                        >
                            تحديث الصفحة ومراجعة الصلاحيات
                        </button>
                    )}
                </section>
            )}
        </div>
    );
}