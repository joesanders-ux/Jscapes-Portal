import "server-only";
import { Pool, types } from "pg";

// Return DATE columns as plain "YYYY-MM-DD" strings (no time-zone shifting).
types.setTypeParser(1082, (v) => v);

const globalForPg = globalThis as unknown as { pgPool?: Pool };

function createPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  return new Pool({
    connectionString: url,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    max: 10,
  });
}

export function db(): Pool {
  if (!globalForPg.pgPool) globalForPg.pgPool = createPool();
  return globalForPg.pgPool;
}
