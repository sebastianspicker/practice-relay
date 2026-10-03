/** PostgreSQL schema for shared admission and single-use protocol state. */
import {
  migrateDatabase,
  requireDatabaseMigrations,
  type Database,
  type DatabaseMigration,
} from "@practice-relay/database";

export const RUNTIME_STATE_MIGRATIONS: readonly DatabaseMigration[] = [
  {
    id: "0001_runtime_state",
    sql: `
CREATE TABLE practice_relay_login_failures (
  tenant_id text NOT NULL,
  failure_scope text NOT NULL CHECK (failure_scope IN ('account', 'source')),
  failure_key text NOT NULL,
  failure_count integer NOT NULL CHECK (failure_count > 0),
  reset_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, failure_scope, failure_key)
);
CREATE INDEX practice_relay_login_failures_expiry_idx
  ON practice_relay_login_failures (tenant_id, reset_at);

CREATE TABLE practice_relay_login_attempts (
  tenant_id text NOT NULL,
  attempt_id uuid NOT NULL,
  account_key text NOT NULL,
  source_key text NOT NULL,
  expires_at timestamptz NOT NULL,
  window_ms integer NOT NULL CHECK (window_ms > 0),
  PRIMARY KEY (tenant_id, attempt_id)
);
CREATE INDEX practice_relay_login_attempts_account_idx
  ON practice_relay_login_attempts (tenant_id, account_key, expires_at);
CREATE INDEX practice_relay_login_attempts_source_idx
  ON practice_relay_login_attempts (tenant_id, source_key, expires_at);

CREATE TABLE practice_relay_lti_launches (
  tenant_id text NOT NULL,
  state text NOT NULL,
  launch jsonb NOT NULL CHECK (jsonb_typeof(launch) = 'object'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, state)
);
CREATE INDEX practice_relay_lti_launches_expiry_idx
  ON practice_relay_lti_launches (tenant_id, expires_at, created_at);`,
  },
] as const;

/** Apply all runtime-state schema migrations. */
export async function migrateRuntimeState(database: Database): Promise<void> {
  await migrateDatabase(database, "runtime-state", RUNTIME_STATE_MIGRATIONS);
}

/** Fail readiness when any runtime-state migration is absent. */
export async function requireRuntimeStateMigrations(database: Database): Promise<void> {
  await requireDatabaseMigrations(
    database,
    "runtime-state",
    RUNTIME_STATE_MIGRATIONS.map((migration) => migration.id),
  );
}
