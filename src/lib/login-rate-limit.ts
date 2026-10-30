
import "server-only";

import type { PoolClient } from "pg";

const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;

export async function checkLoginRateLimit(
    client: PoolClient,
    username: string
): Promise<boolean> {
    const normalizedUsername = username.toLowerCase();

    // يُستدعى داخل معاملة PostgreSQL.
    // يمنع الطلبات المتزامنة لنفس اسم المستخدم من تجاوز الحد.
    await client.query(
        `
    SELECT pg_advisory_xact_lock(
      hashtext($1),
      202610
    )
    `,
        [`login:${normalizedUsername}`]
    );

    const result = await client.query<{ failed_count: number }>(
        `

SELECT COUNT(*)::int AS failed_count
FROM public.login_attempts
WHERE LOWER(username) = $1
  AND success = FALSE
  AND attempted_at > NOW() - ($2 * INTERVAL '1 minute')
  AND attempted_at > COALESCE(
    (
      SELECT MAX(attempted_at)
      FROM public.login_attempts
      WHERE LOWER(username) = $1
        AND success = TRUE
    ),
    '-infinity'::timestamptz
  )

    `,
        [normalizedUsername, WINDOW_MINUTES]
    );

    return result.rows[0].failed_count < MAX_FAILED_ATTEMPTS;
}

export async function recordLoginAttempt(
    client: PoolClient,
    username: string,
    success: boolean
): Promise<void> {
    await client.query(
        `
    INSERT INTO public.login_attempts (
      username,
      success
    )
    VALUES ($1, $2)
    `,
        [username.toLowerCase(), success]
    );
}













const MAX_PASSWORD_CHANGE_FAILURES = 5;

export async function checkPasswordChangeRateLimit(
    client: PoolClient,
    userId: number
): Promise<boolean> {
    const key = `password-change:${userId}`;

    // قفل المعاملة لمنع الطلبات المتزامنة من تجاوز الحد.
    await client.query(
        `SELECT pg_advisory_xact_lock(hashtext($1), 202611)`,
        [key]
    );

    const result = await client.query<{
        failed_count: number;
    }>(
        `
        SELECT COUNT(*)::int AS failed_count
        FROM public.login_attempts
        WHERE username = $1
          AND success = FALSE
          AND attempted_at >
              NOW() - INTERVAL '15 minutes'
        `,
        [key]
    );

    return (
        result.rows[0].failed_count <
        MAX_PASSWORD_CHANGE_FAILURES
    );
}

export async function recordPasswordChangeFailure(
    client: PoolClient,
    userId: number
): Promise<void> {
    await client.query(
        `
        INSERT INTO public.login_attempts (
            username,
            success
        )
        VALUES ($1, FALSE)
        `,
        [`password-change:${userId}`]
    );
}
