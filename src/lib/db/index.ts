/**
 * index.ts — подключение к PostgreSQL через postgres.js и Drizzle.
 *
 * Соединение создаётся лениво на уровне модуля, но не открывается до первого
 * запроса. В production обязательно задайте DATABASE_URL.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

type Database = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
  __associationSql?: ReturnType<typeof postgres>;
  __associationDb?: Database;
};

const connectionString =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/association";

const sql = globalForDb.__associationSql ?? postgres(connectionString, { max: 5 });
const db = globalForDb.__associationDb ?? drizzle(sql, { schema });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__associationSql = sql;
  globalForDb.__associationDb = db;
}

export { db, sql };
export { schema };
