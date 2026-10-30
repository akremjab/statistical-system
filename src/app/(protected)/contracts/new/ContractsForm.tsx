
"use client";

import { useRef, useState } from "react";
import styles from "./IncomingCorrespondenceForm.module.css";

export type Contract = {
    id: number;
    nationalNumber: string;
    fullName: string;
    qualification: string;
    specialization: string;
    jobTitle: string;
    grade: string;
    contractType: string;
    contractNumber: string;
    notes: string;
    attachments: File[];
    personVersion: string | null;
};

type ContractField = keyof Omit<
    Contract,
    "id" | "attachments" | "personVersion"
>;

export function createEmptyContract(id: number): Contract {
    return {
        id,
        nationalNumber: "",
        fullName: "",
        qualification: "",
        specialization: "",
        jobTitle: "",
        grade: "",
        contractType: "",
        contractNumber: "",
        notes: "",
        attachments: [],
        personVersion: null,
    };
}

const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;

const ALLOWED_ATTACHMENT_TYPES = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
]);

function validateAttachment(file: File): string | null {
    if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
        return `الملف "${file.name}" غير مسموح. الأنواع المقبولة: PDF وJPG وPNG فقط.`;
    }

    if (file.size > MAX_ATTACHMENT_SIZE) {
        return `الملف "${file.name}" يتجاوز الحجم المسموح (20 MB).`;
    }

    return null;
}

