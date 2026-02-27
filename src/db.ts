import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

// Prefer DATABASE_URL from environment, fall back to local development DB.
const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://postgres:aditaditi@localhost:5432/bitspeed";

export const pool = new Pool({
  connectionString,
});

export async function connectPostgres(): Promise<void> {
  // Establish an initial connection to fail fast if config is wrong.
  const client: PoolClient = await pool.connect();
  client.release();
  // eslint-disable-next-line no-console
  console.log("Connected to PostgreSQL");
}

export async function query<T extends QueryResultRow = any>(
  text: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

