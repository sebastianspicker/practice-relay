/** Validated staging and crash-recoverable directory swap for JSON backups. */
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { BackupManifest, RecordEvent } from "./types.js";
import { commitJsonMutation } from "./json-journal.js";
import {
  copyPrivateRegularFile,
  ensureDir,
  listManagedDirectory,
  managedDirectoryExists,
  moveManagedDirectory,
  readRegularFile,
  regularFileExists,
  removeManagedDirectory,
  removeRegularFile,
  safePathSegment,
  writePrivateFileAtomic,
} from "./store-paths.js";

type RestoreMarker = {
  readonly version: 1;
  readonly stageName: string;
  readonly operationId: string;
  readonly source: string;
  readonly recordIds: string[];
  readonly auditEventCount: number;
  readonly event: RecordEvent;
};

/** Validated backup inputs and record/event parsers supplied by the JSON adapter. */
export type JsonRestoreSupport = {
  readonly root: string;
  readonly backupDir: string;
  readonly parseManifest: (source: string) => BackupManifest;
  readonly validateRecord: (bytes: Buffer, filePath: string, id: string) => void;
  readonly validateEvents: (contents: string, filePath: string) => void;
};

const markerPath = (root: string): string => path.join(root, "journal", "restore.json");

function eventLines(contents: string): string[] {
  return contents.split("\n").filter(Boolean).map((line) => JSON.stringify(JSON.parse(line)));
}

function assertEventAgreement(perRecord: string[], audit: string[]): void {
  const counts = (lines: string[]): Map<string, number> => {
    const result = new Map<string, number>();
    for (const line of lines) result.set(line, (result.get(line) ?? 0) + 1);
    return result;
  };
  const left = counts(perRecord);
  const right = counts(audit);
  if (left.size !== right.size) throw new Error("backup event files do not match the audit stream");
  for (const [line, count] of left) {
    if (right.get(line) !== count) throw new Error("backup event files do not match the audit stream");
  }
}

function parseMarker(bytes: Buffer): RestoreMarker {
  const marker = JSON.parse(bytes.toString("utf8")) as Partial<RestoreMarker>;
  if (
    marker.version !== 1 || typeof marker.stageName !== "string" ||
    typeof marker.operationId !== "string" || typeof marker.source !== "string" ||
    !Array.isArray(marker.recordIds) || !Number.isSafeInteger(marker.auditEventCount) ||
    !marker.event
  ) throw new Error("invalid JSON restore marker");
  safePathSegment(marker.stageName);
  for (const id of marker.recordIds) safePathSegment(id);
  return marker as RestoreMarker;
}

function installStagedDirectories(root: string, stage: string): void {
  for (const name of ["records", "events", "audit"] as const) {
    const live = path.join(root, name);
    const next = path.join(stage, `next-${name}`);
    const previous = path.join(stage, `previous-${name}`);
    if (managedDirectoryExists(next)) {
      if (managedDirectoryExists(live) && !managedDirectoryExists(previous)) {
        moveManagedDirectory(live, previous);
      }
      if (!managedDirectoryExists(live)) moveManagedDirectory(next, live);
    }
    if (!managedDirectoryExists(live)) throw new Error(`restore did not install ${name}`);
  }
}

/** Finish a marker-backed restore after interruption. */
export function recoverJsonRestore(root: string): RestoreMarker | undefined {
  const restoreMarkerPath = markerPath(root);
  if (!regularFileExists(restoreMarkerPath)) return undefined;
  const marker = parseMarker(readRegularFile(restoreMarkerPath));
  const stage = path.join(root, "journal", marker.stageName);
  if (managedDirectoryExists(stage)) installStagedDirectories(root, stage);
  commitJsonMutation(root, {
    operationId: marker.operationId,
    recordId: "_system",
    event: marker.event,
    counters: {
      recordCount: marker.recordIds.length,
      auditEventCount: marker.auditEventCount + 1,
    },
  });
  if (managedDirectoryExists(stage)) removeManagedDirectory(stage);
  removeRegularFile(restoreMarkerPath);
  return marker;
}

/** Validate a backup into a private stage, publish its marker, then recover it. */
export function restoreJsonBackup(support: JsonRestoreSupport): RestoreMarker {
  const { root } = support;
  const source = path.resolve(support.backupDir);
  const manifest = support.parseManifest(source);
  const stageName = `restore-${randomUUID()}`;
  const stage = path.join(root, "journal", stageName);
  ensureDir(stage);
  for (const name of ["records", "events", "audit"]) ensureDir(path.join(stage, `next-${name}`));
  try {
    const copiedIds: string[] = [];
    const perRecordEvents: string[] = [];
    const recordsSource = path.join(source, "records");
    if (managedDirectoryExists(recordsSource)) {
      for (const name of listManagedDirectory(recordsSource)) {
        if (!name.endsWith(".json")) throw new Error(`unexpected backup record entry: ${name}`);
        const id = path.basename(name, ".json");
        const filePath = path.join(recordsSource, name);
        const bytes = readRegularFile(filePath);
        support.validateRecord(bytes, filePath, id);
        writePrivateFileAtomic(path.join(stage, "next-records", name), bytes);
        copiedIds.push(id);
      }
    }
    copiedIds.sort();
    if (JSON.stringify(copiedIds) !== JSON.stringify([...manifest.recordIds].sort())) {
      throw new Error("backup record files do not match the manifest");
    }
    const eventsSource = path.join(source, "events");
    if (managedDirectoryExists(eventsSource)) {
      for (const name of listManagedDirectory(eventsSource)) {
        if (!name.endsWith(".jsonl")) throw new Error(`unexpected backup event entry: ${name}`);
        safePathSegment(path.basename(name, ".jsonl"));
        const filePath = path.join(eventsSource, name);
        const contents = readRegularFile(filePath).toString("utf8");
        support.validateEvents(contents, filePath);
        perRecordEvents.push(...eventLines(contents));
        copyPrivateRegularFile(filePath, path.join(stage, "next-events", name));
      }
    }
    const auditSource = path.join(source, "audit", "audit.jsonl");
    const auditContents = regularFileExists(auditSource) ? readRegularFile(auditSource).toString("utf8") : "";
    if (auditContents) {
      support.validateEvents(auditContents, auditSource);
      copyPrivateRegularFile(auditSource, path.join(stage, "next-audit", "audit.jsonl"));
    }
    const auditLines = eventLines(auditContents);
    assertEventAgreement(perRecordEvents, auditLines);
    const marker: RestoreMarker = {
      version: 1,
      stageName,
      operationId: randomUUID(),
      source,
      recordIds: copiedIds,
      auditEventCount: auditLines.length,
      event: { at: new Date().toISOString(), kind: "restore", recordId: "_system", detail: source },
    };
    writePrivateFileAtomic(markerPath(root), JSON.stringify(marker));
    return recoverJsonRestore(root)!;
  } catch (error) {
    if (!regularFileExists(markerPath(root)) && managedDirectoryExists(stage)) removeManagedDirectory(stage);
    throw error;
  }
}
