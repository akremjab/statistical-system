const path = require("node:path");
const fs = require("node:fs");
const readline = require("node:readline/promises");
const { emitKeypressEvents } = require("node:readline");
const { stdin, stdout } = require("node:process");

const bcrypt = require("bcrypt");
const { Pool } = require("pg");

const envPath = path.join(process.cwd(), ".env.local");

if (!fs.existsSync(envPath)) {
    throw new Error("ملف .env.local غير موجود");
}

process.loadEnvFile(envPath);

const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    max: 1,
});

async function main() {
    const rl = readline.createInterface({
        input: stdin,
        output: stdout,
    });

    let client;
    let transactionStarted = false;

    try {
        const username = (await rl.question("اسم دخول المدير: ")).trim();
        const fullName = (await rl.question("الاسم الكامل: ")).trim();

        if (!/^[a-zA-Z0-9_]{3,50}$/.test(username)) {
            throw new Error("اسم الدخول يجب أن يحتوي على 3 إلى 50 حرفًا إنجليزيًا أو رقمًا أو _");
        }

        if (fullName.length < 3 || fullName.length > 200) {
            throw new Error("الاسم الكامل يجب أن يحتوي على 3 إلى 200 حرف");
        }

        rl.close();
        const password = await new Promise((resolve, reject) => {
            if (!stdin.isTTY || !stdout.isTTY) {
                reject(new Error("يجب تشغيل السكربت داخل Terminal تفاعلي"));
                return;
            }

            let value = "";

            stdout.write("كلمة مرور المدير المؤقتة (الإدخال مخفي): ");

            emitKeypressEvents(stdin);
            stdin.setRawMode(true);
            stdin.resume();

            function cleanup() {
                stdin.removeListener("keypress", onKeypress);
                stdin.setRawMode(false);
                stdin.pause();
                stdout.write("\n");
            }

            function onKeypress(str, key) {
                if (key.ctrl && key.name === "c") {
                    cleanup();
                    reject(new Error("تم إلغاء العملية"));
                } else if (key.name === "return" || key.name === "enter") {
                    cleanup();
                    resolve(value);
                } else if (key.name === "backspace") {
                    value = value.slice(0, -1);
                } else if (str && !key.ctrl && !key.meta) {
                    value += str;
                }
            }

            stdin.on("keypress", onKeypress);
        });

        if (password.length < 12 || Buffer.byteLength(password, "utf8") > 72) {
            throw new Error("كلمة المرور يجب أن تكون 12 حرفًا على الأقل وألا تتجاوز 72 بايت");
        }

        const passwordHash = await bcrypt.hash(password, 12);


        if (process.env.DB_NAME !== "statistical_system") {
            throw new Error(
                "تم إلغاء العملية: اسم قاعدة البيانات لا يطابق statistical_system"
            );
        }

        if (process.env.DB_USER !== "statistical_app") {
            throw new Error(
                "تم إلغاء العملية: مستخدم قاعدة البيانات غير متوقع"
            );
        }








        client = await pool.connect();

        const connectionCheck = await client.query(`
    SELECT
        current_database() AS database_name,
        current_user AS database_user
`);

        const connectedDatabase = connectionCheck.rows[0];

        if (
            connectedDatabase.database_name !== "statistical_system" ||
            connectedDatabase.database_user !== "statistical_app"
        ) {
            throw new Error(
                "تم إلغاء التهيئة: الاتصال بقاعدة البيانات غير متوقع"
            );
        }

        await client.query("BEGIN");
        transactionStarted = true;


        // منع تشغيل عمليتي تهيئة بالتزامن على نفس قاعدة البيانات
        await client.query(
            "SELECT pg_advisory_xact_lock(741205, 202610)"
        );

        const existing = await client.query(
            "SELECT COUNT(*)::int AS count FROM public.users"
        );

        if (existing.rows[0].count !== 0) {
            throw new Error("يوجد مستخدمون بالفعل. تم إلغاء التهيئة.");
        }

        const permissions = await client.query(
            "SELECT id FROM public.permissions ORDER BY id"
        );

        if (permissions.rowCount !== 27) {
            throw new Error("عدد الصلاحيات غير متوقع. تم إلغاء التهيئة.");
        }

        const result = await client.query(
            `INSERT INTO public.users
       (username, full_name, password_hash, is_active, must_change_password, account_type)
       VALUES ($1, $2, $3, true, true, 'system_admin')
       RETURNING id, username`,
            [username, fullName, passwordHash]
        );

        const adminId = result.rows[0].id;

        await client.query(
            `INSERT INTO public.user_permissions
       (user_id, permission_id, granted_by)
       SELECT $1, id, NULL
       FROM public.permissions`,
            [adminId]
        );

        await client.query(
            `INSERT INTO public.audit_logs
     (
         user_id,
         actor_username,
         action,
         entity_type,
         entity_id,
         old_values,
         new_values,
         reason,
         success
     )
     VALUES (
         $1,
         $2,
         $3,
         $4,
         $5,
         NULL,
         $6::jsonb,
         $7,
         true
     )`,
            [
                adminId,
                username,
                "system.bootstrap_admin",
                "users",
                String(adminId),
                JSON.stringify({
                    username,
                    full_name: fullName,
                    is_active: true,
                    must_change_password: true,
                    permissions_count: permissions.rowCount,
                }),
                "إنشاء حساب المدير الأول أثناء التهيئة الأولية للمنظومة",
            ]
        );



        // اعتماد جميع العمليات بعد نجاحها
        await client.query("COMMIT");
        transactionStarted = false;



        console.log("تم إنشاء حساب المدير ومنحه الصلاحيات بنجاح.");
        console.log("اسم الدخول:", result.rows[0].username);
        console.log("سيُطلب تغيير كلمة المرور عند أول دخول.");
    } catch (error) {
        if (client && transactionStarted) {
            await client.query("ROLLBACK").catch(() => { });
        }

        console.error("فشلت التهيئة:", error.message);
        process.exitCode = 1;
    } finally {
        if (client) client.release();
        rl.close();
        await pool.end();
    }
}

main();