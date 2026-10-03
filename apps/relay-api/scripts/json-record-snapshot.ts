/** Read-only, integrity-checked JSON source inventory for explicit offline migration. */
import { constants } from "node:fs";
import { lstat, open, readdir } from "node:fs/promises";
import path from "node:path";
import { parseWorkRecord, type WorkRecord } from "@practice-relay/work-record";
import type { RecordEvent } from "@practice-relay/record-store";

/** Read a private regular file without following a final symlink or sharing hardlinks. */
export async function readSnapshotFile(file: string): Promise<string> {
  const descriptor = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await descriptor.stat();
    if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0) throw new Error("snapshot files must be private regular files");
    return await descriptor.readFile("utf8");
  } finally { await descriptor.close(); }
}

async function directoryEntries(directory: string): Promise<string[]> {
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("snapshot directory must be a real directory");
  return (await readdir(directory)).sort();
}

function parseEvents(text: string): RecordEvent[] {
  return text.split("\n").filter(Boolean).map((line) => {
    const event = JSON.parse(line) as RecordEvent;
    const allowed = new Set(["at", "kind", "recordId", "detail", "actorId", "operationId"]);
    if (!event || typeof event !== "object" || Object.keys(event).some((key) => !allowed.has(key))) throw new Error("unsupported snapshot event field");
    if (typeof event.at !== "string" || !Number.isFinite(Date.parse(event.at)) || typeof event.recordId !== "string" || typeof event.kind !== "string" || event.kind.trim() === "" || (event.detail !== undefined && typeof event.detail !== "string") || (event.actorId !== undefined && typeof event.actorId !== "string")) throw new Error("invalid snapshot audit event");
    return event;
  });
}

/** Validate every record and both event representations without creating directories. */
export async function readJsonRecordSnapshot(root: string): Promise<{ records: WorkRecord[]; events: RecordEvent[] }> {
  const base = path.resolve(root);
  const rootEntries = await directoryEntries(base);
  if (rootEntries.includes("journal")) {
    const journals = await directoryEntries(path.join(base, "journal"));
    if (journals.includes("pending.json") || journals.includes("restore.json")) {
      throw new Error("snapshot contains unfinished JSON recovery; recover it before taking an offline snapshot");
    }
  }
  const records: WorkRecord[] = [];
  for (const name of await directoryEntries(path.join(base, "records"))) {
    if (!name.endsWith(".json")) throw new Error("unexpected snapshot record entry");
    const record = parseWorkRecord(JSON.parse(await readSnapshotFile(path.join(base, "records", name))));
    if (`${record.id}.json` !== name) throw new Error("snapshot record filename/id mismatch");
    records.push(record);
  }
  const auditDir = path.join(base, "audit");
  const auditFiles = await directoryEntries(auditDir);
  if (auditFiles.some((name) => name !== "audit.jsonl")) throw new Error("unexpected audit entry");
  const events = auditFiles.length ? parseEvents(await readSnapshotFile(path.join(auditDir, "audit.jsonl"))) : [];
  const copies: RecordEvent[] = [];
  for (const name of await directoryEntries(path.join(base, "events"))) {
    if (!name.endsWith(".jsonl")) throw new Error("unexpected event entry");
    const entries = parseEvents(await readSnapshotFile(path.join(base, "events", name)));
    if (entries.some((event) => `${event.recordId}.jsonl` !== name)) throw new Error("event filename/id mismatch");
    copies.push(...entries);
  }
  const canonical = (items: RecordEvent[]) => items.map((event) => JSON.stringify([event.at, event.recordId, event.kind, event.detail ?? null, event.actorId ?? null])).sort();
  if (JSON.stringify(canonical(events)) !== JSON.stringify(canonical(copies))) throw new Error("record event files and global audit disagree");
  return { records, events };
}
