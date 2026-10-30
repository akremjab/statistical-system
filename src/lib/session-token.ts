
import "server-only";

import {
    createHash,
    randomBytes,
    timingSafeEqual,
} from "node:crypto";

import { AUTH_CONFIG } from "./auth-config";

/**
 * إنشاء رمز جلسة عشوائي وآمن.
 * يُرسل الرمز الأصلي للمتصفح فقط.
 */
export function generateSessionToken(): string {
    return randomBytes(
        AUTH_CONFIG.sessionTokenBytes
    ).toString("hex");
}

/**
 * إنشاء بصمة SHA-256 للرمز.
 * هذه القيمة فقط تُحفظ في PostgreSQL.
 */
export function hashSessionToken(token: string): string {
    return createHash("sha256")
        .update(token, "utf8")
        .digest("hex");
}

/**
 * مقارنة بصمتين بزمن ثابت.
 */
export function verifySessionTokenHash(
    token: string,
    storedHash: string
): boolean {
    const calculatedHash = Buffer.from(
        hashSessionToken(token),
        "hex"
    );

    if (!/^[a-f0-9]{64}$/i.test(storedHash)) {
        return false;
    }

    const expectedHash = Buffer.from(storedHash, "hex");

    return timingSafeEqual(calculatedHash, expectedHash);
}
