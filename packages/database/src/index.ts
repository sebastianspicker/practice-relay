/** Shared PostgreSQL 18 connection and migration infrastructure. */
import pg, { type PoolConfig, type QueryResultRow } from "pg";

const { Pool } = pg;

/** Driver-neutral query result used by the shared database boundary. */
export type DatabaseQueryResult<Row extends QueryResultRow = QueryResultRow> = {
  readonly rows: Row[];
  readonly rowCount: number | null;
};

/** Minimal database surface accepted by adapters and migration modules. */
export interface Database {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<DatabaseQueryResult<Row>>;
  transaction<Result>(fn: (database: Database) => Promise<Result>): Promise<Result>;
  checkHealth(): Promise<void>;
  close(): Promise<void>;
}

/** Bounded pg Pool configuration accepted by createDatabase. */
export interface CreateDatabaseOptions {
  readonly connectionString: string;
  readonly max?: number;
  readonly applicationName?: string;
  readonly statementTimeoutMs?: number;
  readonly connectionTimeoutMs?: number;
}

/** One immutable, ordered migration owned by a package component. */
export interface DatabaseMigration {
  readonly id: string;
  readonly sql: string;
}

function queryAdapter(queryable: {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<DatabaseQueryResult<Row>>;
}): Pick<Database, "query" | "checkHealth"> {
  return {
    query: (text, values) => queryable.query(text, values),
    async checkHealth() {
      await queryable.query("SELECT 1");
    },
  };
}

/** Create a bounded pg Pool without retaining or logging its connection string. */
export function createDatabase(options: CreateDatabaseOptions): Database {
  if (options.connectionString.trim() === "") {
    throw new Error("database connectionString is required");
  }
  const config: PoolConfig = {
    connectionString: options.connectionString,
    max: options.max ?? 10,
    application_name: options.applicationName ?? "practice-relay",
    statement_timeout: options.statementTimeoutMs ?? 5_000,
    connectionTimeoutMillis: options.connectionTimeoutMs ?? 5_000,
  };
  const pool = new Pool(config);
  return {
    ...queryAdapter(pool),
    async transaction<Result>(fn: (database: Database) => Promise<Result>): Promise<Result> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const base = queryAdapter(client);
        const transactionDatabase: Database = {
          ...base,
          transaction: async (nested) => nested(transactionDatabase),
          close: async () => undefined,
        };
        const result = await fn(transactionDatabase);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

const MIGRATION_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS practice_relay_migrations (
  component text NOT NULL,
  migration_id text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (component, migration_id)
)`;

/** Apply an ordered component migration set once, transactionally. */
export async function migrateDatabase(
  database: Database,
  component = "database",
  migrations: readonly DatabaseMigration[] = [],
): Promise<void> {
  if (!/^[a-z][a-z0-9_-]*$/u.test(component)) {
    throw new Error("invalid database migration component");
  }
  const seen = new Set<string>();
  for (const migration of migrations) {
    if (!/^\d{4}_[a-z0-9_]+$/u.test(migration.id) || seen.has(migration.id)) {
      throw new Error(`invalid or duplicate migration id ${JSON.stringify(migration.id)}`);
    }
    seen.add(migration.id);
  }
  await database.transaction(async (tx) => {
    await tx.query(MIGRATION_TABLE_SQL);
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `practice-relay:migrate:${component}`,
    ]);
    for (const migration of migrations) {
      const applied = await tx.query<{ migration_id: string }>(
        "SELECT migration_id FROM practice_relay_migrations WHERE component = $1 AND migration_id = $2",
        [component, migration.id],
      );
      if (applied.rowCount !== 0) continue;
      await tx.query(migration.sql);
      await tx.query(
        "INSERT INTO practice_relay_migrations (component, migration_id) VALUES ($1, $2)",
        [component, migration.id],
      );
    }
  });
}

/** Fail closed when a component's required migrations are absent. */
export async function requireDatabaseMigrations(
  database: Database,
  component: string,
  migrationIds: readonly string[],
): Promise<void> {
  let rows: DatabaseQueryResult<{ migration_id: string }>;
  try {
    rows = await database.query<{ migration_id: string }>(
      "SELECT migration_id FROM practice_relay_migrations WHERE component = $1 AND migration_id = ANY($2::text[])",
      [component, migrationIds],
    );
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    throw new Error(`database migrations for ${component} are missing: ${cause}`);
  }
  const applied = new Set(rows.rows.map((row) => row.migration_id));
  const missing = migrationIds.filter((id) => !applied.has(id));
  if (missing.length > 0) {
    throw new Error(`database migrations for ${component} are missing: ${missing.join(", ")}`);
  }
}
