import "server-only";

import path from "node:path";
import { randomUUID } from "node:crypto";
const DEFAULT_STORAGE_DIR = "storage/contract-attachments";
import { mkdir, open, unlink, realpath } from "node:fs/promises";

import {
    validateAttachment,
    validateAttachmentSignature,
} from "@/lib/attachment-validation";

export function getContractAttachmentsDir(): string {
    const testMode =
        process.env.CONTRACT_SAVE_TEST_MODE === "true" ||
        process.env.CONTRACT_SAVE_TEST_MODE === "1";

    const configuredPath = testMode
        ? ".contract-test-attachments"
        : process.env.CONTRACT_ATTACHMENTS_DIR?.trim() ||
        DEFAULT_STORAGE_DIR;

    const resolvedPath = path.resolve(process.cwd(), configuredPath);

    const projectDirectory = path.resolve(process.cwd());

    if (resolvedPath === projectDirectory) {
        throw new Error(
            "لا يمكن تخزين مرفقات العقود في المجلد الرئيسي للمشروع."
        );
    }

    const publicDirectory = path.resolve(process.cwd(), "public");
    const relativeToPublic = path.relative(publicDirectory, resolvedPath);

    // منع تخزين المرفقات داخل public أو أي مجلد فرعي منه
    if (
        relativeToPublic === "" ||
        (!relativeToPublic.startsWith("..") &&
            !path.isAbsolute(relativeToPublic))
    ) {
        throw new Error(
            "لا يمكن تخزين مرفقات العقود داخل المجلد العام public."
        );
    }

    return resolvedPath;
}







export function generateStoredAttachmentName(
    mimeType: string
): string {
    const extensions: Record<string, string> = {
        "application/pdf": ".pdf",
        "image/jpeg": ".jpg",
        "image/png": ".png",
    };

    const extension = extensions[mimeType];

    if (!extension) {
        throw new Error("نوع المرفق غير مسموح به.");
    }

    return `${randomUUID()}${extension}`;
}










export type StoredAttachment = {
    originalFilename: string;
    storedFilename: string;
    storagePath: string;
    mimeType: string;
    fileSize: number;
};

export async function saveContractAttachment(
    file: File
): Promise<StoredAttachment> {
    const validationError = validateAttachment(file);

    if (validationError) {
        throw new Error(validationError);
    }

    const signatureError =
        await validateAttachmentSignature(file);

    if (signatureError) {
        throw new Error(signatureError);
    }

    const directory = getContractAttachmentsDir();

    await mkdir(directory, { recursive: true });
    // التحقق من الموقع الحقيقي لمجلد المرفقات
    const realStorageDirectory = await realpath(directory);
    const realPublicDirectory = path.resolve(
        await realpath(process.cwd()),
        "public"
    );

    const relativeToPublic = path.relative(
        realPublicDirectory,
        realStorageDirectory
    );

    if (
        relativeToPublic === "" ||
        (
            !relativeToPublic.startsWith("..") &&
            !path.isAbsolute(relativeToPublic)
        )
    ) {
        throw new Error(
            "مسار تخزين المرفقات يشير إلى المجلد العام public."
        );
    }
    const storedFilename =
        generateStoredAttachmentName(file.type);

    const storagePath = path.join(
        realStorageDirectory,
        storedFilename
    );

    const fileHandle = await open(storagePath, "wx", 0o600);

    let fileClosed = false;

    try {
        const buffer = Buffer.from(await file.arrayBuffer());

        await fileHandle.writeFile(buffer);

        await fileHandle.close();
        fileClosed = true;
    } catch (error) {
        // محاولة إغلاق الملف إذا لم يُغلق بنجاح
        if (!fileClosed) {
            try {
                await fileHandle.close();
            } catch (closeError) {
                console.error(
                    "فشل إغلاق ملف المرفق:",
                    closeError
                );
            }
        }

        // تنظيف الملف عند فشل الكتابة أو الإغلاق
        try {
            await unlink(storagePath);
        } catch (cleanupError) {
            console.error(
                "فشل تنظيف ملف المرفق:",
                cleanupError
            );
        }

        throw error;
    }

    return {
        originalFilename: file.name,
        storedFilename,
        storagePath,
        mimeType: file.type,
        fileSize: file.size,
    };
}



export async function deleteStoredContractAttachment(
    storedFilename: string
): Promise<void> {
    // لا نقبل مسارات أو أسماء ملفات غير مطابقة للتنسيق المعتمد
    const validFilename =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(pdf|jpg|png)$/i;

    if (!validFilename.test(storedFilename)) {
        throw new Error("اسم المرفق المخزن غير صالح.");
    }

    const directory = getContractAttachmentsDir();

    // التحقق من المسار الحقيقي لمجلد المرفقات قبل الحذف
    let realStorageDirectory: string;

    try {
        realStorageDirectory = await realpath(directory);
    } catch (error) {
        // إذا كان مجلد المرفقات غير موجود، فلا توجد ملفات لحذفها منه
        if (
            error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT"
        ) {
            return;
        }

        throw error;
    }

    const realPublicDirectory = path.resolve(
        await realpath(process.cwd()),
        "public"
    );

    const relativeToPublic = path.relative(
        realPublicDirectory,
        realStorageDirectory
    );

    if (
        relativeToPublic === "" ||
        (
            !relativeToPublic.startsWith("..") &&
            !path.isAbsolute(relativeToPublic)
        )
    ) {
        throw new Error(
            "مسار حذف المرفقات يشير إلى المجلد العام public."
        );
    }

    const filePath = path.join(realStorageDirectory, storedFilename);

    try {
        await unlink(filePath);
    } catch (error) {
        // عدم وجود الملف لا يمنع إكمال التنظيف
        if (
            error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT"
        ) {
            return;
        }

        throw error;
    }
}