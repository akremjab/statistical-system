import "server-only";

export const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;

export const ALLOWED_ATTACHMENT_TYPES = [
    "application/pdf",
    "image/jpeg",
    "image/png",
] as const;

export type AllowedAttachmentType =
    (typeof ALLOWED_ATTACHMENT_TYPES)[number];

export function validateAttachment(
    file: File
): string | null {
    if (file.size === 0) {
        return "لا يمكن رفع ملف فارغ.";
    }

    if (file.size > MAX_ATTACHMENT_SIZE) {
        return "حجم الملف يتجاوز الحد المسموح به (20 MB).";
    }

    if (
        !ALLOWED_ATTACHMENT_TYPES.includes(
            file.type as AllowedAttachmentType
        )
    ) {
        return "نوع الملف غير مسموح به. يُسمح فقط بملفات PDF وJPG وPNG.";
    }

    return null;
}









export async function validateAttachmentSignature(
    file: File
): Promise<string | null> {
    const header = new Uint8Array(
        await file.slice(0, 8).arrayBuffer()
    );

    const startsWith = (signature: number[]): boolean =>
        signature.every(
            (byte, index) => header[index] === byte
        );

    switch (file.type) {
        case "application/pdf":
            if (!startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) {
                return "محتوى الملف لا يطابق صيغة PDF.";
            }
            break;

        case "image/jpeg":
            if (!startsWith([0xff, 0xd8, 0xff])) {
                return "محتوى الملف لا يطابق صيغة JPG.";
            }
            break;

        case "image/png":
            if (
                !startsWith([
                    0x89, 0x50, 0x4e, 0x47,
                    0x0d, 0x0a, 0x1a, 0x0a,
                ])
            ) {
                return "محتوى الملف لا يطابق صيغة PNG.";
            }
            break;

        default:
            return "نوع الملف غير مسموح به.";
    }

    return null;
}