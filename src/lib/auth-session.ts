
import "server-only";

import type { PoolClient } from "pg";

import { SESSION_IDLE_TIMEOUT_MS } from "./auth-config";
import {
    generateSessionToken,
    hashSessionToken,
} from "./session-token";

type CreateSessionOptions = {
    userId: number;
    ipAddress?: string | null;
    userAgent?: string | null;
};

export async function createUserSession(
    client: PoolClient,
    options: CreateSessionOptions
): Promise<{
    token: string;
    expiresAt: Date;
}> {
    const { userId, ipAddress, userAgent } = options;

    const token = generateSessionToken();
    const tokenHash = hashSessionToken(token);

    const expiresAt = new Date(
        Date.now() + SESSION_IDLE_TIMEOUT_MS
    );

    // إلغاء أي جلسة سابقة قبل إنشاء الجلسة الجديدة.
    await client.query(
        `
    UPDATE public.user_sessions
    SET
      revoked_at = NOW(),
      revocation_reason = 'new_login'
    WHERE user_id = $1
      AND revoked_at IS NULL
    `,
        [userId]
    );

    await client.query(
        `
    INSERT INTO public.user_sessions (
      user_id,
      token_hash,
      expires_at,
      ip_address,
      user_agent
    )
    VALUES ($1, $2, $3, $4, $5)
    `,
        [
            userId,
            tokenHash,
            expiresAt,
            ipAddress ?? null,
            userAgent?.slice(0, 1000) ?? null,
        ]
    );

    return {
        token,
        expiresAt,
    };
}
