
import pool from "@/lib/db";
import type { PoolClient } from "pg";

import {
    saveContractAttachment,
    deleteStoredContractAttachment,
    type StoredAttachment,
} from "@/lib/attachment-storage";

// البيانات التي تُعاد بعد نجاح حفظ المراسلة وعقودها.
export type SaveContractsResult = {
    correspondenceId: number;
    contractIds: number[];
};

// بيانات العقد بعد التحقق منها وتجهيزها في API.

export type SaveContractItem = {
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
    personUpdateDecision: "keep" | "update" | null;
    personVersion: string | null;
};


// بيانات عملية الحفظ وهوية المستخدم الذي ينفذها.
export type SaveContractsInput = {
    incomingNumber: string;
    entityName: string;
    contracts: SaveContractItem[];
    actorUserId: number;
    actorUsername: string;
};

/**
 * حفظ مراسلة واردة وعقودها والأشخاص والمرفقات وسجل التدقيق
 * ضمن معاملة واحدة في PostgreSQL.
 *
 * عند فشل المعاملة، يتم التراجع عن تغييرات قاعدة البيانات
 * ومحاولة حذف الملفات المخزنة أثناء العملية.
 *
 * الحفظ النهائي معطل مؤقتًا لحين اكتمال المراجعة.
 */