type ContractsFormProps = {
    contracts: Contract[];
    setContracts: React.Dispatch<React.SetStateAction<Contract[]>>;
    personUpdateDecisions: Record<number, PersonUpdateDecision>;
    setPersonUpdateDecisions: React.Dispatch<
        React.SetStateAction<Record<number, PersonUpdateDecision>>
    >;
};
export type PersonUpdateDecision = "keep" | "update";
export default function ContractsForm({
    contracts,
    setContracts,
    personUpdateDecisions,
    setPersonUpdateDecisions,
}: ContractsFormProps) {







    const [nextId, setNextId] = useState(2);
    const latestLookupRequests = useRef<Record<number, string>>({});

    type ExistingPerson = {
        id: string;
        nationalNumber: string;
        fullName: string;
        qualification: string;
        specialization: string;
        version: string;
    };



    type PersonLookupState = {
        requestId: string;
        loading: boolean;
        checkedNationalNumber: string;
        person: ExistingPerson | null;
        error: string;
    };

    const [personLookups, setPersonLookups] = useState<
        Record<number, PersonLookupState>
    >({});

    const [attachmentErrors, setAttachmentErrors] = useState<
        Record<number, string>
    >({});

    function updateContract(
        id: number,
        field: ContractField,
        value: string
    ) {
        setContracts((current) =>
            current.map((contract) =>
                contract.id === id
                    ? {
                        ...contract,
                        [field]: value,
                        personVersion:
                            field === "nationalNumber"
                                ? null
                                : contract.personVersion,
                    }
                    : contract
            )
        );
        // مسح نتيجة البحث السابقة عند تغيير الرقم الوطني.
        delete latestLookupRequests.current[id];
        if (field === "nationalNumber") {
            setPersonLookups((current) => {
                if (!(id in current)) {
                    return current;
                }

                const updated = { ...current };
                delete updated[id];

                return updated;
            });
        }
        // إلغاء قرار المراجعة إذا تغيرت بيانات الشخص.
        if (
            field === "nationalNumber" ||
            field === "fullName" ||
            field === "qualification" ||
            field === "specialization"
        ) {
            setPersonUpdateDecisions((current) => {
                if (!(id in current)) {
                    return current;
                }

                const updated = { ...current };
                delete updated[id];

                return updated;
            });
        }
    }
    async function lookupPerson(
        contractId: number,
        nationalNumber: string
    ) {
        const normalizedNumber = nationalNumber.trim();
        const requestId = crypto.randomUUID();
        latestLookupRequests.current[contractId] = requestId;

        // إلغاء أي بصمة سابقة بمجرد بدء بحث جديد.
        setContracts((current) =>
            current.map((contract) =>
                contract.id === contractId
                    ? {
                        ...contract,
                        personVersion: null,
                    }
                    : contract
            )
        );
        if (!normalizedNumber || normalizedNumber.length > 30) {
            setPersonLookups((current) => ({
                ...current,
                [contractId]: {
                    requestId,
                    loading: false,
                    checkedNationalNumber: normalizedNumber,
                    person: null,
                    error: "يرجى إدخال رقم وطني صالح لا يتجاوز 30 حرفًا.",
                },
            }));
            return;
        }

        setPersonLookups((current) => ({
            ...current,
            [contractId]: {
                requestId,
                loading: true,
                checkedNationalNumber: normalizedNumber,
                person: null,
                error: "",
            },
        }));

        try {
            const response = await fetch(
                `/api/persons/lookup?nationalNumber=${encodeURIComponent(normalizedNumber)}`,
                {
                    method: "GET",
                    cache: "no-store",
                }
            );

            const data = await response.json();

            if (!response.ok || data.success !== true) {
                throw new Error(
                    data.message || "تعذر البحث عن بيانات الشخص."
                );
            }
            if (
                data.exists === true &&
                typeof data.person?.version !== "string"
            ) {
                throw new Error("لم يتم استلام بصمة بيانات الشخص.");
            }
            if (latestLookupRequests.current[contractId] !== requestId) {
                return;
            }

            setContracts((current) =>
                current.map((contract) =>
                    contract.id === contractId &&
                        contract.nationalNumber.trim() === normalizedNumber
                        ? {
                            ...contract,
                            personVersion:
                                data.exists === true
                                    ? (data.person as ExistingPerson).version
                                    : null,
                        }
                        : contract
                )
            );
            setPersonLookups((current) => {
                // تجاهل نتيجة بحث قديم إذا بدأ بحث أحدث لنفس العقد.
                if (
                    !current[contractId] ||
                    current[contractId].requestId !== requestId ||
                    current[contractId].loading !== true ||
                    current[contractId].checkedNationalNumber !== normalizedNumber
                ) {
                    return current;
                }

                return {
                    ...current,
                    [contractId]: {
                        requestId,
                        loading: false,
                        checkedNationalNumber: normalizedNumber,
                        person: data.exists ? data.person : null,
                        error: "",
                    },
                };
            });
        } catch (error) {
            setPersonLookups((current) => {
                if (
                    !current[contractId] ||
                    current[contractId].requestId !== requestId ||
                    current[contractId].loading !== true ||
                    current[contractId].checkedNationalNumber !== normalizedNumber
                ) {
                    return current;
                }

                return {
                    ...current,
                    [contractId]: {
                        requestId,
                        loading: false,
                        checkedNationalNumber: normalizedNumber,
                        person: null,
                        error:
                            error instanceof Error
                                ? error.message
                                : "حدث خطأ أثناء البحث عن بيانات الشخص.",
                    },
                };
            });
        }
    }
    function getPersonDifferences(
        contract: Contract,
        person: ExistingPerson
    ) {
        const fields = [
            {
                label: "الاسم الكامل",
                currentValue: person.fullName,
                newValue: contract.fullName,
            },
            {
                label: "المؤهل العلمي",
                currentValue: person.qualification,
                newValue: contract.qualification,
            },
            {
                label: "التخصص",
                currentValue: person.specialization,
                newValue: contract.specialization,
            },
        ];

        return fields.filter(
            (field) =>
                field.currentValue.trim() !== field.newValue.trim()
        );
    }
    function addContract() {
        setContracts((current) => [
            ...current,
            createEmptyContract(nextId),
        ]);

        setNextId((current) => current + 1);
    }

    function removeContract(id: number) {
        delete latestLookupRequests.current[id];
        setContracts((current) => {
            if (current.length <= 1) {
                return current;
            }

            return current.filter(
                (contract) => contract.id !== id
            );
        });
        // تنظيف نتيجة البحث الخاصة بالعقد المحذوف.
        setPersonLookups((current) => {
            const updated = { ...current };
            delete updated[id];
            return updated;
        });

        // تنظيف قرار تحديث بيانات الشخص.
        setPersonUpdateDecisions((current) => {
            const updated = { ...current };
            delete updated[id];
            return updated;
        });

        // تنظيف أخطاء المرفقات.
        setAttachmentErrors((current) => {
            const updated = { ...current };
            delete updated[id];
            return updated;
        });
    }

    function isDuplicateNationalNumber(
        contractId: number,
        nationalNumber: string
    ): boolean {
        const normalized = nationalNumber.trim();

        if (!normalized) {
            return false;
        }

        return contracts.some(
            (contract) =>
                contract.id !== contractId &&
                contract.nationalNumber.trim() === normalized
        );
    }

    const fields: {
        key: ContractField;
        label: string;
        placeholder: string;
        required: boolean;
    }[] = [
            {
                key: "nationalNumber",
                label: "الرقم الوطني",
                placeholder: "أدخل الرقم الوطني",
                required: true,
            },
            {
                key: "fullName",
                label: "الاسم الكامل",
                placeholder: "أدخل الاسم الكامل",
                required: true,
            },
            {
                key: "qualification",
                label: "المؤهل العلمي",
                placeholder: "أدخل المؤهل العلمي",
                required: true,
            },
            {
                key: "jobTitle",
                label: "المسمى الوظيفي",
                placeholder: "أدخل المسمى الوظيفي",
                required: true,
            },
            {
                key: "grade",
                label: "الدرجة",
                placeholder: "أدخل الدرجة",
                required: true,
            },
            {
                key: "specialization",
                label: "التخصص",
                placeholder: "أدخل التخصص (اختياري)",
                required: false,
            },
            {
                key: "contractType",
                label: "نوع العقد",
                placeholder: "أدخل نوع العقد",
                required: true,
            },
            {
                key: "contractNumber",
                label: "رقم العقد",
                placeholder: "أدخل رقم العقد (اختياري)",
                required: false,
            },
        ];

    return (
        <section
            dir="rtl"
            className={styles.card}
            style={{ marginTop: "20px" }}
        >
            <div className={styles.heading}>
                <h2 className={styles.title}>
                    العقود المرتبطة بالمراسلة
                </h2>

                <p className={styles.subtitle}>
                    أدخل بيانات الأشخاص والعقود الواردة
                    ضمن هذه المراسلة.
                </p>
            </div>

            <p
                style={{
                    color: "#253b56",
                    fontSize: "13px",
                    fontWeight: 600,
                }}
            >
                عدد العقود: {contracts.length}
            </p>

            {contracts.map((contract, index) => (
                <div
                    key={contract.id}
                    style={{
                        marginTop: "24px",
                        paddingTop: "20px",
                        borderTop:
                            index > 0
                                ? "1px solid #e8edf4"
                                : "none",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "12px",
                            marginBottom: "20px",
                        }}
                    >
                        <h3
                            style={{
                                color: "#17375e",
                                fontSize: "15px",
                                margin: 0,
                            }}
                        >
                            بيانات العقد رقم {index + 1}
                        </h3>

                        {contracts.length > 1 && (
                            <button
                                type="button"
                                onClick={() =>
                                    removeContract(contract.id)
                                }
                                style={{
                                    padding: "8px 14px",
                                    border: "1px solid #f1c5c5",
                                    borderRadius: "8px",
                                    background: "#fff5f5",
                                    color: "#b42332",
                                    fontSize: "12px",
                                    cursor: "pointer",
                                }}
                            >
                                حذف العقد
                            </button>
                        )}
                    </div>

                    <div className={styles.fields}>
                        {fields.map((field) => (
                            <div
                                key={field.key}
                                className={styles.field}
                            >
                                <label
                                    htmlFor={`${field.key}-${contract.id}`}
                                    className={styles.label}
                                >
                                    {field.label}{" "}
                                    {field.required && (
                                        <span
                                            className={styles.required}
                                        >
                                            *
                                        </span>
                                    )}
                                </label>

                                <input
                                    id={`${field.key}-${contract.id}`}
                                    className={styles.input}
                                    type="text"
                                    aria-invalid={
                                        field.key === "nationalNumber" &&
                                        isDuplicateNationalNumber(
                                            contract.id,
                                            contract.nationalNumber
                                        )
                                    }
                                    inputMode={
                                        field.key === "nationalNumber"
                                            ? "numeric"
                                            : "text"
                                    }
                                    required={field.required}
                                    value={contract[field.key]}
                                    onChange={(event) =>
                                        updateContract(
                                            contract.id,
                                            field.key,
                                            event.target.value
                                        )
                                    }
                                    placeholder={field.placeholder}
                                    ref={(element) => {
                                        if (field.key !== "nationalNumber" || !element) {
                                            return;
                                        }

                                        const duplicate = isDuplicateNationalNumber(
                                            contract.id,
                                            contract.nationalNumber
                                        );

                                        element.setCustomValidity(
                                            duplicate
                                                ? "الرقم الوطني مكرر داخل نفس المراسلة."
                                                : ""
                                        );
                                    }}
                                />
                                {field.key === "nationalNumber" && (
                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "10px",
                                            marginTop: "8px",
                                        }}
                                    >
                                        <button
                                            type="button"
                                            disabled={
                                                !contract.nationalNumber.trim() ||
                                                contract.nationalNumber.trim().length > 30 ||
                                                isDuplicateNationalNumber(
                                                    contract.id,
                                                    contract.nationalNumber
                                                ) ||
                                                personLookups[contract.id]?.loading === true
                                            }
                                            onClick={() =>
                                                lookupPerson(
                                                    contract.id,
                                                    contract.nationalNumber
                                                )
                                            }
                                            style={{
                                                padding: "8px 14px",
                                                border: "1px solid #b8cce3",
                                                borderRadius: "8px",
                                                background: "#eef5fc",
                                                color: "#17375e",
                                                fontSize: "12px",
                                                fontWeight: 600,
                                                cursor: "pointer",
                                            }}
                                        >
                                            {personLookups[contract.id]?.loading
                                                ? "جارٍ البحث..."
                                                : "فحص الرقم الوطني"}
                                        </button>
                                    </div>
                                )}
                                {field.key === "nationalNumber" &&
                                    personLookups[contract.id] &&
                                    personLookups[contract.id].checkedNationalNumber ===
                                    contract.nationalNumber.trim() &&
                                    !personLookups[contract.id].loading && (
                                        <p
                                            role="status"
                                            style={{
                                                margin: "8px 0 0",
                                                fontSize: "12px",
                                                fontWeight: 600,
                                                color: personLookups[contract.id].error
                                                    ? "#b42332"
                                                    : personLookups[contract.id].person
                                                        ? "#9a6700"
                                                        : "#167347",
                                            }}
                                        >
                                            {personLookups[contract.id].error
                                                ? personLookups[contract.id].error
                                                : personLookups[contract.id].person
                                                    ? "هذا الرقم الوطني مسجل مسبقًا. ستتم مراجعة بيانات الشخص قبل أي تحديث."
                                                    : "الرقم الوطني غير مسجل مسبقًا. يمكن إدخال بيانات شخص جديد."}
                                        </p>
                                    )}
                                {field.key === "nationalNumber" &&
                                    personLookups[contract.id]?.person &&
                                    personLookups[contract.id].checkedNationalNumber ===
                                    contract.nationalNumber.trim() && (
                                        <div
                                            style={{
                                                marginTop: "12px",
                                                padding: "14px",
                                                border: "1px solid #d6e2f0",
                                                borderRadius: "10px",
                                                background: "#f8fbff",
                                            }}
                                        >
                                            <h4
                                                style={{
                                                    margin: "0 0 12px",
                                                    color: "#17375e",
                                                    fontSize: "13px",
                                                }}
                                            >
                                                مقارنة بيانات الشخص المسجلة والجديدة
                                            </h4>

                                            {(() => {
                                                const differences = getPersonDifferences(
                                                    contract,
                                                    personLookups[contract.id].person!
                                                );

                                                if (differences.length === 0) {
                                                    return (
                                                        <p
                                                            style={{
                                                                margin: 0,
                                                                color: "#167347",
                                                                fontSize: "12px",
                                                            }}
                                                        >
                                                            لا توجد اختلافات بين البيانات الحالية
                                                            والبيانات المدخلة.
                                                        </p>
                                                    );
                                                }

                                                return (
                                                    <div>
                                                        <div style={{ overflowX: "auto" }}>
                                                            <table
                                                                style={{
                                                                    width: "100%",
                                                                    borderCollapse: "collapse",
                                                                    fontSize: "12px",
                                                                    textAlign: "right",
                                                                }}
                                                            >
                                                                <thead>
                                                                    <tr>
                                                                        {[
                                                                            "الحقل",
                                                                            "البيانات المسجلة",
                                                                            "البيانات الجديدة",
                                                                        ].map((heading) => (
                                                                            <th
                                                                                key={heading}
                                                                                style={{
                                                                                    padding: "10px",
                                                                                    borderBottom:
                                                                                        "1px solid #d6e2f0",
                                                                                    color: "#17375e",
                                                                                }}
                                                                            >
                                                                                {heading}
                                                                            </th>
                                                                        ))}
                                                                    </tr>
                                                                </thead>

                                                                <tbody>
                                                                    {differences.map((difference) => (
                                                                        <tr key={difference.label}>
                                                                            <td style={{ padding: "10px" }}>
                                                                                {difference.label}
                                                                            </td>
                                                                            <td style={{ padding: "10px" }}>
                                                                                {difference.currentValue || "غير محدد"}
                                                                            </td>
                                                                            <td style={{ padding: "10px" }}>
                                                                                {difference.newValue || "غير محدد"}
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>

                                                        <fieldset
                                                            style={{
                                                                marginTop: "16px",
                                                                padding: "12px",
                                                                border: "1px solid #d6e2f0",
                                                                borderRadius: "8px",
                                                            }}
                                                        >
                                                            <legend
                                                                style={{
                                                                    padding: "0 6px",
                                                                    color: "#17375e",
                                                                    fontSize: "12px",
                                                                    fontWeight: 600,
                                                                }}
                                                            >
                                                                القرار بشأن بيانات الشخص
                                                            </legend>

                                                            {[
                                                                {
                                                                    value: "keep",
                                                                    label: "الاحتفاظ ببيانات الشخص الحالية",
                                                                },
                                                                {
                                                                    value: "update",
                                                                    label: "تحديث بيانات الشخص بالبيانات الجديدة",
                                                                },
                                                            ].map((option) => (
                                                                <label
                                                                    key={option.value}
                                                                    style={{
                                                                        display: "flex",
                                                                        alignItems: "center",
                                                                        gap: "8px",
                                                                        marginBottom: "10px",
                                                                        fontSize: "12px",
                                                                        cursor: "pointer",
                                                                    }}
                                                                >
                                                                    <input
                                                                        type="radio"
                                                                        name={`person-decision-${contract.id}`}
                                                                        value={option.value}
                                                                        checked={
                                                                            personUpdateDecisions[contract.id] ===
                                                                            option.value
                                                                        }
                                                                        onChange={() =>
                                                                            setPersonUpdateDecisions((current) => ({
                                                                                ...current,
                                                                                [contract.id]:
                                                                                    option.value as PersonUpdateDecision,
                                                                            }))
                                                                        }
                                                                    />
                                                                    {option.label}
                                                                </label>
                                                            ))}
                                                        </fieldset>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    )}
                                {field.key === "nationalNumber" &&
                                    isDuplicateNationalNumber(
                                        contract.id,
                                        contract.nationalNumber
                                    ) && (
                                        <p
                                            role="alert"
                                            style={{
                                                margin: 0,
                                                color: "#b42332",
                                                fontSize: "12px",
                                            }}
                                        >
                                            الرقم الوطني مكرر داخل نفس المراسلة.
                                        </p>
                                    )}

                            </div>
                        ))}



                        <div className={styles.field}>
                            <label className={styles.label}>
                                مرفقات العقد (اختياري)
                            </label>

                            <label
                                htmlFor={`attachments-${contract.id}`}
                                className={styles.attachmentPicker}
                            >
                                + اختيار ملفات العقد

                                <input
                                    id={`attachments-${contract.id}`}
                                    className={styles.hiddenFileInput}
                                    type="file"
                                    multiple


                                    onChange={(event) => {
                                        const selectedFiles = Array.from(
                                            event.target.files ?? []
                                        );

                                        const validFiles: File[] = [];
                                        const errors: string[] = [];

                                        const existingFiles = contracts.find(
                                            (item) => item.id === contract.id
                                        )?.attachments ?? [];

                                        const isSameFile = (first: File, second: File) =>
                                            first.name === second.name &&
                                            first.size === second.size &&
                                            first.lastModified === second.lastModified;

                                        for (const file of selectedFiles) {
                                            const error = validateAttachment(file);

                                            if (error) {
                                                errors.push(error);
                                                continue;
                                            }

                                            const isDuplicate = [
                                                ...existingFiles,
                                                ...validFiles,
                                            ].some((existing) => isSameFile(existing, file));

                                            if (isDuplicate) {
                                                errors.push(
                                                    `الملف "${file.name}" مضاف مسبقًا لهذا العقد.`
                                                );
                                                continue;
                                            }

                                            // الحد الأقصى المسموح به هو 20 مرفقًا لكل عقد.
                                            const MAX_ATTACHMENTS_PER_CONTRACT = 20;

                                            if (
                                                existingFiles.length + validFiles.length >=
                                                MAX_ATTACHMENTS_PER_CONTRACT
                                            ) {
                                                if (
                                                    !errors.includes(
                                                        "الحد الأقصى للمرفقات هو 20 ملفًا لكل عقد. احذف بعض الملفات قبل إضافة المزيد."
                                                    )
                                                ) {
                                                    errors.push(
                                                        "الحد الأقصى للمرفقات هو 20 ملفًا لكل عقد. احذف بعض الملفات قبل إضافة المزيد."
                                                    );
                                                }

                                                continue;
                                            }

                                            validFiles.push(file);
                                        }

                                        setAttachmentErrors((current) => ({
                                            ...current,
                                            [contract.id]: errors.join("\n"),
                                        }));

                                        if (validFiles.length > 0) {
                                            setContracts((current) =>
                                                current.map((item) =>
                                                    item.id === contract.id
                                                        ? {
                                                            ...item,
                                                            attachments: [
                                                                ...item.attachments,
                                                                ...validFiles,
                                                            ],
                                                        }
                                                        : item
                                                )
                                            );
                                        }

                                        event.target.value = "";
                                    }}


                                />
                            </label>

                            {attachmentErrors[contract.id] && (
                                <p
                                    role="alert"
                                    style={{
                                        margin: "8px 0",
                                        color: "#b42332",
                                        fontSize: "12px",
                                        whiteSpace: "pre-line",
                                    }}
                                >
                                    {attachmentErrors[contract.id]}
                                </p>
                            )}

                            {contract.attachments.length > 0 && (
                                <>
                                    <p className={styles.attachmentCount}>
                                        عدد الملفات المختارة: {contract.attachments.length}
                                    </p>

                                    <div className={styles.attachmentList}>
                                        {contract.attachments.map((file, fileIndex) => (
                                            <div
                                                key={`${file.name}-${fileIndex}`}
                                                className={styles.attachmentItem}
                                            >
                                                <div className={styles.attachmentInfo}>
                                                    <span
                                                        className={styles.attachmentName}
                                                        dir="auto"
                                                    >
                                                        {file.name}
                                                    </span>

                                                    <span className={styles.attachmentSize}>
                                                        {file.size < 1024 * 1024
                                                            ? `${(file.size / 1024).toFixed(1)} KB`
                                                            : `${(file.size / (1024 * 1024)).toFixed(2)} MB`}
                                                    </span>
                                                </div>

                                                <button
                                                    type="button"
                                                    className={styles.attachmentRemove}
                                                    onClick={() => {
                                                        setContracts((current) =>
                                                            current.map((item) =>
                                                                item.id === contract.id
                                                                    ? {
                                                                        ...item,
                                                                        attachments:
                                                                            item.attachments.filter(
                                                                                (_, index) =>
                                                                                    index !== fileIndex
                                                                            ),
                                                                    }
                                                                    : item
                                                            )
                                                        );
                                                    }}
                                                >
                                                    حذف
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>




                    </div>
                </div>
            ))
            }

            <div style={{ marginTop: "24px" }}>
                <button
                    type="button"
                    onClick={addContract}
                    style={{
                        padding: "11px 20px",
                        border: "1px solid #b8cce3",
                        borderRadius: "8px",
                        background: "#eef5fc",
                        color: "#17375e",
                        fontSize: "13px",
                        fontWeight: 600,
                        cursor: "pointer",
                    }}
                >
                    + إضافة عقد آخر
                </button>
            </div>
        </section >
    );
}
