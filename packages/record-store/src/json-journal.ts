/** Idempotent write-ahead journal for JSON point mutations and audit appends. */
import { randomUUID } from "node:crypto";
import path from "node:path";
import { parseWorkRecord, type WorkRecord } from "@practice-relay/work-record";
import type { RecordEvent, StoreHealthMetrics } from "./types.js";
import {
  appendPrivateFile,
  eventsPath,
  readRegularFile,
  readRegularFileTail,
  recordPath,
  regularFileExists,
  regularFileSize,
  removeRegularFile,
  safePathSegment,
  writePrivateFileAtomic,
} from "./store-paths.js";

/** Persisted point-operation gauges, updated in the mutation journal. */
export type JsonStoreCounters = Pick<StoreHealthMetrics, "recordCount" | "auditEventCount">;

type StoredEvent = RecordEvent & { readonly operationId: string };
type PendingMutation = {
  readonly version: 1;
  readonly operationId: string;
  readonly recordId: string;
  readonly nextRecord?: WorkRecord | null;
  readonly event: StoredEvent;
  readonly counters: JsonStoreCounters;
  readonly eventLogLength: number;
  readonly auditLogLength: number;
};

/** Canonical mutation and audit effects committed by one journal intent. */
export type JsonMutation = {
  readonly operationId?: string;
  readonly recordId: string;
  readonly nextRecord?: WorkRecord | null;
  readonly event: RecordEvent;
  readonly counters: JsonStoreCounters;
};

const pendingPath = (root: string): string => path.join(root, "journal", "pending.json");
const countersPath = (root: string): string => path.join(root, "journal", "counters.json");

function parseCounters(bytes: Buffer): JsonStoreCounters {
  const value = JSON.parse(bytes.toString("utf8")) as Partial<JsonStoreCounters>;
  if (
    !Number.isSafeInteger(value.recordCount) || value.recordCount! < 0 ||
    !Number.isSafeInteger(value.auditEventCount) || value.auditEventCount! < 0
  ) throw new Error("invalid JSON record-store counters");
  return value as JsonStoreCounters;
}

function parsePending(bytes: Buffer): PendingMutation {
  const value = JSON.parse(bytes.toString("utf8")) as Partial<PendingMutation>;
  if (
    value.version !== 1 || typeof value.operationId !== "string" ||
    typeof value.recordId !== "string" || value.event?.operationId !== value.operationId ||
    value.event.recordId !== value.recordId || !value.counters ||
    !Number.isSafeInteger(value.eventLogLength) || value.eventLogLength! < 0 ||
    !Number.isSafeInteger(value.auditLogLength) || value.auditLogLength! < 0
  ) throw new Error("invalid JSON record-store pending journal");
  safePathSegment(value.recordId);
  parseCounters(Buffer.from(JSON.stringify(value.counters)));
  if (value.nextRecord !== undefined && value.nextRecord !== null) {
    const record = parseWorkRecord(value.nextRecord);
    if (record.id !== value.recordId) throw new Error("invalid JSON journal record id");
  }
  return value as PendingMutation;
}

function ensureEvent(filePath: string, beforeLength: number, event: StoredEvent): void {
  const line = Buffer.from(`${JSON.stringify(event)}\n`, "utf8");
  const currentLength = regularFileExists(filePath) ? regularFileSize(filePath) : 0;
  if (currentLength >= line.length && readRegularFileTail(filePath, line.length).equals(line)) return;
  const written = currentLength - beforeLength;
  if (written < 0 || written > line.length) throw new Error(`JSON journal log length conflict: ${filePath}`);
  if (written > 0) {
    const suffix = readRegularFileTail(filePath, written);
    if (!line.subarray(0, written).equals(suffix)) throw new Error(`JSON journal log content conflict: ${filePath}`);
  }
  if (written < line.length) appendPrivateFile(filePath, line.subarray(written));
}

function applyMutation(root: string, pending: PendingMutation): void {
  if (pending.nextRecord === null) {
    const target = recordPath(root, pending.recordId);
    if (regularFileExists(target)) removeRegularFile(target);
  } else if (pending.nextRecord !== undefined) {
    const record = parseWorkRecord(pending.nextRecord);
    writePrivateFileAtomic(recordPath(root, record.id), JSON.stringify(record, null, 2));
  }
  ensureEvent(eventsPath(root, pending.recordId), pending.eventLogLength, pending.event);
  ensureEvent(path.join(root, "audit", "audit.jsonl"), pending.auditLogLength, pending.event);
  writePrivateFileAtomic(countersPath(root), JSON.stringify(pending.counters));
}

/** Read maintained counters without scanning records or the audit stream. */
export function readJsonCounters(root: string): JsonStoreCounters {
  return parseCounters(readRegularFile(countersPath(root)));
}

/** Initialize counters once for a pre-journal JSON store. */
export function initializeJsonCounters(root: string, counters: JsonStoreCounters): void {
  if (regularFileExists(countersPath(root))) return;
  writePrivateFileAtomic(countersPath(root), JSON.stringify(counters));
}

/** Complete an interrupted mutation idempotently before serving another operation. */
export function recoverJsonMutation(root: string): void {
  const filePath = pendingPath(root);
  if (!regularFileExists(filePath)) return;
  const pending = parsePending(readRegularFile(filePath));
  applyMutation(root, pending);
  removeRegularFile(filePath);
}

/** Persist one journal intent before applying all point mutation effects. */
export function commitJsonMutation(root: string, mutation: JsonMutation): void {
  recoverJsonMutation(root);
  const operationId = mutation.operationId ?? randomUUID();
  const pending: PendingMutation = {
    version: 1,
    operationId,
    recordId: mutation.recordId,
    ...(mutation.nextRecord === undefined ? {} : { nextRecord: mutation.nextRecord }),
    event: { ...mutation.event, operationId },
    counters: mutation.counters,
    eventLogLength: regularFileExists(eventsPath(root, mutation.recordId))
      ? regularFileSize(eventsPath(root, mutation.recordId)) : 0,
    auditLogLength: regularFileExists(path.join(root, "audit", "audit.jsonl"))
      ? regularFileSize(path.join(root, "audit", "audit.jsonl")) : 0,
  };
  const filePath = pendingPath(root);
  writePrivateFileAtomic(filePath, JSON.stringify(pending));
  applyMutation(root, pending);
  removeRegularFile(filePath);
}
