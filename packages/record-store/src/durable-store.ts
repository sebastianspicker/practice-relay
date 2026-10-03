/** Atomic JSON-backed asynchronous store for single-process lab deployments. */
import { randomBytes } from "node:crypto";
import path from "node:path";
import {
  parseWorkRecord,
  WorkRecordDuplicateError,
  type RecordMutationOptions,
  type WorkRecord,
} from "@practice-relay/work-record";
import type {
  BackupManifest,
  DurableStoreOptions,
  RecordEvent,
  RecordStoreAdapter,
  RecordSummaryQuery,
  StoreHealthMetrics,
} from "./types.js";
import { RecordRevisionConflictError } from "./types.js";
import { parseNextRecord, parseWrittenRecord } from "./record-revision.js";
import { parseBackupManifest, validateJsonLines } from "./store-safety.js";
import {
  commitJsonMutation,
  initializeJsonCounters,
  readJsonCounters,
  recoverJsonMutation,
} from "./json-journal.js";
import { cleanJsonTemporaries } from "./json-temporaries.js";
import { recoverJsonRestore, restoreJsonBackup } from "./json-restore.js";
import {
  copyPrivateRegularFile,
  ensureDir,
  eventsPath,
  listManagedDirectory,
  managedDirectoryExists,
  readRegularFile,
  recordPath,
  regularFileExists,
  resolveTenantRoot,
  safePathSegment,
  writePrivateFileAtomic,
} from "./store-paths.js";

const recordIdMatchesFilename = (recordId: string, expectedId: string): boolean =>
  safePathSegment(recordId) === recordId && recordId === expectedId;

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

function validateSummaryQuery(options: RecordSummaryQuery): void {
  if (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 100) {
    throw new Error("record summary limit must be an integer between 1 and 100");
  }
}

