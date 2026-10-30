"use client";

import { useState } from "react";

import IncomingCorrespondenceForm from "./IncomingCorrespondenceForm";

import ContractsForm, {
    type Contract,
    type PersonUpdateDecision,
    createEmptyContract,
} from "./ContractsForm";

import { buildContractsFormData } from "@/lib/contracts-form-data";

export default function NewContractsForm() {
    const [incomingNumber, setIncomingNumber] = useState("");
    const [entityName, setEntityName] = useState("");
    const [validationMessage, setValidationMessage] = useState("");
    const [validationStatus, setValidationStatus] = useState<
        "success" | "error" | null
    >(null);
    const [isValidating, setIsValidating] = useState(false);

    const [contracts, setContracts] = useState<Contract[]>([
        createEmptyContract(1),
    ]);

    const [personUpdateDecisions, setPersonUpdateDecisions] = useState<
        Record<number, PersonUpdateDecision>
    >({});

    function prepareContractsFormData(): FormData {
        return buildContractsFormData(
            incomingNumber,
            entityName,
            contracts.map((contract) => ({
                ...contract,
                personUpdateDecision:
                    personUpdateDecisions[contract.id],
                personVersion: contract.personVersion,
            }))
        );
    }

    // إرسال المراسلة والعقود للحفظ الفعلي.
    async function submitContractsForValidation() {
        if (isValidating) return;

        setIsValidating(true);
        setValidationMessage("");
        setValidationStatus(null);

        try {
            const formData = prepareContractsFormData();

            const response = await fetch("/api/contracts", {
                method: "POST",
                body: formData,
            });

            const result: unknown = await response.json();

            const message =
                typeof result === "object" &&
                    result !== null &&
                    "message" in result &&
                    typeof result.message === "string"
                    ? result.message
                    : "تعذر الحصول على رسالة واضحة من الخادم.";

            setValidationMessage(message);

            // النجاح فقط عند إتمام الحفظ فعليًا.
            setValidationStatus(
                response.status === 201 ? "success" : "error"
            );

            if (response.status === 201) {
                setIncomingNumber("");
                setEntityName("");
                setContracts([createEmptyContract(1)]);
                setPersonUpdateDecisions({});
            }
        } catch (error) {
            console.error("Contracts save request failed:", error);

            setValidationMessage(
                "تعذر الاتصال بالخادم. يرجى المحاولة مجددًا."
            );
            setValidationStatus("error");
        } finally {
            setIsValidating(false);
        }
    }

    // دالة اختبار الإرسال متاحة للاستخدام من زر الاختبار.

    return (
        <>
            <IncomingCorrespondenceForm
                incomingNumber={incomingNumber}
                setIncomingNumber={setIncomingNumber}
                entityName={entityName}
                setEntityName={setEntityName}
            />

            <ContractsForm
                contracts={contracts}
                setContracts={setContracts}
                personUpdateDecisions={personUpdateDecisions}
                setPersonUpdateDecisions={setPersonUpdateDecisions}
            />

            <div
                style={{
                    marginTop: "24px",
                    padding: "22px 24px",
                    backgroundColor: "#ffffff",
                    border: "1px solid #dce5f0",
                    borderRadius: "12px",
                    boxShadow: "0 2px 8px rgba(15, 35, 65, 0.04)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "20px",
                    flexWrap: "wrap",
                    direction: "rtl",
                }}
            >
                <div style={{ flex: "1 1 280px" }}>
                    <h3
                        style={{
                            margin: 0,
                            fontSize: "15px",
                            fontWeight: 700,
                            color: "#18365c",
                        }}
                    >
                        حفظ المراسلة والعقود
                    </h3>

                    <p
                        style={{
                            margin: "8px 0 0",
                            fontSize: "13px",
                            lineHeight: 1.8,
                            color: "#64748b",
                        }}
                    >
                        حفظ بيانات المراسلة الواردة وجميع العقود المرتبطة بها
                        بعد استكمال التحقق من البيانات.
                    </p>


                </div>
                {validationMessage && (
                    <div
                        role="status"
                        style={{
                            // marginTop: "12px",
                            padding: "12px 10px",
                            borderRadius: "8px",
                            border: `1px solid ${validationStatus === "success"
                                ? "#86efac"
                                : "#fca5a5"
                                }`,
                            backgroundColor:
                                validationStatus === "success"
                                    ? "#f0fdf4"
                                    : "#fef2f2",
                            color:
                                validationStatus === "success"
                                    ? "#166534"
                                    : "#991b1b",
                            fontSize: "13px",
                            fontWeight: 600,
                            direction: "rtl",
                        }}
                    >
                        {validationMessage}
                    </div>
                )}


                <button
                    type="button"
                    onClick={submitContractsForValidation}
                    disabled={isValidating}
                    style={{
                        padding: "12px 24px",
                        minHeight: "42px",
                        border: "1px solid #1d4ed8",
                        borderRadius: "8px",
                        backgroundColor: isValidating ? "#93c5fd" : "#1d4ed8",
                        color: "#ffffff",
                        fontSize: "13px",
                        fontWeight: 700,
                        cursor: isValidating ? "not-allowed" : "pointer",
                    }}
                >
                    {isValidating ? "جارٍ حفظ البيانات..." : "حفظ المراسلة والعقود"}
                </button>
            </div>
        </>
    );
}