import { NextResponse } from "next/server";
import { saveContractsTransaction } from "@/lib/save-contracts";
import { getCurrentSession } from "@/lib/current-session";
import { hasPermission } from "@/lib/permissions";
import {
    validateAttachment,
    validateAttachmentSignature,
} from "@/lib/attachment-validation";
export const runtime = "nodejs";

export async function POST(request: Request) {
    try {
        // التحقق من تسجيل الدخول
        const session = await getCurrentSession();

        if (!session) {
            return NextResponse.json(
                {
                    success: false,
                    message: "يجب تسجيل الدخول أولاً.",
                },
                { status: 401 }
            );
        }

        // التحقق من ضرورة تغيير كلمة المرور
        if (session.mustChangePassword) {
            return NextResponse.json(
                {
                    success: false,
                    message: "يجب تغيير كلمة المرور قبل المتابعة.",
                },
                { status: 403 }
            );
        }

        // التحقق من صلاحية إنشاء العقود
        const allowed = await hasPermission("contracts.create");

        if (!allowed) {
            return NextResponse.json(
                {
                    success: false,
                    message: "ليس لديك صلاحية إنشاء العقود.",
                },
                { status: 403 }
            );
        }

        // استقبال بيانات الطلب
        const contentType = request.headers.get("content-type") ?? "";

        if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
            return NextResponse.json(
                {
                    error: "نوع الطلب غير مدعوم. يجب إرسال البيانات باستخدام FormData.",
                },
                { status: 415 }
            );
        }

        let body: unknown;

        try {
            // الحد الأقصى لحجم الطلب الكامل: 110 MiB
            const MAX_REQUEST_SIZE = 110 * 1024 * 1024;

            const contentLengthHeader = request.headers.get("content-length");

            if (contentLengthHeader !== null) {
                const contentLength = Number(contentLengthHeader);

                if (
                    !Number.isSafeInteger(contentLength) ||
                    contentLength < 0
                ) {
                    return NextResponse.json(
                        {
                            success: false,
                            message: "حجم الطلب المعلن غير صالح.",
                        },
                        { status: 400 }
                    );
                }

                if (contentLength > MAX_REQUEST_SIZE) {
                    return NextResponse.json(
                        {
                            success: false,
                            message: "حجم الطلب يتجاوز الحد المسموح به (110 MiB).",
                        },
                        { status: 413 }
                    );
                }
            }
            const reader = request.body?.getReader();

            if (!reader) {
                return NextResponse.json(
                    {
                        success: false,
                        message: "الطلب لا يحتوي على بيانات.",
                    },
                    { status: 400 }
                );
            }

            const chunks: Uint8Array[] = [];
            let receivedBytes = 0;
            let requestTooLarge = false;

            try {
                while (true) {
                    const { done, value } = await reader.read();

                    if (done) break;

                    receivedBytes += value.byteLength;

                    if (receivedBytes > MAX_REQUEST_SIZE) {
                        requestTooLarge = true;
                        await reader.cancel();
                        break;
                    }

                    chunks.push(value);
                }
            } finally {
                reader.releaseLock();
            }

            if (requestTooLarge) {
                return NextResponse.json(
                    {
                        success: false,
                        message: "حجم الطلب الفعلي يتجاوز الحد المسموح به (110 MiB).",
                    },
                    { status: 413 }
                );
            }

            const bufferedRequest = new Request(request.url, {
                method: "POST",
                headers: request.headers,
                body: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))),
            });

            const formData = await bufferedRequest.formData();

            const contractsValue = formData.get("contracts");

            if (typeof contractsValue !== "string") {
                return NextResponse.json(
                    {
                        success: false,
                        message: "بيانات العقود مفقودة أو غير صالحة.",
                    },
                    { status: 400 }
                );
            }

            let contractsData: unknown;

            try {
                contractsData = JSON.parse(contractsValue);
            } catch {
                return NextResponse.json(
                    {
                        success: false,
                        message: "تعذر قراءة بيانات العقود.",
                    },
                    { status: 400 }
                );
            }

            if (!Array.isArray(contractsData)) {
                return NextResponse.json(
                    {
                        success: false,
                        message: "بيانات العقود يجب أن تكون قائمة.",
                    },
                    { status: 400 }
                );
            }

            if (contractsData.length < 1 || contractsData.length > 100) {
                return NextResponse.json(
                    {
                        success: false,
                        message: "عدد العقود يجب أن يكون بين 1 و100.",
                    },
                    { status: 400 }
                );
            }

            const contractsWithAttachments = contractsData.map(
                (contract: unknown, index: number) => {
                    const attachments = formData.getAll(`attachments_${index}`);

                    if (attachments.some((item) => !(item instanceof File))) {
                        throw new Error("INVALID_ATTACHMENT");
                    }

                    if (
                        typeof contract !== "object" ||
                        contract === null ||
                        Array.isArray(contract)
                    ) {
                        return contract;
                    }

                    return {
                        ...contract,
                        attachments: attachments as File[],
                    };
                }
            );
            // الحد الإجمالي لمرفقات المراسلة: 100 MiB
            const MAX_TOTAL_ATTACHMENTS_SIZE = 100 * 1024 * 1024;

            let totalAttachmentsSize = 0;

            for (const contract of contractsWithAttachments) {
                if (
                    typeof contract !== "object" ||
                    contract === null ||
                    Array.isArray(contract) ||
                    !("attachments" in contract) ||
                    !Array.isArray(contract.attachments)
                ) {
                    continue;
                }

                for (const file of contract.attachments) {
                    if (file instanceof File) {
                        totalAttachmentsSize += file.size;
                    }
                }
            }

            if (totalAttachmentsSize > MAX_TOTAL_ATTACHMENTS_SIZE) {
                return NextResponse.json(
                    {
                        success: false,
                        message:
                            "الحجم الإجمالي للمرفقات يتجاوز الحد المسموح به (100 MiB).",
                    },
                    { status: 413 }
                );
            }
            // التحقق من مرفقات جميع العقود قبل متابعة الطلب
            for (const [index, contract] of contractsWithAttachments.entries()) {
                if (
                    typeof contract !== "object" ||
                    contract === null ||
                    Array.isArray(contract) ||
                    !("attachments" in contract)
                ) {
                    continue;
                }

                const attachments = contract.attachments;

                if (!Array.isArray(attachments)) {
                    continue;
                }


                // الحد الأقصى: 20 مرفقات لكل عقد
                const MAX_ATTACHMENTS_PER_CONTRACT = 20;

                if (attachments.length > MAX_ATTACHMENTS_PER_CONTRACT) {
                    return NextResponse.json(
                        {
                            success: false,
                            message:
                                `العقد رقم ${index + 1}: ` +
                                `لا يمكن إضافة أكثر من ${MAX_ATTACHMENTS_PER_CONTRACT} مرفقات.`,
                        },
                        { status: 400 }
                    );
                }








                for (const file of attachments) {
                    if (!(file instanceof File)) {
                        return NextResponse.json(
                            {
                                success: false,
                                message: `يوجد مرفق غير صالح في العقد رقم ${index + 1}.`,
                            },
                            { status: 400 }
                        );
                    }

                    const validationError = validateAttachment(file);

                    if (validationError) {
                        return NextResponse.json(
                            {
                                success: false,
                                message: `العقد رقم ${index + 1}: ${validationError}`,
                            },
                            { status: 400 }
                        );
                    }

                    const signatureError =
                        await validateAttachmentSignature(file);

                    if (signatureError) {
                        return NextResponse.json(
                            {
                                success: false,
                                message: `العقد رقم ${index + 1}: ${signatureError}`,
                            },
                            { status: 400 }
                        );
                    }
                }
            }
            body = {
                incomingNumber: formData.get("incomingNumber"),
                entityName: formData.get("entityName"),
                contracts: contractsWithAttachments,
            };
        } catch {
            return NextResponse.json(
                {
                    success: false,
                    message: "تعذر قراءة بيانات الطلب.",
                },
                { status: 400 }
            );
        }

        // التحقق من البنية الأساسية
        if (
            typeof body !== "object" ||
            body === null ||
            Array.isArray(body) ||
            !("incomingNumber" in body) ||
            !("entityName" in body) ||
            !("contracts" in body) ||
            !Array.isArray(body.contracts)
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message: "بيانات المراسلة أو العقود غير مكتملة.",
                },
                { status: 400 }
            );
        }
        // التحقق من بيانات المراسلة الواردة
        if (
            typeof body.incomingNumber !== "string" ||
            typeof body.entityName !== "string"
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message: "رقم الوارد واسم الجهة الإدارية يجب أن يكونا نصّين.",
                },
                { status: 400 }
            );
        }

        const incomingNumber = body.incomingNumber.trim();
        const entityName = body.entityName.trim();

        if (!incomingNumber || !entityName) {
            return NextResponse.json(
                {
                    success: false,
                    message: "رقم الوارد واسم الجهة الإدارية حقول إلزامية.",
                },
                { status: 400 }
            );
        }

        if (incomingNumber.length > 50 || entityName.length > 255) {
            return NextResponse.json(
                {
                    success: false,
                    message: "رقم الوارد أو اسم الجهة الإدارية يتجاوز الطول المسموح.",
                },
                { status: 400 }
            );
        }
        // التحقق من عدد العقود المرتبطة بالمراسلة
        const contracts = body.contracts;

        if (contracts.length === 0) {
            return NextResponse.json(
                {
                    success: false,
                    message: "يجب إضافة عقد واحد على الأقل للمراسلة.",
                },
                { status: 400 }
            );
        }

        if (contracts.length > 100) {
            return NextResponse.json(
                {
                    success: false,
                    message: "الحد الأقصى المبدئي هو 100 عقد لكل طلب.",
                },
                { status: 400 }
            );
        }
        // التحقق من الحقول الإلزامية لكل عقد
        const requiredContractFields = [
            "nationalNumber",
            "fullName",
            "qualification",
            "jobTitle",
            "grade",
            "contractType",
        ] as const;

        const requiredContractFieldLabels: Record<
            (typeof requiredContractFields)[number],
            string
        > = {
            nationalNumber: "الرقم الوطني",
            fullName: "الاسم الكامل",
            qualification: "المؤهل العلمي",
            jobTitle: "المسمى الوظيفي",
            grade: "الدرجة",
            contractType: "نوع العقد",
        };

        for (const [index, contract] of contracts.entries()) {
            if (
                typeof contract !== "object" ||
                contract === null ||
                Array.isArray(contract)
            ) {
                return NextResponse.json(
                    {
                        success: false,
                        message: `بيانات العقد رقم ${index + 1} غير صحيحة.`,
                    },
                    { status: 400 }
                );
            }

            for (const field of requiredContractFields) {
                const value = (contract as Record<string, unknown>)[field];

                if (typeof value !== "string" || !value.trim()) {
                    return NextResponse.json(
                        {
                            success: false,
                            message: `يرجى إدخال ${requiredContractFieldLabels[field]} في العقد رقم ${index + 1}.`,
                        },
                        { status: 400 }
                    );
                }
            }
        }
        // منع تكرار الرقم الوطني داخل نفس المراسلة
        const nationalNumbers = new Set<string>();

        for (const [index, contract] of contracts.entries()) {
            const nationalNumber = (
                contract as Record<string, unknown>
            ).nationalNumber as string;

            const normalizedNationalNumber = nationalNumber.trim();

            if (nationalNumbers.has(normalizedNationalNumber)) {
                return NextResponse.json(
                    {
                        success: false,
                        message:
                            `الرقم الوطني "${normalizedNationalNumber}" مكرر ` +
                            `داخل نفس المراسلة، في العقد رقم ${index + 1}.`,
                    },
                    { status: 400 }
                );
            }

            nationalNumbers.add(normalizedNationalNumber);
        }
        // التحقق من الحقول الاختيارية لكل عقد
        const optionalContractFields = [
            "specialization",
            "contractNumber",
            "notes",
        ] as const;

        for (const [index, contract] of contracts.entries()) {
            const contractData = contract as Record<string, unknown>;

            for (const field of optionalContractFields) {
                const value = contractData[field];

                // الحقل الاختياري يمكن أن يكون غير موجود أو فارغًا
                if (value === undefined || value === null) {
                    continue;
                }

                if (typeof value !== "string") {
                    return NextResponse.json(
                        {
                            success: false,
                            message:
                                `قيمة الحقل "${field}" غير صحيحة ` +
                                `في العقد رقم ${index + 1}.`,
                        },
                        { status: 400 }
                    );
                }
            }
        }

        // التحقق من صحة قرار تحديث بيانات الشخص
        for (const [index, contract] of contracts.entries()) {
            const contractData = contract as Record<string, unknown>;
            const decision = contractData.personUpdateDecision;

            if (
                decision !== undefined &&
                decision !== null &&
                decision !== "keep" &&
                decision !== "update"
            ) {
                return NextResponse.json(
                    {
                        success: false,
                        message:
                            `قرار تحديث بيانات الشخص في العقد رقم ${index + 1} غير صالح.`,
                    },
                    { status: 400 }
                );
            }
        }

        // التحقق من أطوال الحقول النصية للعقود
        const contractFieldMaxLengths = {
            nationalNumber: 30,
            fullName: 255,
            qualification: 200,
            specialization: 200,
            jobTitle: 200,
            grade: 100,
            contractType: 200,
            contractNumber: 255,
            notes: 5000,
        } as const;

        for (const [index, contract] of contracts.entries()) {
            const contractData = contract as Record<string, unknown>;

            for (const [field, maxLength] of Object.entries(
                contractFieldMaxLengths
            )) {
                const value = contractData[field];

                if (typeof value !== "string") {
                    continue;
                }

                if (value.trim().length > maxLength) {
                    return NextResponse.json(
                        {
                            success: false,
                            message:
                                `الحقل "${field}" في العقد رقم ${index + 1} ` +
                                `يتجاوز الحد المسموح (${maxLength} حرفًا).`,
                        },
                        { status: 400 }
                    );
                }
            }
        }
        // التحقق من صحة بصمة بيانات الشخص قبل تجهيز الحفظ
        for (const [index, contract] of contracts.entries()) {
            const data = contract as Record<string, unknown>;
            const version = data.personVersion;

            if (
                version !== undefined &&
                version !== null &&
                (
                    typeof version !== "string" ||
                    !/^[a-f0-9]{32}$/.test(version)
                )
            ) {
                return NextResponse.json(
                    {
                        success: false,
                        message:
                            `بصمة بيانات الشخص في العقد رقم ${index + 1} غير صالحة. ` +
                            "يرجى إعادة البحث باستخدام الرقم الوطني.",
                    },
                    { status: 400 }
                );
            }
        }
        // تجهيز بيانات العقود بعد اجتياز جميع عمليات التحقق
        const normalizedContracts = contracts.map((contract) => {
            const data = contract as Record<string, unknown>;

            const optionalText = (value: unknown): string =>
                typeof value === "string" ? value.trim() : "";

            return {
                nationalNumber: (data.nationalNumber as string).trim(),
                fullName: (data.fullName as string).trim(),
                qualification: (data.qualification as string).trim(),
                specialization: optionalText(data.specialization),
                jobTitle: (data.jobTitle as string).trim(),
                grade: (data.grade as string).trim(),
                contractType: (data.contractType as string).trim(),
                contractNumber: optionalText(data.contractNumber),
                notes: optionalText(data.notes),
                attachments: data.attachments as File[],
                personVersion:
                    typeof data.personVersion === "string" &&
                        /^[a-f0-9]{32}$/.test(data.personVersion)
                        ? data.personVersion
                        : null,
                personUpdateDecision:
                    data.personUpdateDecision === "keep"
                        ? ("keep" as const)
                        : data.personUpdateDecision === "update"
                            ? ("update" as const)
                            : null,
            };
        });
        // تجهيز بيانات الحفظ باستخدام هوية المستخدم من الجلسة
        const saveInput = {
            incomingNumber,
            entityName,
            contracts: normalizedContracts,
            actorUserId: session.userId,
            actorUsername: session.username,
        };
        // الحفظ الحقيقي ما زال معطلاً.
        // لا يُسمح بالانتقال إلى الحفظ إلا بعد تشغيل
        // التطبيق في بيئة الاختبار المعزولة والتحقق من الاتصال.
        // الحفظ الحقيقي مسموح فقط في قاعدة البيانات الأصلية.
        if (
            process.env.DB_NAME !== "statistical_system" ||
            process.env.CONTRACT_SAVE_TEST_MODE === "true" ||
            process.env.CONTRACT_SAVE_TEST_MODE === "1"
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message: "تم إيقاف الحفظ: إعدادات قاعدة البيانات غير صحيحة.",
                },
                { status: 503 }
            );
        }

        // تنفيذ الحفظ داخل المعاملة المحمية.
        const result = await saveContractsTransaction(saveInput);

        return NextResponse.json(
            {
                success: true,
                message: "تم حفظ المراسلة والعقود بنجاح.",
                correspondenceId: result.correspondenceId,
                contractIds: result.contractIds,
            },
            { status: 201 }
        );
    } catch (error) {

        // معالجة تعارض بصمة بيانات الشخص
        if (
            error instanceof Error &&
            error.message.startsWith("PERSON_STALE_VERSION:")
        ) {
            const nationalNumber = error.message.slice(
                "PERSON_STALE_VERSION:".length
            );

            return NextResponse.json(
                {
                    success: false,
                    message:
                        `تغيرت بيانات الشخص صاحب الرقم الوطني ${nationalNumber} ` +
                        "منذ آخر عملية بحث، أو لم تعد بيانات البحث صالحة. " +
                        "يرجى إعادة البحث عن الشخص ومراجعة بياناته " +
                        "واختيار قرار التحديث من جديد قبل إعادة المحاولة.",
                },
                { status: 409 }
            );
        }

        // معالجة تعارض إنشاء نفس الشخص بواسطة مستخدم آخر
        if (
            error instanceof Error &&
            error.message.startsWith("PERSON_CONCURRENT_CONFLICT:")
        ) {
            const nationalNumber = error.message.slice(
                "PERSON_CONCURRENT_CONFLICT:".length
            );

            return NextResponse.json(
                {
                    success: false,
                    message:
                        `تم تسجيل الشخص صاحب الرقم الوطني ${nationalNumber} ` +
                        "بواسطة مستخدم آخر أثناء تنفيذ العملية. " +
                        "يرجى إعادة البحث عن الشخص ومراجعة بياناته قبل المحاولة مجددًا.",
                },
                { status: 409 }
            );
        }

        // طلب قرار صريح عند اختلاف بيانات شخص موجود
        if (
            error instanceof Error &&
            error.message.startsWith("PERSON_DECISION_REQUIRED:")
        ) {
            const nationalNumber = error.message.slice(
                "PERSON_DECISION_REQUIRED:".length
            );

            return NextResponse.json(
                {
                    success: false,
                    message:
                        `بيانات الشخص صاحب الرقم الوطني ${nationalNumber} مختلفة عن البيانات المسجلة. ` +
                        "يرجى اختيار الاحتفاظ بالبيانات الحالية أو تحديثها.",
                },
                { status: 409 }
            );
        }


        // معالجة تكرار رقم الوارد داخل نفس السنة
        if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "23505" &&
            "constraint" in error &&
            error.constraint === "unique_incoming_number_per_year"
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "رقم الوارد مسجل مسبقًا خلال السنة الحالية. يرجى إدخال رقم وارد آخر.",
                },
                { status: 409 }
            );
        }
        console.error("Contracts API error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "حدث خطأ أثناء معالجة الطلب.",
            },
            { status: 500 }
        );
    }
}