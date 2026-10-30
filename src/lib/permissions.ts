
import "server-only";

import pool from "@/lib/db";
import { getCurrentSession } from "@/lib/current-session";

export async function hasPermission(
    permissionCode: string
): Promise<boolean> {
    const session = await getCurrentSession();

    if (!session || session.mustChangePassword) {
        return false;
    }

    const result = await pool.query(
        `
        SELECT EXISTS (
            SELECT 1
            FROM public.user_permissions AS up
            INNER JOIN public.permissions AS p
                ON p.id = up.permission_id
            INNER JOIN public.users AS u
                ON u.id = up.user_id
            WHERE up.user_id = $1
              AND p.code = $2
              AND u.is_active = TRUE
        ) AS allowed
        `,
        [session.userId, permissionCode]
    );

    return result.rows[0]?.allowed === true;
}










export async function getUserPermissions(
    userId: number
): Promise<string[]> {
    const result = await pool.query<{ code: string }>(
        `
        SELECT p.code
        FROM public.user_permissions AS up
        INNER JOIN public.permissions AS p
            ON p.id = up.permission_id
        INNER JOIN public.users AS u
            ON u.id = up.user_id
        WHERE up.user_id = $1
          AND u.is_active = TRUE
        ORDER BY p.code
        `,
        [userId]
    );

    return result.rows.map((row) => row.code);
}
