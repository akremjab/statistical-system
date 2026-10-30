
import "server-only";

import bcrypt from "bcrypt";
import type { PoolClient } from "pg";

export type AuthUser = {
    id: number;
    username: string;
    full_name: string;
    is_active: boolean;
    must_change_password: boolean;
};

type UserRow = AuthUser & {
    password_hash: string;
};

export async function verifyUserCredentials(
    client: PoolClient,
    username: string,
    password: string
): Promise<AuthUser | null> {
    const result = await client.query<UserRow>(
        `
    SELECT
      id,
      username,
      full_name,
      password_hash,
      is_active,
      must_change_password
    FROM public.users
    WHERE LOWER(username) = LOWER($1)
    LIMIT 1
    FOR UPDATE
    `,
        [username]
    );

    const user = result.rows[0];

    // بصمة ثابتة تُستخدم فقط عند عدم وجود حساب صالح.
    // ليست كلمة مرور لأي مستخدم حقيقي.
    const DUMMY_PASSWORD_HASH =
        "$2b$12$KIXQ4LqH4bHkTjK1fF1Q9uZ5w3x3xH6YJ7Qp2QKq3oYx9kYwQ7b1K";

    const passwordMatches = await bcrypt.compare(
        password,
        user?.password_hash ?? DUMMY_PASSWORD_HASH
    );

    if (!user || !user.is_active || !passwordMatches) {
        return null;
    }



    return {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        is_active: user.is_active,
        must_change_password: user.must_change_password,
    };
}
