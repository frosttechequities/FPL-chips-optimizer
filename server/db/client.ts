import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { newDb, type IMemoryDb } from "pg-mem";
import { existsSync, readFileSync, readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;
type PoolConfig = pg.PoolConfig;
import * as schema from "./schema";

const currentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(currentDir, "..", "..");
const migrationsDir = join(projectRoot, "migrations");

let pool: Pool | null = null;
let db: NodePgDatabase<typeof schema> | null = null;
let memoryDb: IMemoryDb | null = null;
let memoryPool: Pool | null = null;
let loggedInMemoryWarning = false;

function patchQueryMethod(target: any): void {
  if (!target || typeof target.query !== "function") {
    return;
  }

  const originalQuery = target.query.bind(target);
  target.query = (query: any, params?: any, callback?: any) => {
    if (query && typeof query === "object" && !Array.isArray(query)) {
      const normalizedQuery = { ...query };
      delete normalizedQuery.types;
      delete normalizedQuery.rowMode;
      return originalQuery(normalizedQuery, params as any, callback);
    }

    return originalQuery(query, params as any, callback);
  };
}

function ensureMemoryPool(): Pool {
  if (memoryPool) {
    return memoryPool;
  }

  memoryDb = newDb({ autoCreateForeignKeyIndices: true });

  try {
    if (existsSync(migrationsDir)) {
      const migrationFiles = readdirSync(migrationsDir)
        .filter(file => file.endsWith(".sql"))
        .sort();

      for (const file of migrationFiles) {
        const sql = readFileSync(join(migrationsDir, file), "utf-8");
        if (sql.trim().length > 0) {
          memoryDb.public.none(sql);
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[db] Failed to apply migrations to in-memory database: ${message}`);
  }

  const adapters = memoryDb.adapters.createPg();
  const pgMemPool = new adapters.Pool();

  patchQueryMethod(pgMemPool);

  const originalConnect = pgMemPool.connect.bind(pgMemPool);
  pgMemPool.connect = async (...args: any[]) => {
    const client = await originalConnect(...args);
    patchQueryMethod(client);
    return client;
  };

  memoryPool = pgMemPool as unknown as Pool;

  if (!loggedInMemoryWarning) {
    console.warn("[db] DATABASE_URL not set; using in-memory pg-mem database. Data will reset on restart.");
    loggedInMemoryWarning = true;
  }

  return memoryPool;
}

export function createDatabase(customPool?: Pool): NodePgDatabase<typeof schema> {
  if (customPool) {
    return drizzle(customPool, { schema, logger: process.env.DB_DEBUG === "true" });
  }

  if (!db) {
    const connectionString = process.env.DATABASE_URL;

    if (connectionString) {
      const config: PoolConfig = {
        connectionString,
        max: parseInt(process.env.DB_POOL_MAX || "5", 10),
        idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS || "10000", 10),
      };

      pool = new Pool(config);
    } else {
      pool = ensureMemoryPool();
    }

    const activePool = pool;
    if (!activePool) {
      throw new Error("Failed to initialise database connection pool");
    }

    db = drizzle(activePool, { schema, logger: process.env.DB_DEBUG === "true" });
  }

  return db;
}

export async function shutdownDatabase(): Promise<void> {
  await pool?.end().catch(() => undefined);
  pool = null;
  db = null;
  memoryPool = null;
  memoryDb = null;
}

export type AppDatabase = NodePgDatabase<typeof schema>;
export { schema };
