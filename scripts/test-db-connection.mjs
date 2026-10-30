import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";

const envPath = path.resolve(
    process.cwd(),
    ".env.test.local"
);

if (!fs.existsSync(envPath)) {
    throw new Error("ملف .env.test.local غير موجود.");
}

const envContent = fs.readFileSync(envPath, "utf8");

const env = {};

for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
        continue;
    }

    const separator = trimmed.indexOf("=");

    if (separator === -1) {
        continue;
    }

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
    ) {
        value = value.slice(1, -1);
    }

    env[key] = value;
}

if (
    env.DB_NAME !== "statistical_system_test" ||
    env.DB_USER !== "statistical_test_user"
) {
    throw new Error(
        "تم إيقاف الاختبار: اسم قاعدة البيانات أو المستخدم غير مطابق."
    );
}

const port = Number(env.DB_PORT);



if (
    !env.DB_HOST ||
    !env.DB_PASSWORD ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
) {
    throw new Error("إعدادات اتصال قاعدة الاختبار غير صالحة.");
}

const pool = new Pool({
    host: env.DB_HOST,
    port,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    max: 1,
    connectionTimeoutMillis: 5000,
});

try {
    const result = await pool.query(`
        SELECT
            current_database() AS database_name,
            current_user AS database_user
    `);

    const connection = result.rows[0];

    if (
        connection.database_name !== "statistical_system_test" ||
        connection.database_user !== "statistical_test_user"
    ) {
        throw new Error(
            "تم إيقاف الاختبار: الاتصال ليس بقاعدة الاختبار المعتمدة."
        );
    }

    console.log("نجح الاتصال بقاعدة الاختبار.");
    console.log("Database:", connection.database_name);
    console.log("User:", connection.database_user);
    console.log("لم يتم تعديل أي بيانات.");
} catch (error) {
    console.error("فشل اختبار الاتصال:", error.message);
    process.exitCode = 1;
} finally {
    await pool.end();
}