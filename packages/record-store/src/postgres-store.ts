/** Tenant-bound PostgreSQL 18 adapter with transactional records, events, and counters. */
import type { Database } from "@practice-relay/database";
import {
  parseWorkRecord,
  WorkRecordDuplicateError,
  type RecordMutationOptions,
  type WorkRecord,
} from "@practice-relay/work-record";
import { requireRecordStoreMigrations } from "./migrations.js";
import {
  RecordRevisionConflictError,
  UnsupportedRecordStoreOperationError,
  type RecordStoreAdapter,
  type RecordSummaryQuery,
} from "./types.js";
import { parseNextRecord, parseWrittenRecord } from "./record-revision.js";

/** Shared database and tenant binding for one PostgreSQL adapter. */
export interface PostgresRecordStoreOptions {
  readonly database: Database;
  readonly tenantId?: string;
}

function resolveTenantId(value: string | undefined): string {
  const tenant = value ?? "default";
  if (tenant.length < 1 || tenant.length > 128 || /[\u0000-\u001f\u007f]/u.test(tenant)) {
    throw new Error("invalid database tenant id");
  }
  return tenant;
}

function validateSummaryQuery(options: RecordSummaryQuery): void {
  if (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 100) {
    throw new Error("record summary limit must be an integer between 1 and 100");
  }
}

function assertExpectedRevision(id: string, latest: WorkRecord, options?: RecordMutationOptions): void {
  if (options?.expectedRevision === undefined) return;
  const revision = latest.revision ?? 0;
  if (revision !== options.expectedRevision) {
    throw new RecordRevisionConflictError(id, revision, options.expectedRevision);
  }
}

function toRecord(value: unknown): WorkRecord {
  return parseWorkRecord(typeof value === "string" ? JSON.parse(value) : value);
}

async function appendEvent(
  database: Database,
  event: {
    tenant: string;
    recordId: string;
    kind: string;
    detail?: string;
    actorId?: string;
  },
): Promise<void> {
  await database.query(
    `INSERT INTO practice_relay_record_events
       (tenant_id, record_id, occurred_at, kind, detail, actor_id)
     VALUES ($1, $2, clock_timestamp(), $3, $4, $5)`,
    [event.tenant, event.recordId, event.kind, event.detail ?? null, event.actorId ?? null],
  );
  await database.query(
    `INSERT INTO practice_relay_record_store_counters (tenant_id, audit_event_count)
     VALUES ($1, 1)
     ON CONFLICT (tenant_id) DO UPDATE SET
       audit_event_count = practice_relay_record_store_counters.audit_event_count + 1`,
    [event.tenant],
  );
}

