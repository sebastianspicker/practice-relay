/** In-memory asynchronous RecordStore adapter for single-process labs and tests. */
import { randomBytes } from "node:crypto";
import {
  parseWorkRecord,
  WorkRecordDuplicateError,
  type RecordMutationOptions,
  type WorkRecord,
} from "@practice-relay/work-record";
import type {
  BackupManifest,
  RecordEvent,
  RecordStoreAdapter,
  RecordSummaryPage,
  RecordSummaryQuery,
} from "./types.js";
import { RecordRevisionConflictError } from "./types.js";
import { parseNextRecord, parseWrittenRecord } from "./record-revision.js";
import { safePathSegment } from "./store-safety.js";

const copyRecord = (record: WorkRecord): WorkRecord => structuredClone(record);
const copyEvent = (event: RecordEvent): RecordEvent => ({ ...event });

function hasMember(record: WorkRecord, userId: string): boolean {
  return (record.members ?? []).some((member) => member.userId === userId);
}

function validateSummaryQuery(options: RecordSummaryQuery): void {
  if (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 100) {
    throw new Error("record summary limit must be an integer between 1 and 100");
  }
}

function summaries(
  records: Iterable<WorkRecord>,
  userId: string,
  options: RecordSummaryQuery,
): RecordSummaryPage {
  validateSummaryQuery(options);
  const title = options.title?.trim().toLocaleLowerCase();
  const candidates = [...records]
    .filter((record) => hasMember(record, userId))
    .filter((record) => options.after === undefined || record.id > options.after)
    .filter((record) => !title || record.title.toLocaleLowerCase().includes(title))
    .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  const page = candidates.slice(0, options.limit + 1);
  return {
    items: page.slice(0, options.limit).map((record) => ({
      id: record.id,
      title: record.title,
      revision: record.revision ?? 0,
    })),
    hasMore: page.length > options.limit,
  };
}

function snapshot(
  rootDir: string,
  tenantId: string | undefined,
  backupDir: string,
  records: Iterable<WorkRecord>,
): BackupManifest {
  const recordIds = [...records].map((record) => record.id);
  return {
    createdAt: new Date().toISOString(),
    rootDir,
    recordCount: recordIds.length,
    recordIds,
    backupDir,
    tenantId,
  };
}

function assertExpectedRevision(
  id: string,
  latest: WorkRecord,
  options: RecordMutationOptions | undefined,
): void {
  if (options?.expectedRevision === undefined) return;
  const revision = latest.revision ?? 0;
  if (options.expectedRevision !== revision) {
    throw new RecordRevisionConflictError(id, revision, options.expectedRevision);
  }
}

/** Create an isolated, non-durable asynchronous store. */
export function createMemoryRecordStore(opts?: { tenantId?: string }): RecordStoreAdapter {
  const tenantId = opts?.tenantId;
  if (tenantId !== undefined) safePathSegment(tenantId);
  const rootDir = tenantId === undefined ? ":memory:" : `:memory:${tenantId}`;
  const records = new Map<string, WorkRecord>();
  const eventsByRecord = new Map<string, RecordEvent[]>();
  const audit: RecordEvent[] = [];
  const backups: BackupManifest[] = [];

  const append = (recordId: string, kind: string, detail?: string, actorId?: string): void => {
    const event: RecordEvent = {
      at: new Date().toISOString(),
      kind,
      recordId,
      ...(detail === undefined ? {} : { detail }),
      ...(actorId === undefined ? {} : { actorId }),
    };
    const current = eventsByRecord.get(recordId) ?? [];
    current.push(event);
    eventsByRecord.set(recordId, current);
    audit.push(event);
  };

  const store: RecordStoreAdapter = {
    rootDir,
    tenantId,
    durable: false,
    backend: "memory",
    async create(record) {
      const canonical = parseWrittenRecord(record);
      if (records.has(canonical.id)) throw new WorkRecordDuplicateError(`record ${canonical.id} already exists`);
      const created = parseWorkRecord({ ...copyRecord(canonical), revision: 0 });
      records.set(created.id, copyRecord(created));
      append(created.id, "create");
      return copyRecord(created);
    },
    async get(id) {
      const record = records.get(id);
      return record === undefined ? undefined : copyRecord(record);
    },
    async readWithEvents(id, authorize) {
      const record = records.get(id);
      if (!record) return undefined;
      const detached = copyRecord(record);
      const result = authorize(detached) as unknown;
      if (result && typeof (result as { then?: unknown }).then === "function") {
        throw new Error("record authorization callback must be synchronous");
      }
      return {
        record: detached,
        events: (eventsByRecord.get(id) ?? []).map(copyEvent),
      };
    },
    async list() {
      return [...records.values()].map(copyRecord);
    },
    async update(id, record) {
      const canonical = parseWrittenRecord(record);
      return store.mutate(id, () => canonical, {
        expectedRevision: canonical.revision,
        kind: "update",
      });
    },
    async mutate(id, transition, options) {
      const latest = records.get(id);
      if (!latest) throw new Error(`record ${id} not found`);
      assertExpectedRevision(id, latest, options);
      const requested = transition(copyRecord(latest));
      if (requested && typeof (requested as { then?: unknown }).then === "function") {
        throw new Error("record transition must be synchronous");
      }
      const next = parseNextRecord(id, latest, requested);
      records.set(id, copyRecord(next));
      append(id, options?.kind ?? "update", options?.detail, options?.actorId);
      return copyRecord(next);
    },
    async delete(id) {
      const existed = records.delete(id);
      append(id, "delete");
      return existed;
    },
    async listByMember(userId) {
      return [...records.values()].filter((record) => hasMember(record, userId)).map(copyRecord);
    },
    async listSummariesByMember(userId, options) {
      return summaries(records.values(), userId, options);
    },
    async appendEvent(recordId, kind, detail, actorId) {
      append(recordId, kind, detail, actorId);
    },
    async listEvents(recordId) {
      return (eventsByRecord.get(recordId) ?? []).map(copyEvent);
    },
    async listAllEvents() {
      return audit.map(copyEvent);
    },
    async backup(backupRoot) {
      const stamp = new Date().toISOString().replace(/[:.]/gu, "-");
      const backupDir = backupRoot ?? `:memory-backup:${stamp}-${randomBytes(4).toString("hex")}`;
      const manifest = snapshot(rootDir, tenantId, backupDir, records.values());
      backups.push(manifest);
      append("_system", "backup", manifest.backupDir);
      return { ...manifest, recordIds: [...manifest.recordIds] };
    },
    async listBackups() {
      return backups.map((manifest) => ({ ...manifest, recordIds: [...manifest.recordIds] }));
    },
    async restoreFromBackup(backupDir) {
      append("_system", "restore", backupDir);
      return snapshot(rootDir, tenantId, backupDir, records.values());
    },
    async healthMetrics() {
      return {
        recordCount: records.size,
        auditEventCount: audit.length,
        rootDir,
        durable: false,
        tenantId,
        backend: "memory",
      };
    },
    async checkHealth() {},
    async close() {},
  };
  return store;
}
