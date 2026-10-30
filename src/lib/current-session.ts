
import "server-only";

import { cookies } from "next/headers";
import { unstable_noStore as noStore } from "next/cache";
import pool from "@/lib/db";
import { AUTH_CONFIG } from "@/lib/auth-config";
import { hashSessionToken } from "@/lib/session-token";

export type CurrentSession = {
    userId: number;
    username: string;
    fullName: string;
    accountType: "system_admin" | "standard";
    mustChangePassword: boolean;
    sessionId: number;
};


export async function getCurrentSession():
    Promise<CurrentSession | null> {
    noStore();

    const cookieStore = await cookies();

    const token = cookieStore.get(AUTH_CONFIG.cookieName)?.value;

    if (!token || !/^[a-f0-9]{64}$/.test(token)) {
        return null;
    }

    const tokenHash = hashSessionToken(token);

    const result = await pool.query<{
        user_id: number;
        username: string;
        full_name: string;
        account_type: "system_admin" | "standard";
        must_change_password: boolean;
        session_id: number;
    }>(
        `
    SELECT
      u.id AS user_id,
u.username,
u.full_name,
u.account_type,
u.must_change_password,
      s.id AS session_id
    FROM public.user_sessions AS s
    INNER JOIN public.users AS u
      ON u.id = s.user_id
    WHERE s.token_hash = $1
      AND s.revoked_at IS NULL
      AND s.expires_at > NOW()
      AND u.is_active = TRUE
    LIMIT 1
    `,
        [tokenHash]
    );

    const session = result.rows[0];

    if (!session) {
        return null;
    }

    return {
        userId: session.user_id,
        username: session.username,
        fullName: session.full_name,
        accountType: session.account_type,
        mustChangePassword: session.must_change_password,
        sessionId: session.session_id,
    };
}
