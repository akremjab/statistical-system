
export type ContractFormDataItem = {
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
    personUpdateDecision?: "keep" | "update";
    personVersion?: string | null;
};

export function buildContractsFormData(
    incomingNumber: string,
    entityName: string,
    contracts: ContractFormDataItem[]
): FormData {
    const formData = new FormData();

    formData.append("incomingNumber", incomingNumber.trim());
    formData.append("entityName", entityName.trim());

    const contractsData = contracts.map((contract, index) => {
        for (const file of contract.attachments) {
            formData.append(`attachments_${index}`, file);
        }

        return {
            nationalNumber: contract.nationalNumber.trim(),
            fullName: contract.fullName.trim(),
            qualification: contract.qualification.trim(),
            specialization: contract.specialization.trim(),
            jobTitle: contract.jobTitle.trim(),
            grade: contract.grade.trim(),
            contractType: contract.contractType.trim(),
            contractNumber: contract.contractNumber.trim(),
            notes: contract.notes.trim(),
            personUpdateDecision: contract.personUpdateDecision ?? null,
            personVersion: contract.personVersion ?? null,
        };
    });

    formData.append("contracts", JSON.stringify(contractsData));

    return formData;
}
