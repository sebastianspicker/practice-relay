/** PostgreSQL schema and offline snapshot import for canonical WorkRecord state. */
import {
  migrateDatabase,
  requireDatabaseMigrations,
  type Database,
  type DatabaseMigration,
} from "@practice-relay/database";
import { parseWorkRecord, type WorkRecord } from "@practice-relay/work-record";
import type { RecordEvent } from "./types.js";

export const RECORD_STORE_MIGRATIONS: readonly DatabaseMigration[] = [
  {
    id: "0001_record_store",
    sql: `
CREATE TABLE practice_relay_work_records (
  tenant_id text NOT NULL,
  record_id text NOT NULL,
  document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object'),
  title text GENERATED ALWAYS AS (document ->> 'title') STORED,
  revision bigint GENERATED ALWAYS AS (COALESCE((document ->> 'revision')::bigint, 0)) STORED,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, record_id),
  CHECK (record_id = document ->> 'id')
);
CREATE INDEX practice_relay_work_records_members_idx
  ON practice_relay_work_records USING gin ((document -> 'members'));
CREATE INDEX practice_relay_work_records_summary_idx
  ON practice_relay_work_records (tenant_id, record_id COLLATE "C") INCLUDE (title, revision);

CREATE TABLE practice_relay_record_events (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id text NOT NULL,
  record_id text NOT NULL,
  occurred_at timestamptz NOT NULL,
  kind text NOT NULL,
  detail text,
  actor_id text
);
CREATE INDEX practice_relay_record_events_record_idx
  ON practice_relay_record_events (tenant_id, record_id, event_id);
CREATE INDEX practice_relay_record_events_audit_idx
  ON practice_relay_record_events (tenant_id, event_id);

CREATE TABLE practice_relay_record_store_counters (
  tenant_id text PRIMARY KEY,
  record_count bigint NOT NULL DEFAULT 0 CHECK (record_count >= 0),
  audit_event_count bigint NOT NULL DEFAULT 0 CHECK (audit_event_count >= 0)
);`,
  },
] as const;

/** Apply all record-store schema migrations. */
export async function migrateRecordStore(database: Database): Promise<void> {
  await migrateDatabase(database, "record-store", RECORD_STORE_MIGRATIONS);
}

/** Fail readiness when any record-store schema migration is absent. */
export async function requireRecordStoreMigrations(database: Database): Promise<void> {
  await requireDatabaseMigrations(
    database,
    "record-store",
    RECORD_STORE_MIGRATIONS.map((migration) => migration.id),
  );
}

/** Canonical records and audit events supplied by the offline JSON migration CLI. */
export interface RecordSnapshotImport {
  readonly tenantId?: string;
  readonly records: readonly WorkRecord[];
  readonly events: readonly RecordEvent[];
  readonly dryRun?: boolean;
}

function tenantId(value: string | undefined): string {
  const tenant = value ?? "default";
  if (tenant.length < 1 || tenant.length > 128 || /[\u0000-\u001f\u007f]/u.test(tenant)) {
    throw new Error("invalid database tenant id");
  }
  return tenant;
}

function canonicalEvent(event: RecordEvent): RecordEvent {
  if (
    typeof event.at !== "string" || Number.isNaN(Date.parse(event.at)) ||
    typeof event.kind !== "string" || event.kind.trim() === "" ||
    typeof event.recordId !== "string" || event.recordId.trim() === "" ||
    (event.detail !== undefined && typeof event.detail !== "string") ||
    (event.actorId !== undefined && typeof event.actorId !== "string")
  ) {
    throw new Error("invalid record event in snapshot");
  }
  return {
    at: new Date(event.at).toISOString(),
    kind: event.kind,
    recordId: event.recordId,
    ...(event.detail === undefined ? {} : { detail: event.detail }),
    ...(event.actorId === undefined ? {} : { actorId: event.actorId }),
  };
}

/** Validate and atomically import a JSON snapshot without changing its source. */
export async function importRecordSnapshot(
  database: Database,
  input: RecordSnapshotImport,
): Promise<{ recordCount: number; eventCount: number; dryRun: boolean }> {
  const tenant = tenantId(input.tenantId);
  const records = input.records.map((record) => parseWorkRecord(structuredClone(record)));
  const events = input.events.map(canonicalEvent);
  const ids = records.map((record) => record.id);
  if (new Set(ids).size !== ids.length) throw new Error("snapshot contains duplicate record ids");
  await requireRecordStoreMigrations(database);
  await database.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`practice-relay:record-import:${tenant}`]);
    const occupied = await tx.query<{ occupied: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM practice_relay_work_records WHERE tenant_id=$1)
        OR EXISTS(SELECT 1 FROM practice_relay_record_events WHERE tenant_id=$1)
        OR EXISTS(SELECT 1 FROM practice_relay_record_store_counters WHERE tenant_id=$1 AND (record_count>0 OR audit_event_count>0)) AS occupied`,
      [tenant],
    );
    if (occupied.rows[0]?.occupied !== false) {
      throw new Error("record snapshot destination conflict: the destination record namespace must be empty");
    }
    if (input.dryRun === true) return;
    for (const record of records) {
      await tx.query(
        `INSERT INTO practice_relay_work_records (tenant_id, record_id, document)
         VALUES ($1, $2, $3::jsonb)`,
        [tenant, record.id, JSON.stringify(record)],
      );
    }
    for (const event of events) {
      await tx.query(
        `INSERT INTO practice_relay_record_events
           (tenant_id, record_id, occurred_at, kind, detail, actor_id)
         VALUES ($1, $2, $3::timestamptz, $4, $5, $6)`,
        [tenant, event.recordId, event.at, event.kind, event.detail ?? null, event.actorId ?? null],
      );
    }
    await tx.query(
      `INSERT INTO practice_relay_record_store_counters
         (tenant_id, record_count, audit_event_count)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id) DO UPDATE SET
         record_count = practice_relay_record_store_counters.record_count + EXCLUDED.record_count,
         audit_event_count = practice_relay_record_store_counters.audit_event_count + EXCLUDED.audit_event_count`,
      [tenant, records.length, events.length],
    );
  });
  return { recordCount: records.length, eventCount: events.length, dryRun: input.dryRun === true };
}
