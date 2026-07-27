/**
 * Atomic JSON-backed record store with audit, backup, and corruption checks.
 *
 * Why: the lab's durable backend centralizes persistence and recovery safety semantics.
 */
import { appendFileSync, chmodSync, copyFileSync, existsSync, lstatSync, readdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import type { WorkRecord } from "@practice-relay/work-record-core";
import type { DurableStoreOptions, RecordStoreAdapter, RecordEvent, BackupManifest, StoreHealthMetrics } from "./types.js";
import { withNextRecordRevision } from "./record-revision.js";
import { ensureDir, eventsPath, parseBackupManifest, resolveTenantRoot, safePathSegment, recordPath, validateJsonLines } from "./store-safety.js";

const PRIVATE_FILE_MODE = 0o600;

const copyPrivateFile = (source: string, destination: string): void => {
  copyFileSync(source, destination);
  chmodSync(destination, PRIVATE_FILE_MODE);
};

const recordIdMatchesFilename = (recordId: string, expectedId: string): boolean => {
  return safePathSegment(recordId) === recordId && recordId === expectedId;
};

const hasRecordIdentity = (record: WorkRecord, expectedId: string): boolean => {
  return typeof record.id === "string" && recordIdMatchesFilename(record.id, expectedId);
};

const hasRecordTextAndSpine = (record: WorkRecord): boolean => {
  return (
    typeof record.title === "string" &&
    Boolean(record.spine) &&
    typeof record.spine === "object"
  );
};

const hasRecordCollections = (record: WorkRecord): boolean => {
  return [
    record.members,
    record.tracks,
    record.takeIds,
    record.takes,
    record.comments,
    record.versions,
    record.usePolicySnapshots,
  ].every(Array.isArray);
};

const hasValidRecordRevision = (record: WorkRecord): boolean => {
  return (
    record.revision === undefined ||
    (Number.isSafeInteger(record.revision) && record.revision >= 0)
  );
};

const isValidRecord = (record: WorkRecord, expectedId: string): boolean => {
  return (
    Boolean(record) &&
    typeof record === "object" &&
    hasRecordIdentity(record, expectedId) &&
    hasRecordTextAndSpine(record) &&
    hasRecordCollections(record) &&
    hasValidRecordRevision(record)
  );
};

/** Create an atomic, tenant-scoped JSON record store with backup and audit support. */
export function createDurableRecordStore(
  opts: DurableStoreOptions,
): RecordStoreAdapter {
  const tenantId = opts.tenantId;
  const root = resolveTenantRoot(opts.rootDir, tenantId);
  ensureDir(path.join(root, "records"));
  ensureDir(path.join(root, "events"));
  ensureDir(path.join(root, "audit"));

  const cache = new Map<string, WorkRecord>();

  function readRecordFile(
    filePath: string,
    expectedId = path.basename(filePath, ".json"),
  ): WorkRecord {
    try {
      const record = JSON.parse(readFileSync(filePath, "utf8")) as WorkRecord;
      if (!isValidRecord(record, expectedId)) {
        throw new Error("malformed record or filename/id mismatch");
      }
      return record;
    } catch (err) {
      throw new Error(
        `invalid record file ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  function loadAll(): void {
    cache.clear();
    const dir = path.join(root, "records");
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;
      const record = readRecordFile(path.join(dir, name));
      cache.set(record.id, record);
    }
  }

  function forceReload(): void {
    cache.clear();
    loadAll();
  }

  function persist(record: WorkRecord): void {
    const target = recordPath(root, record.id);
    const temporary = `${target}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(record, null, 2), {
        encoding: "utf8",
        mode: PRIVATE_FILE_MODE,
      });
      renameSync(temporary, target);
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
    cache.set(record.id, record);
  }

  const store: RecordStoreAdapter = {
    rootDir: root,
    tenantId,
    backend: "json",
    create(record: WorkRecord): WorkRecord {
      loadAll();
      if (cache.has(record.id) || existsSync(recordPath(root, record.id))) {
        throw new Error(`record ${record.id} already exists`);
      }
      const withRev = {
        ...record,
        revision: 0,
      } as WorkRecord;
      persist(withRev);
      this.appendEvent(record.id, "create");
      return withRev;
    },
    get(id: string): WorkRecord | undefined {
      const fp = recordPath(root, id);
      if (!existsSync(fp)) {
        cache.delete(id);
        return undefined;
      }
      const record = readRecordFile(fp);
      cache.set(id, record);
      return record;
    },
    list(): WorkRecord[] {
      loadAll();
      return [...cache.values()];
    },
    update(id: string, record: WorkRecord): WorkRecord {
      loadAll();
      const prev = this.get(id);
      if (!prev) throw new Error(`record ${id} not found`);
      const next = withNextRecordRevision(id, prev, record);
      persist(next);
      this.appendEvent(id, "update");
      return next;
    },
    delete(id: string): boolean {
      loadAll();
      const existed = cache.has(id) || existsSync(recordPath(root, id));
      cache.delete(id);
      const fp = recordPath(root, id);
      if (existsSync(fp)) unlinkSync(fp);
      this.appendEvent(id, "delete");
      return existed;
    },
    listByMember(userId: string): WorkRecord[] {
      return this.list().filter((s) =>
        (s.members ?? []).some((m) => m.userId === userId),
      );
    },
    appendEvent(
      recordId: string,
      kind: string,
      detail?: string,
      actorId?: string,
    ): void {
      ensureDir(path.join(root, "events"));
      ensureDir(path.join(root, "audit"));
      const ev: RecordEvent = {
        at: new Date().toISOString(),
        kind,
        recordId,
        detail,
        actorId,
      };
      appendFileSync(eventsPath(root, recordId), JSON.stringify(ev) + "\n", {
        encoding: "utf8",
        mode: PRIVATE_FILE_MODE,
      });
      // Global append-only audit stream (ops / compliance)
      appendFileSync(
        path.join(root, "audit", "audit.jsonl"),
        JSON.stringify(ev) + "\n",
        { encoding: "utf8", mode: PRIVATE_FILE_MODE },
      );
    },
    listEvents(recordId: string): RecordEvent[] {
      const fp = eventsPath(root, recordId);
      if (!existsSync(fp)) return [];
      return readFileSync(fp, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as RecordEvent);
    },
    listAllEvents(): RecordEvent[] {
      const fp = path.join(root, "audit", "audit.jsonl");
      if (!existsSync(fp)) return [];
      return readFileSync(fp, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as RecordEvent);
    },
    backup(backupRoot?: string): BackupManifest {
      const records = this.list();
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const defaultDestination = path.join(
        root,
        "backups",
        `${stamp}-${randomBytes(4).toString("hex")}`,
      );
      const dest = path.resolve(
        backupRoot ?? defaultDestination,
      );
      ensureDir(path.join(dest, "records"));
      ensureDir(path.join(dest, "events"));
      for (const s of records) {
        const src = recordPath(root, s.id);
        if (existsSync(src)) {
          copyPrivateFile(src, path.join(dest, "records", path.basename(src)));
        }
        const ev = eventsPath(root, s.id);
        if (existsSync(ev)) {
          copyPrivateFile(ev, path.join(dest, "events", path.basename(ev)));
        }
      }
      const auditSrc = path.join(root, "audit", "audit.jsonl");
      if (existsSync(auditSrc)) {
        ensureDir(path.join(dest, "audit"));
        copyPrivateFile(auditSrc, path.join(dest, "audit", "audit.jsonl"));
      }
      const manifest: BackupManifest = {
        createdAt: new Date().toISOString(),
        rootDir: root,
        recordCount: records.length,
        recordIds: records.map((s) => s.id),
        backupDir: dest,
        tenantId,
      };
      writeFileSync(
        path.join(dest, "backup-manifest.json"),
        JSON.stringify(manifest, null, 2),
        { encoding: "utf8", mode: PRIVATE_FILE_MODE },
      );
      this.appendEvent("_system", "backup", dest);
      return manifest;
    },
    listBackups(backupRoot?: string): BackupManifest[] {
      const base = path.resolve(backupRoot ?? path.join(root, "backups"));
      const out: BackupManifest[] = [];
      const direct = path.join(base, "backup-manifest.json");
      if (existsSync(direct)) {
        out.push(parseBackupManifest(readFileSync(direct, "utf8"), direct));
        return out;
      }
      if (!existsSync(base)) return [];
      for (const name of readdirSync(base)) {
        const manPath = path.join(base, name, "backup-manifest.json");
        if (!existsSync(manPath)) continue;
        out.push(
          parseBackupManifest(readFileSync(manPath, "utf8"), manPath),
        );
      }
      out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return out;
    },
    restoreFromBackup(backupDir: string): BackupManifest {
      const src = path.resolve(backupDir);
      const manPath = path.join(src, "backup-manifest.json");
      if (!existsSync(manPath)) {
        throw new Error(`backup manifest not found: ${manPath}`);
      }
      const manifest = parseBackupManifest(
        readFileSync(manPath, "utf8"),
        manPath,
      );
      const recordCopies: Array<{ name: string; bytes: Buffer }> = [];
      const eventCopies: Array<{ name: string; bytes: Buffer }> = [];
      let auditBytes: Buffer | undefined;

      const recordsDir = path.join(src, "records");
      if (existsSync(recordsDir)) {
        for (const name of readdirSync(recordsDir)) {
          if (!name.endsWith(".json")) {
            throw new Error(`unexpected backup record entry: ${name}`);
          }
          const filePath = path.join(recordsDir, name);
          if (!lstatSync(filePath).isFile()) {
            throw new Error(`backup record entry is not a regular file: ${name}`);
          }
          readRecordFile(filePath, path.basename(name, ".json"));
          recordCopies.push({ name, bytes: readFileSync(filePath) });
        }
      }
      const copiedRecordIds = recordCopies
        .map(({ name }) => path.basename(name, ".json"))
        .sort();
      const manifestRecordIds = [...manifest.recordIds].sort();
      if (JSON.stringify(copiedRecordIds) !== JSON.stringify(manifestRecordIds)) {
        throw new Error("backup record files do not match the manifest");
      }

      const eventsDir = path.join(src, "events");
      if (existsSync(eventsDir)) {
        for (const name of readdirSync(eventsDir)) {
          if (!name.endsWith(".jsonl")) {
            throw new Error(`unexpected backup event entry: ${name}`);
          }
          safePathSegment(path.basename(name, ".jsonl"));
          const filePath = path.join(eventsDir, name);
          if (!lstatSync(filePath).isFile()) {
            throw new Error(`backup event entry is not a regular file: ${name}`);
          }
          const bytes = readFileSync(filePath);
          validateJsonLines(bytes.toString("utf8"), filePath);
          eventCopies.push({ name, bytes });
        }
      }
      const auditSrc = path.join(src, "audit", "audit.jsonl");
      if (existsSync(auditSrc)) {
        if (!lstatSync(auditSrc).isFile()) {
          throw new Error("backup audit entry is not a regular file");
        }
        auditBytes = readFileSync(auditSrc);
        validateJsonLines(auditBytes.toString("utf8"), auditSrc);
      }
      for (const managedDir of ["records", "events", "audit"]) {
        rmSync(path.join(root, managedDir), { recursive: true, force: true });
      }
      ensureDir(path.join(root, "records"));
      ensureDir(path.join(root, "events"));
      ensureDir(path.join(root, "audit"));

      for (const { name, bytes } of recordCopies) {
        writeFileSync(path.join(root, "records", name), bytes, {
          mode: PRIVATE_FILE_MODE,
        });
      }
      for (const { name, bytes } of eventCopies) {
        writeFileSync(path.join(root, "events", name), bytes, {
          mode: PRIVATE_FILE_MODE,
        });
      }
      if (auditBytes) {
        writeFileSync(path.join(root, "audit", "audit.jsonl"), auditBytes, {
          mode: PRIVATE_FILE_MODE,
        });
      }

      forceReload();
      this.appendEvent("_system", "restore", src);
      return {
        ...manifest,
        rootDir: root,
        tenantId,
        recordCount: this.list().length,
        recordIds: this.list().map((s) => s.id),
      };
    },
    healthMetrics(): StoreHealthMetrics {
      const records = this.list();
      const events = this.listAllEvents();
      return {
        recordCount: records.length,
        auditEventCount: events.length,
        rootDir: root,
        durable: true,
        tenantId,
        backend: "json",
      };
    },
  };

  return store;
}