/** Create an atomic, tenant-scoped JSON store. Individual CRUD reads only its record file. */
export function createDurableRecordStore(opts: DurableStoreOptions): RecordStoreAdapter {
  const tenantId = opts.tenantId;
  const configuredRoot = path.resolve(opts.rootDir);
  const root = resolveTenantRoot(opts.rootDir, tenantId);
  const ensureManagedLayout = (): void => {
    ensureDir(configuredRoot);
    ensureDir(root);
    ensureDir(path.join(root, "journal"));
    recoverJsonRestore(root);
    ensureDir(path.join(root, "records"));
    ensureDir(path.join(root, "events"));
    ensureDir(path.join(root, "audit"));
    ensureDir(path.join(root, "journal"));
  };
  ensureManagedLayout();

  const parseRecordBytes = (
    bytes: Buffer,
    filePath: string,
    expectedId = path.basename(filePath, ".json"),
  ): WorkRecord => {
    try {
      const record = parseWorkRecord(JSON.parse(bytes.toString("utf8")));
      if (!recordIdMatchesFilename(record.id, expectedId)) {
        throw new Error("record filename/id mismatch");
      }
      return record;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`invalid record file ${filePath}: ${detail}`);
    }
  };
  const readRecord = (id: string): WorkRecord | undefined => {
    const filePath = recordPath(root, id);
    return regularFileExists(filePath)
      ? parseRecordBytes(readRegularFile(filePath), filePath, id)
      : undefined;
  };
  const enumerateRecords = (): WorkRecord[] => {
    const directory = path.join(root, "records");
    return listManagedDirectory(directory)
      .filter((name) => name.endsWith(".json"))
      .map((name) => parseRecordBytes(readRegularFile(path.join(directory, name)), path.join(directory, name)));
  };
  const ensureReady = (): void => {
    ensureManagedLayout();
    recoverJsonMutation(root);
    recoverJsonRestore(root);
  };
  const append = (recordId: string, kind: string, detail?: string, actorId?: string): void => {
    ensureReady();
    const event: RecordEvent = {
      at: new Date().toISOString(),
      kind,
      recordId,
      ...(detail === undefined ? {} : { detail }),
      ...(actorId === undefined ? {} : { actorId }),
    };
    const counters = readJsonCounters(root);
    commitJsonMutation(root, {
      recordId,
      event,
      counters: { ...counters, auditEventCount: counters.auditEventCount + 1 },
    });
  };
  const readEvents = (filePath: string): RecordEvent[] => {
    if (!regularFileExists(filePath)) return [];
    const contents = readRegularFile(filePath).toString("utf8");
    validateJsonLines(contents, filePath);
    return contents.split("\n").filter(Boolean).map((line) => {
      const event = JSON.parse(line) as RecordEvent;
      return {
        at: event.at,
        kind: event.kind,
        recordId: event.recordId,
        ...(event.detail === undefined ? {} : { detail: event.detail }),
        ...(event.actorId === undefined ? {} : { actorId: event.actorId }),
      };
    });
  };

  const store: RecordStoreAdapter = {
    rootDir: root,
    tenantId,
    durable: true,
    backend: "json",
    async create(record) {
      ensureReady();
      const target = recordPath(root, record.id);
      const canonical = parseWrittenRecord(record);
      if (regularFileExists(target)) throw new WorkRecordDuplicateError(`record ${canonical.id} already exists`);
      const created = parseWorkRecord({ ...canonical, revision: 0 });
      const counters = readJsonCounters(root);
      commitJsonMutation(root, {
        recordId: created.id,
        nextRecord: created,
        event: { at: new Date().toISOString(), kind: "create", recordId: created.id },
        counters: {
          recordCount: counters.recordCount + 1,
          auditEventCount: counters.auditEventCount + 1,
        },
      });
      return structuredClone(created);
    },
    async get(id) {
      ensureReady();
      const record = readRecord(id);
      return record === undefined ? undefined : structuredClone(record);
    },
    async readWithEvents(id, authorize) {
      ensureReady();
      const record = readRecord(id);
      if (!record) return undefined;
      const detached = structuredClone(record);
      const result = authorize(detached) as unknown;
      if (result && typeof (result as { then?: unknown }).then === "function") {
        throw new Error("record authorization callback must be synchronous");
      }
      return { record: detached, events: readEvents(eventsPath(root, id)) };
    },
    async list() {
      ensureReady();
      return enumerateRecords().map((record) => structuredClone(record));
    },
    async update(id, record) {
      const canonical = parseWrittenRecord(record);
      return store.mutate(id, () => canonical, {
        expectedRevision: canonical.revision,
        kind: "update",
      });
    },
    async mutate(id, transition, options) {
      ensureReady();
      const latest = readRecord(id);
      if (!latest) throw new Error(`record ${id} not found`);
      assertExpectedRevision(id, latest, options);
      const requested = transition(structuredClone(latest));
      if (requested && typeof (requested as { then?: unknown }).then === "function") {
        throw new Error("record transition must be synchronous");
      }
      const next = parseNextRecord(id, latest, requested);
      const counters = readJsonCounters(root);
      commitJsonMutation(root, {
        recordId: id,
        nextRecord: next,
        event: {
          at: new Date().toISOString(),
          kind: options?.kind ?? "update",
          recordId: id,
          ...(options?.detail === undefined ? {} : { detail: options.detail }),
          ...(options?.actorId === undefined ? {} : { actorId: options.actorId }),
        },
        counters: { ...counters, auditEventCount: counters.auditEventCount + 1 },
      });
      return structuredClone(next);
    },
    async delete(id) {
      ensureReady();
      const target = recordPath(root, id);
      const existed = regularFileExists(target);
      const counters = readJsonCounters(root);
      commitJsonMutation(root, {
        recordId: id,
        nextRecord: null,
        event: { at: new Date().toISOString(), kind: "delete", recordId: id },
        counters: {
          recordCount: counters.recordCount - (existed ? 1 : 0),
          auditEventCount: counters.auditEventCount + 1,
        },
      });
      return existed;
    },
    async listByMember(userId) {
      ensureReady();
      return enumerateRecords()
        .filter((record) => record.members.some((member) => member.userId === userId))
        .map((record) => structuredClone(record));
    },
    async listSummariesByMember(userId, options) {
      ensureReady();
      validateSummaryQuery(options);
      const normalizedTitle = options.title?.trim().toLocaleLowerCase();
      const candidates = enumerateRecords()
        .filter((record) => record.members.some((member) => member.userId === userId))
        .filter((record) => options.after === undefined || record.id > options.after)
        .filter((record) => !normalizedTitle || record.title.toLocaleLowerCase().includes(normalizedTitle))
        .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
        .slice(0, options.limit + 1);
      return {
        items: candidates.slice(0, options.limit).map((record) => ({
          id: record.id,
          title: record.title,
          revision: record.revision ?? 0,
        })),
        hasMore: candidates.length > options.limit,
      };
    },
    async appendEvent(recordId, kind, detail, actorId) {
      append(recordId, kind, detail, actorId);
    },
    async listEvents(recordId) {
      ensureReady();
      return readEvents(eventsPath(root, recordId));
    },
    async listAllEvents() {
      ensureReady();
      return readEvents(path.join(root, "audit", "audit.jsonl"));
    },
    async backup(backupRoot) {
      ensureReady();
      const records = enumerateRecords();
      const stamp = new Date().toISOString().replace(/[:.]/gu, "-");
      const destination = path.resolve(backupRoot ?? path.join(
        root,
        "backups",
        `${stamp}-${randomBytes(4).toString("hex")}`,
      ));
      ensureDir(destination);
      ensureDir(path.join(destination, "records"));
      ensureDir(path.join(destination, "events"));
      for (const record of records) {
        const source = recordPath(root, record.id);
        copyPrivateRegularFile(source, path.join(destination, "records", path.basename(source)));
      }
      for (const name of listManagedDirectory(path.join(root, "events"))) {
        if (!name.endsWith(".jsonl")) throw new Error(`unexpected event entry: ${name}`);
        safePathSegment(path.basename(name, ".jsonl"));
        const eventSource = path.join(root, "events", name);
        validateJsonLines(readRegularFile(eventSource).toString("utf8"), eventSource);
        copyPrivateRegularFile(eventSource, path.join(destination, "events", name));
      }
      const auditSource = path.join(root, "audit", "audit.jsonl");
      if (regularFileExists(auditSource)) {
        ensureDir(path.join(destination, "audit"));
        copyPrivateRegularFile(auditSource, path.join(destination, "audit", "audit.jsonl"));
      }
      const manifest: BackupManifest = {
        createdAt: new Date().toISOString(),
        rootDir: root,
        recordCount: records.length,
        recordIds: records.map((record) => record.id),
        backupDir: destination,
        tenantId,
      };
      writePrivateFileAtomic(path.join(destination, "backup-manifest.json"), JSON.stringify(manifest, null, 2));
      append("_system", "backup", destination);
      return manifest;
    },
    async listBackups(backupRoot) {
      ensureReady();
      const base = path.resolve(backupRoot ?? path.join(root, "backups"));
      if (!managedDirectoryExists(base)) return [];
      const direct = path.join(base, "backup-manifest.json");
      if (regularFileExists(direct)) {
        return [parseBackupManifest(readRegularFile(direct).toString("utf8"), direct)];
      }
      const manifests = listManagedDirectory(base).flatMap((name) => {
        const directory = path.join(base, name);
        const manifestPath = path.join(directory, "backup-manifest.json");
        if (!managedDirectoryExists(directory) || !regularFileExists(manifestPath)) return [];
        return [parseBackupManifest(readRegularFile(manifestPath).toString("utf8"), manifestPath)];
      });
      return manifests.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    },
    async restoreFromBackup(backupDir) {
      ensureReady();
      const source = path.resolve(backupDir);
      const manifestPath = path.join(source, "backup-manifest.json");
      if (!regularFileExists(manifestPath)) throw new Error(`backup manifest not found: ${manifestPath}`);
      const manifest = parseBackupManifest(readRegularFile(manifestPath).toString("utf8"), manifestPath);
      const restored = restoreJsonBackup({
        root,
        backupDir: source,
        parseManifest: (directory) => {
          const filePath = path.join(directory, "backup-manifest.json");
          return parseBackupManifest(readRegularFile(filePath).toString("utf8"), filePath);
        },
        validateRecord: (bytes, filePath, id) => { parseRecordBytes(bytes, filePath, id); },
        validateEvents: validateJsonLines,
      });
      return {
        ...manifest,
        rootDir: root,
        tenantId,
        recordCount: restored.recordIds.length,
        recordIds: restored.recordIds,
      };
    },
    async healthMetrics(): Promise<StoreHealthMetrics> {
      ensureReady();
      const counters = readJsonCounters(root);
      return {
        recordCount: counters.recordCount,
        auditEventCount: counters.auditEventCount,
        rootDir: root,
        durable: true,
        tenantId,
        backend: "json",
      };
    },
    async checkHealth() {
      ensureReady();
      readJsonCounters(root);
    },
    async close() {},
  };
  recoverJsonMutation(root);
  recoverJsonRestore(root);
  cleanJsonTemporaries(root);
  initializeJsonCounters(root, {
    recordCount: enumerateRecords().length,
    auditEventCount: readEvents(path.join(root, "audit", "audit.jsonl")).length,
  });
  return store;
}
