
import { Pool } from "pg";

const requiredEnv = [
    "DB_HOST",
    "DB_PORT",
    "DB_USER",
    "DB_PASSWORD",
    "DB_NAME",
] as const;

for (const key of requiredEnv) {
    if (!process.env[key]) {
        throw new Error(`Missing database environment variable: ${key}`);
    }
}

const port = Number(process.env.DB_PORT);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid DB_PORT");
}

const globalForPg = globalThis as unknown as {
    pgPool?: Pool;
};

const pool =
    globalForPg.pgPool ??
    new Pool({
        host: process.env.DB_HOST,
        port,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
    });

if (process.env.NODE_ENV !== "production") {
    globalForPg.pgPool = pool;
}

export default pool;