/** Construct a PostgreSQL adapter. Call checkHealth during startup before accepting traffic. */
export function createPostgresRecordStore(options: PostgresRecordStoreOptions): RecordStoreAdapter {
  const database = options.database;
  const tenant = resolveTenantId(options.tenantId);
  let migrationCheck: Promise<void> | undefined;
  const ready = (): Promise<void> => migrationCheck ??= requireRecordStoreMigrations(database);

  const store: RecordStoreAdapter = {
    rootDir: `postgres:${tenant}`,
    tenantId: options.tenantId,
    durable: true,
    backend: "postgres",
    async create(record) {
      await ready();
      const canonical = parseWrittenRecord({ ...record, revision: 0 });
      return database.transaction(async (tx) => {
        try {
          await tx.query(
            `INSERT INTO practice_relay_work_records (tenant_id, record_id, document)
             VALUES ($1, $2, $3::jsonb)`,
            [tenant, canonical.id, JSON.stringify(canonical)],
          );
        } catch (error) {
          if ((error as { code?: unknown }).code === "23505") {
            throw new WorkRecordDuplicateError(`record ${canonical.id} already exists`);
          }
          throw error;
        }
        await tx.query(
          `INSERT INTO practice_relay_record_store_counters (tenant_id, record_count)
           VALUES ($1, 1)
           ON CONFLICT (tenant_id) DO UPDATE SET
             record_count = practice_relay_record_store_counters.record_count + 1`,
          [tenant],
        );
        await appendEvent(tx, { tenant, recordId: canonical.id, kind: "create" });
        return structuredClone(canonical);
      });
    },
    async get(id) {
      await ready();
      const result = await database.query<{ document: unknown }>(
        `SELECT document FROM practice_relay_work_records
         WHERE tenant_id = $1 AND record_id = $2`,
        [tenant, id],
      );
      return result.rows[0] === undefined ? undefined : toRecord(result.rows[0].document);
    },
    async readWithEvents(id, authorize) {
      await ready();
      return database.transaction(async (tx) => {
        const result = await tx.query<{ document: unknown }>(
          `SELECT document FROM practice_relay_work_records
           WHERE tenant_id = $1 AND record_id = $2
           FOR SHARE`,
          [tenant, id],
        );
        if (!result.rows[0]) return undefined;
        const record = toRecord(result.rows[0].document);
        const authorizationResult = authorize(structuredClone(record)) as unknown;
        if (authorizationResult && typeof (authorizationResult as { then?: unknown }).then === "function") {
          throw new Error("record authorization callback must be synchronous");
        }
        const events = await tx.query<{
          at: Date | string; kind: string; record_id: string; detail: string | null; actor_id: string | null;
        }>(
          `SELECT occurred_at AS at, kind, record_id, detail, actor_id
           FROM practice_relay_record_events
           WHERE tenant_id = $1 AND record_id = $2 ORDER BY event_id`,
          [tenant, id],
        );
        return {
          record,
          events: events.rows.map((row) => ({
            at: new Date(row.at).toISOString(),
            kind: row.kind,
            recordId: row.record_id,
            ...(row.detail === null ? {} : { detail: row.detail }),
            ...(row.actor_id === null ? {} : { actorId: row.actor_id }),
          })),
        };
      });
    },
    async list() {
      await ready();
      const result = await database.query<{ document: unknown }>(
        `SELECT document FROM practice_relay_work_records
         WHERE tenant_id = $1 ORDER BY record_id COLLATE "C"`,
        [tenant],
      );
      return result.rows.map((row) => toRecord(row.document));
    },
    async update(id, record) {
      const canonical = parseWrittenRecord(record);
      return store.mutate(id, () => canonical, {
        expectedRevision: canonical.revision,
        kind: "update",
      });
    },
    async mutate(id, transition, mutationOptions) {
      await ready();
      return database.transaction(async (tx) => {
        const result = await tx.query<{ document: unknown }>(
          `SELECT document FROM practice_relay_work_records
           WHERE tenant_id = $1 AND record_id = $2
           FOR UPDATE`,
          [tenant, id],
        );
        if (result.rows[0] === undefined) throw new Error(`record ${id} not found`);
        const latest = toRecord(result.rows[0].document);
        assertExpectedRevision(id, latest, mutationOptions);
        const requested = transition(structuredClone(latest));
        if (requested && typeof (requested as { then?: unknown }).then === "function") {
          throw new Error("record transition must be synchronous");
        }
        const next = parseNextRecord(id, latest, requested);
        await tx.query(
          `UPDATE practice_relay_work_records
           SET document = $3::jsonb, updated_at = clock_timestamp()
           WHERE tenant_id = $1 AND record_id = $2`,
          [tenant, id, JSON.stringify(next)],
        );
        await appendEvent(tx, {
          tenant,
          recordId: id,
          kind: mutationOptions?.kind ?? "update",
          ...(mutationOptions?.detail === undefined ? {} : { detail: mutationOptions.detail }),
          ...(mutationOptions?.actorId === undefined ? {} : { actorId: mutationOptions.actorId }),
        });
        return structuredClone(next);
      });
    },
    async delete(id) {
      await ready();
      return database.transaction(async (tx) => {
        const result = await tx.query(
          `DELETE FROM practice_relay_work_records
           WHERE tenant_id = $1 AND record_id = $2`,
          [tenant, id],
        );
        if (result.rowCount !== 0) {
          await tx.query(
            `UPDATE practice_relay_record_store_counters
             SET record_count = record_count - 1 WHERE tenant_id = $1`,
            [tenant],
          );
        }
        await appendEvent(tx, { tenant, recordId: id, kind: "delete" });
        return result.rowCount !== 0;
      });
    },
    async listByMember(userId) {
      await ready();
      const result = await database.query<{ document: unknown }>(
        `SELECT document FROM practice_relay_work_records
         WHERE tenant_id = $1
           AND document -> 'members' @> jsonb_build_array(jsonb_build_object('userId', $2::text))
         ORDER BY record_id COLLATE "C"`,
        [tenant, userId],
      );
      return result.rows.map((row) => toRecord(row.document));
    },
    async listSummariesByMember(userId, queryOptions) {
      await ready();
      validateSummaryQuery(queryOptions);
      const result = await database.query<{ record_id: string; title: string; revision: string | number }>(
        `SELECT record_id, title, revision FROM practice_relay_work_records
         WHERE tenant_id = $1
           AND document -> 'members' @> jsonb_build_array(jsonb_build_object('userId', $2::text))
           AND ($3::text IS NULL OR record_id COLLATE "C" > $3 COLLATE "C")
           AND ($4::text IS NULL OR strpos(lower(title), lower($4)) > 0)
         ORDER BY record_id COLLATE "C"
         LIMIT $5`,
        [tenant, userId, queryOptions.after ?? null, queryOptions.title?.trim() || null, queryOptions.limit + 1],
      );
      return {
        items: result.rows.slice(0, queryOptions.limit).map((row) => ({
          id: row.record_id,
          title: row.title,
          revision: Number(row.revision),
        })),
        hasMore: result.rows.length > queryOptions.limit,
      };
    },
    async appendEvent(recordId, kind, detail, actorId) {
      await ready();
      await database.transaction((tx) => appendEvent(tx, {
        tenant,
        recordId,
        kind,
        ...(detail === undefined ? {} : { detail }),
        ...(actorId === undefined ? {} : { actorId }),
      }));
    },
    async listEvents(recordId) {
      await ready();
      const result = await database.query<{
        at: Date | string; kind: string; record_id: string; detail: string | null; actor_id: string | null;
      }>(
        `SELECT occurred_at AS at, kind, record_id, detail, actor_id
         FROM practice_relay_record_events
         WHERE tenant_id = $1 AND record_id = $2 ORDER BY event_id`,
        [tenant, recordId],
      );
      return result.rows.map((row) => ({
        at: new Date(row.at).toISOString(),
        kind: row.kind,
        recordId: row.record_id,
        ...(row.detail === null ? {} : { detail: row.detail }),
        ...(row.actor_id === null ? {} : { actorId: row.actor_id }),
      }));
    },
    async listAllEvents() {
      await ready();
      const result = await database.query<{
        at: Date | string; kind: string; record_id: string; detail: string | null; actor_id: string | null;
      }>(
        `SELECT occurred_at AS at, kind, record_id, detail, actor_id
         FROM practice_relay_record_events
         WHERE tenant_id = $1 ORDER BY event_id`,
        [tenant],
      );
      return result.rows.map((row) => ({
        at: new Date(row.at).toISOString(),
        kind: row.kind,
        recordId: row.record_id,
        ...(row.detail === null ? {} : { detail: row.detail }),
        ...(row.actor_id === null ? {} : { actorId: row.actor_id }),
      }));
    },
    async backup() { throw new UnsupportedRecordStoreOperationError("backup"); },
    async listBackups() { throw new UnsupportedRecordStoreOperationError("listBackups"); },
    async restoreFromBackup() { throw new UnsupportedRecordStoreOperationError("restore"); },
    async healthMetrics() {
      await ready();
      const result = await database.query<{ record_count: string; audit_event_count: string }>(
        `SELECT record_count, audit_event_count
         FROM practice_relay_record_store_counters WHERE tenant_id = $1`,
        [tenant],
      );
      const counters = result.rows[0];
      return {
        recordCount: Number(counters?.record_count ?? 0),
        auditEventCount: Number(counters?.audit_event_count ?? 0),
        rootDir: `postgres:${tenant}`,
        durable: true,
        tenantId: options.tenantId,
        backend: "postgres",
      };
    },
    async checkHealth() {
      await ready();
      await database.checkHealth();
      await database.query(
        `SELECT record_count FROM practice_relay_record_store_counters
         WHERE tenant_id = $1`,
        [tenant],
      );
    },
    async close() {},
  };
  return store;
}