export async function saveContractsTransaction(
    input: SaveContractsInput
): Promise<SaveContractsResult> {
    const testMode =
        process.env.CONTRACT_SAVE_TEST_MODE === "true" ||
        process.env.CONTRACT_SAVE_TEST_MODE === "1";

    if (
        testMode &&
        (
            process.env.DB_NAME !== "statistical_system_test" ||
            process.env.DB_USER !== "statistical_test_user"
        )
    ) {
        throw new Error("TEST_DATABASE_CONFIGURATION_MISMATCH");
    }

    const client = await pool.connect();

    // الاحتفاظ بالمرفقات المخزنة لتنظيفها عند فشل المعاملة.
    const storedAttachments: StoredAttachment[] = [];

    try {
        await client.query("BEGIN");

        // حماية إضافية قبل تنفيذ أي INSERT في وضع الاختبار.
        if (
            process.env.CONTRACT_SAVE_TEST_MODE === "true" ||
            process.env.CONTRACT_SAVE_TEST_MODE === "1"
        ) {
            const safetyResult = await client.query<{
                database_name: string;
                database_user: string;
            }>(`
        SELECT
            current_database() AS database_name,
            current_user AS database_user
    `);

            const safety = safetyResult.rows[0];

            if (
                safety?.database_name !== "statistical_system_test" ||
                safety?.database_user !== "statistical_test_user"
            ) {
                throw new Error(
                    "TEST_DATABASE_SAFETY_CHECK_FAILED"
                );
            }
        }

        // 1. إنشاء المراسلة الواردة.
        // 1. إنشاء المراسلة الواردة.
        const correspondenceResult = await client.query<{ id: string }>(
            `
            INSERT INTO public.incoming_correspondences (
                incoming_number,
                administrative_entity
            )
            VALUES ($1, $2)
            RETURNING id
            `,
            [input.incomingNumber, input.entityName]
        );

        const correspondenceId = Number(
            correspondenceResult.rows[0].id
        );


        // 2. الحصول على معرف كل شخص أو إنشاء سجل جديد له.
        const personIds: number[] = [];

        for (const contract of input.contracts) {
            const nationalNumber = contract.nationalNumber.trim();
            const fullName = contract.fullName.trim();
            const qualification = contract.qualification.trim();
            const specialization = contract.specialization.trim() || null;

            // قفل سجل الشخص الموجود حتى لا يتغير أثناء المقارنة والتحديث.
            const existingResult = await client.query<{
                id: string;
                full_name: string;
                qualification: string;
                specialization: string | null;
                version: string;
            }>(
                `
                SELECT
    id,
    full_name,
    qualification,
    specialization,
    md5(
        jsonb_build_array(
            full_name,
            qualification,
            specialization
        )::text
    ) AS version
FROM public.persons
WHERE national_id = $1
FOR UPDATE
                `,
                [nationalNumber]
            );

            const existingPerson = existingResult.rows[0];

            if (existingPerson) {
                // التحقق من أن بيانات الشخص لم تتغير منذ آخر بحث.
                if (
                    contract.personVersion === null ||
                    contract.personVersion !== existingPerson.version
                ) {
                    throw new Error(
                        `PERSON_STALE_VERSION:${nationalNumber}`
                    );
                }

                const changed =
                    existingPerson.full_name !== fullName ||
                    existingPerson.qualification !== qualification ||
                    (existingPerson.specialization ?? "") !==
                    (specialization ?? "");

                if (changed && contract.personUpdateDecision === null) {
                    throw new Error(
                        `PERSON_DECISION_REQUIRED:${nationalNumber}`
                    );
                }

                if (
                    changed &&
                    contract.personUpdateDecision === "update"
                ) {
                    await client.query(
                        `
                        UPDATE public.persons
                        SET full_name = $2,
                            qualification = $3,
                            specialization = $4
                        WHERE id = $1
                        `,
                        [
                            existingPerson.id,
                            fullName,
                            qualification,
                            specialization,
                        ]
                    );

                    await client.query(
                        `
                        INSERT INTO public.audit_logs (
                            user_id,
                            actor_username,
                            action,
                            entity_type,
                            entity_id,
                            old_values,
                            new_values
                        )
                        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
                        `,
                        [
                            input.actorUserId,
                            input.actorUsername,
                            "update",
                            "person",
                            existingPerson.id,
                            JSON.stringify({
                                fullName: existingPerson.full_name,
                                qualification: existingPerson.qualification,
                                specialization: existingPerson.specialization,
                            }),
                            JSON.stringify({
                                fullName,
                                qualification,
                                specialization,
                            }),
                        ]
                    );
                }

                personIds.push(Number(existingPerson.id));
            } else {
                // إذا كانت هناك بصمة سابقة، فهذا يعني أن الشخص
                // كان موجودًا وقت البحث، لكن لم يعد موجودًا الآن.
                if (contract.personVersion !== null) {
                    throw new Error(
                        `PERSON_STALE_VERSION:${nationalNumber}`
                    );
                }

                // إنشاء الشخص لأول مرة دون الحاجة إلى قرار تحديث.
                const personResult = await client.query<{ id: string }>(
                    `

                        INSERT INTO public.persons (
                            national_id,
                            full_name,
                            qualification,
                            specialization
                        )
                        VALUES ($1, $2, $3, $4)
                        ON CONFLICT (national_id)
                        DO NOTHING
                        RETURNING id

                    `,
                    [
                        nationalNumber,
                        fullName,
                        qualification,
                        specialization,
                    ]
                );


                if (personResult.rows.length === 0) {
                    // مستخدم آخر أنشأ نفس الشخص أثناء تنفيذ المعاملة.
                    // نوقف العملية حتى لا نعتمد على بيانات قديمة.
                    throw new Error(
                        `PERSON_CONCURRENT_CONFLICT:${nationalNumber}`
                    );
                }


                const newPersonId = Number(personResult.rows[0].id);

                personIds.push(newPersonId);

                // تسجيل إنشاء الشخص الجديد في سجل التدقيق.
                await client.query(
                    `
                    INSERT INTO public.audit_logs (
                        user_id,
                        actor_username,
                        action,
                        entity_type,
                        entity_id,
                        new_values
                    )
                    VALUES ($1, $2, $3, $4, $5, $6::jsonb)
                    `,
                    [
                        input.actorUserId,
                        input.actorUsername,
                        "create",
                        "person",
                        newPersonId,
                        JSON.stringify({
                            nationalNumber,
                            fullName,
                            qualification,
                            specialization,
                        }),
                    ]
                );


            }
        }



        // 3. إنشاء العقود وربطها بالأشخاص والمراسلة والمرفقات.
        const contractIds: number[] = [];

        for (const [index, contract] of input.contracts.entries()) {
            const contractResult = await client.query<{ id: string }>(
                `
                INSERT INTO public.contracts (
                    person_id,
                    national_id_snapshot,
                    full_name_snapshot,
                    qualification_snapshot,
                    specialization_snapshot,
                    job_title,
                    grade,
                    contract_type,
                    contract_number,
                    notes
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING id
                `,
                [
                    personIds[index],
                    contract.nationalNumber.trim(),
                    contract.fullName.trim(),
                    contract.qualification.trim(),
                    contract.specialization.trim() || null,
                    contract.jobTitle.trim(),
                    contract.grade.trim(),
                    contract.contractType.trim(),
                    contract.contractNumber.trim() || null,
                    contract.notes.trim() || null,
                ]
            );

            const contractId = Number(contractResult.rows[0].id);

            contractIds.push(contractId);

            // ربط العقد بالمراسلة الواردة.
            await client.query(
                `
                INSERT INTO public.contract_correspondences (
                    contract_id,
                    correspondence_id
                )
                VALUES ($1, $2)
                `,
                [contractId, correspondenceId]
            );

            // حفظ ملفات العقد وتسجيل بياناتها في قاعدة البيانات.
            for (const file of contract.attachments) {
                const storedAttachment =
                    await saveContractAttachment(file);

                // تتبع الملف قبل إدخاله في قاعدة البيانات لضمان محاولة تنظيفه عند الفشل.
                storedAttachments.push(storedAttachment);

                await insertContractAttachment(
                    client,
                    contractId,
                    input.actorUserId,
                    storedAttachment
                );
            }
        }

        // 4. تسجيل إنشاء المراسلة في سجل التدقيق.
        await client.query(
            `
            INSERT INTO public.audit_logs (
                user_id,
                actor_username,
                action,
                entity_type,
                entity_id,
                new_values
            )
            VALUES ($1, $2, $3, $4, $5, $6::jsonb)
            `,
            [
                input.actorUserId,
                input.actorUsername,
                "create",
                "incoming_correspondence",
                correspondenceId,
                JSON.stringify({
                    incomingNumber: input.incomingNumber,
                    entityName: input.entityName,
                    contractIds,
                }),
            ]
        );

        // 5. تسجيل إنشاء كل عقد في سجل التدقيق.
        for (const [index, contractId] of contractIds.entries()) {
            const contract = input.contracts[index];

            await client.query(
                `
                INSERT INTO public.audit_logs (
                    user_id,
                    actor_username,
                    action,
                    entity_type,
                    entity_id,
                    new_values
                )
                VALUES ($1, $2, $3, $4, $5, $6::jsonb)
                `,
                [
                    input.actorUserId,
                    input.actorUsername,
                    "create",
                    "contract",
                    contractId,
                    JSON.stringify({
                        nationalNumber: contract.nationalNumber,
                        fullName: contract.fullName,
                        qualification: contract.qualification,
                        specialization: contract.specialization,
                        jobTitle: contract.jobTitle,
                        contractType: contract.contractType,
                        contractNumber: contract.contractNumber,
                        notes: contract.notes,
                        personId: personIds[index],
                        correspondenceId,
                        status: "received",
                    }),
                ]
            );
        }

        // إنشاء إشعار عن المراسلة الجديدة للمستخدمين المخولين.
        // يتم التنفيذ داخل نفس معاملة حفظ العقود.
        await client.query(
            `
            INSERT INTO public.notifications (
                user_id,
                notification_type,
                title,
                message,
                entity_type,
                entity_id,
                is_read
            )
            SELECT DISTINCT
                u.id,
                'new_contracts',
                'تسجيل عقود جديدة',
                $1::text,
                'incoming_correspondence',
                $2::text,
                FALSE
            FROM public.users AS u
            INNER JOIN public.user_permissions AS up
                ON up.user_id = u.id
            INNER JOIN public.permissions AS p
                ON p.id = up.permission_id
            WHERE u.is_active = TRUE
  AND p.code = 'contracts.view'
  AND NOT EXISTS (
      SELECT 1
      FROM public.notification_preferences AS np
      WHERE np.user_id = u.id
        AND np.notification_type = 'new_contracts'
        AND np.is_enabled = FALSE
  )
            `,
            [
                `تم تسجيل مراسلة واردة رقم ${input.incomingNumber} ` +
                `من ${input.entityName} تحتوي على ${contractIds.length} عقد.`,
                correspondenceId,
            ]
        );

        // 6. التحقق من الاتصال الصحيح قبل اعتماد الحفظ الحقيقي.
        const finalSafetyResult = await client.query<{
            database_name: string;
            database_user: string;
        }>(`
    SELECT
        current_database() AS database_name,
        current_user AS database_user
`);

        const finalSafety = finalSafetyResult.rows[0];

        if (
            process.env.DB_NAME !== "statistical_system" ||
            finalSafety?.database_name !== "statistical_system" ||
            !process.env.DB_USER ||
            finalSafety?.database_user !== process.env.DB_USER ||
            process.env.CONTRACT_SAVE_TEST_MODE === "true" ||
            process.env.CONTRACT_SAVE_TEST_MODE === "1"
        ) {
            throw new Error("LIVE_DATABASE_SAFETY_CHECK_FAILED");
        }

        // اعتماد المعاملة وإرجاع معرفات السجلات المنشأة.
        await client.query("COMMIT");

        return {
            correspondenceId,
            contractIds,
        };
    } catch (error) {
        // التراجع عن تغييرات قاعدة البيانات عند فشل العملية.
        try {
            await client.query("ROLLBACK");
        } catch (rollbackError) {
            console.error(
                "فشل التراجع عن معاملة حفظ العقود:",
                rollbackError
            );
        } finally {
            // محاولة حذف جميع الملفات التي خُزنت أثناء المعاملة الفاشلة.
            const cleanupResults = await Promise.allSettled(
                storedAttachments.map((attachment) =>
                    deleteStoredContractAttachment(
                        attachment.storedFilename
                    )
                )
            );

            for (const result of cleanupResults) {
                if (result.status === "rejected") {
                    console.error(
                        "فشل تنظيف أحد مرفقات العقود:",
                        result.reason
                    );
                }
            }
        }

        throw error;
    } finally {
        // إعادة اتصال PostgreSQL إلى مجموعة الاتصالات.
        client.release();
    }
}

/**
 * تسجيل بيانات مرفق محفوظ على القرص وربطه بالعقد والمستخدم
 * الذي رفعه، باستخدام اتصال المعاملة الحالية.
 */
export async function insertContractAttachment(
    client: PoolClient,
    contractId: number,
    uploadedBy: number,
    attachment: StoredAttachment
): Promise<number> {
    const result = await client.query<{ id: string }>(
        `
        INSERT INTO public.contract_attachments (
            contract_id,
            original_filename,
            stored_filename,
            storage_path,
            mime_type,
            file_size,
            uploaded_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
        `,
        [
            contractId,
            attachment.originalFilename,
            attachment.storedFilename,
            attachment.storagePath,
            attachment.mimeType,
            attachment.fileSize,
            uploadedBy,
        ]
    );

    return Number(result.rows[0].id);
}
