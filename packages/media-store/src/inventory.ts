/** Read-only validation and transactional import of legacy filesystem media metadata. */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import type { Database } from "@practice-relay/database";
import { assertSafeStorageKey, isWithinRoot, parseMediaMeta } from "./media-safety.js";
import { DEFAULT_MAX_MEDIA_OBJECT_BYTES, DEFAULT_MAX_MEDIA_RECORD_BYTES, MediaIntegrityError, type MediaBlobMeta } from "./types.js";

/** One verified legacy object and its migration lifecycle state. */
export interface MediaInventoryEntry extends MediaBlobMeta {
  readonly state: "attached" | "cleanup_pending";
}
/** Versioned complete legacy media inventory. */
export interface MediaInventory {
  readonly version: 1;
  readonly entries: readonly MediaInventoryEntry[];
}

async function hashFile(filePath: string): Promise<{ byteSize: number; sha256: string }> {
  const digest = createHash("sha256");
  let byteSize = 0;
  for await (const chunk of createReadStream(filePath)) {
    const bytes = chunk as Buffer;
    byteSize += bytes.byteLength;
    if (byteSize > DEFAULT_MAX_MEDIA_OBJECT_BYTES) throw new Error("inventory media object exceeds 200 MiB");
    digest.update(bytes);
  }
  return { byteSize, sha256: digest.digest("hex") };
}

/** Validate inventory identity, uniqueness, and object and record quotas. */
export function validateMediaInventory(value: unknown): MediaInventory {
  if (!value || typeof value !== "object" || (value as { version?: unknown }).version !== 1 || !Array.isArray((value as { entries?: unknown }).entries)) throw new Error("invalid media inventory");
  const seen = new Set<string>();
  const totals = new Map<string, number>();
  const entries = (value as { entries: unknown[] }).entries.map((item): MediaInventoryEntry => {
    const parsed = parseMediaMeta(JSON.stringify(item));
    const state = (item as { state?: unknown }).state;
    if (!parsed || (state !== "attached" && state !== "cleanup_pending")) throw new Error("invalid media inventory entry");
    assertSafeStorageKey(parsed.storageKey);
    if (seen.has(parsed.storageKey)) throw new Error("duplicate media inventory storage key");
    seen.add(parsed.storageKey);
    if (!Number.isSafeInteger(parsed.byteSize) || parsed.byteSize > DEFAULT_MAX_MEDIA_OBJECT_BYTES) throw new Error("inventory media object exceeds 200 MiB");
    const next = (totals.get(parsed.recordId) ?? 0) + parsed.byteSize;
    if (next > DEFAULT_MAX_MEDIA_RECORD_BYTES) throw new Error("inventory record media exceeds 1 GiB");
    totals.set(parsed.recordId, next);
    return { ...parsed, state, cleanupPending: state === "cleanup_pending" };
  });
  return { version: 1, entries };
}

/** Scan and hash existing sidecar metadata without changing the source tree. */
export async function scanFilesystemMediaInventory(
  rootDir: string,
  options: { knownStorageKeys?: ReadonlySet<string> } = {},
): Promise<MediaInventory> {
  const root = await realpath(path.resolve(rootDir));
  const entries: MediaInventoryEntry[] = [];
  for (const recordDir of await readdir(root, { withFileTypes: true })) {
    if (recordDir.name === ".staging" && recordDir.isDirectory() && !recordDir.isSymbolicLink()) continue;
    if (recordDir.name === "__media-state.json" && recordDir.isFile() && !recordDir.isSymbolicLink()) continue;
    if (recordDir.name.startsWith(".")) throw new Error(`unsupported media inventory entry: ${recordDir.name}`);
    if (!recordDir.isDirectory() || recordDir.isSymbolicLink()) throw new Error(`unsupported media inventory entry: ${recordDir.name}`);
    const directory = path.join(root, recordDir.name);
    const files = await readdir(directory, { withFileTypes: true });
    const names = new Set(files.map((file) => file.name));
    for (const file of files) {
      if (!file.isFile() || file.isSymbolicLink()) throw new Error(`unsupported media inventory entry: ${recordDir.name}/${file.name}`);
      if (!file.name.endsWith(".meta.json")) {
        const storageKey = `${recordDir.name}/${file.name}`;
        const hasSidecar = names.has(`${file.name}.meta.json`);
        if (!hasSidecar && !options.knownStorageKeys?.has(storageKey)) {
          throw new Error(`media object has no metadata: ${storageKey}`);
        }
        continue;
      }
      const storageKey = `${recordDir.name}/${file.name.slice(0, -".meta.json".length)}`;
      assertSafeStorageKey(storageKey);
      const metaPath = path.join(directory, file.name);
      const blobPath = path.join(root, storageKey);
      if (!isWithinRoot(root, blobPath)) throw new Error("inventory path escapes media root");
      const [metaStat, blobStat] = await Promise.all([lstat(metaPath), lstat(blobPath)]);
      if (!metaStat.isFile() || metaStat.isSymbolicLink() || !blobStat.isFile() || blobStat.isSymbolicLink()) throw new Error("inventory media paths must be regular files");
      const parsed = parseMediaMeta(await readFile(metaPath, "utf8"), storageKey);
      if (!parsed) throw new Error(`invalid media metadata: ${storageKey}`);
      if (parsed.recordId !== recordDir.name) throw new Error(`media metadata record mismatch: ${storageKey}`);
      const actual = await hashFile(blobPath);
      if (actual.byteSize !== parsed.byteSize) throw new MediaIntegrityError("byteSize");
      if (actual.sha256 !== parsed.sha256) throw new MediaIntegrityError("sha256");
      entries.push({ ...parsed, state: parsed.deletedAt ? "cleanup_pending" : "attached", cleanupPending: Boolean(parsed.deletedAt) });
    }
  }
  return validateMediaInventory({ version: 1, entries });
}

/** Import validated metadata using the caller's transaction-bound database. */
export async function importMediaInventory(options: { database: Database; inventory: MediaInventory; tenantId?: string }): Promise<number> {
  const inventory = validateMediaInventory(options.inventory);
  const tenant = options.tenantId ?? "default";
  let imported = 0;
  for (const entry of inventory.entries) {
    const result = await options.database.query(`INSERT INTO practice_relay_media_objects
      (tenant_id,storage_key,record_id,take_id,content_type,original_name,byte_size,sha256,state,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (tenant_id,storage_key) DO NOTHING`,
      [tenant,entry.storageKey,entry.recordId,entry.takeId,entry.contentType,entry.originalName ?? null,entry.byteSize,entry.sha256,entry.state,entry.createdAt]);
    if (result.rowCount === 1) imported += 1;
    else {
      const existing = await options.database.query<{ record_id:string;take_id:string;byte_size:string;sha256:string }>("SELECT record_id,take_id,byte_size::text,sha256 FROM practice_relay_media_objects WHERE tenant_id=$1 AND storage_key=$2",[tenant,entry.storageKey]);
      const row = existing.rows[0];
      if (!row || row.record_id !== entry.recordId || row.take_id !== entry.takeId || Number(row.byte_size) !== entry.byteSize || row.sha256 !== entry.sha256) throw new Error(`conflicting media inventory entry: ${entry.storageKey}`);
    }
    if (entry.state === "cleanup_pending") await options.database.query(`INSERT INTO practice_relay_media_cleanup_jobs
      (tenant_id,storage_key,record_id,take_id,content_type,byte_size,sha256,ready_at) VALUES ($1,$2,$3,$4,$5,$6,$7,clock_timestamp()) ON CONFLICT DO NOTHING`,
      [tenant,entry.storageKey,entry.recordId,entry.takeId,entry.contentType,entry.byteSize,entry.sha256]);
  }
  return imported;
}

/** Import a caller-verified snapshot inside the caller's record migration transaction. */
export async function importMediaSnapshot(
  database: Database,
  options: { tenantId?: string; items: readonly MediaBlobMeta[]; dryRun: boolean },
): Promise<{ validated: number; imported: number; existing: number }> {
  const inventory = validateMediaInventory({ version: 1, entries: options.items.map((item) => ({
    ...item,
    state: item.cleanupPending || item.deletedAt ? "cleanup_pending" : "attached",
  })) });
  const tenant = options.tenantId ?? "default";
  await database.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    `practice-relay:media-import:${tenant}`,
  ]);
  const destination = await database.query<{ count: string }>(`SELECT (
    (SELECT count(*) FROM practice_relay_media_objects WHERE tenant_id=$1) +
    (SELECT count(*) FROM practice_relay_media_uploads WHERE tenant_id=$1) +
    (SELECT count(*) FROM practice_relay_media_cleanup_jobs WHERE tenant_id=$1)
  )::text AS count`, [tenant]);
  if (Number(destination.rows[0]?.count ?? 0) !== 0) {
    throw new Error("media snapshot destination namespace is not empty");
  }
  let imported = 0;
  for (const entry of inventory.entries) {
    if (!options.dryRun) {
      await database.query(`INSERT INTO practice_relay_media_objects
        (tenant_id,storage_key,record_id,take_id,content_type,original_name,byte_size,sha256,state,created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [tenant,entry.storageKey,entry.recordId,entry.takeId,entry.contentType,entry.originalName ?? null,entry.byteSize,entry.sha256,entry.state,entry.createdAt]);
      if (entry.state === "cleanup_pending") await database.query(`INSERT INTO practice_relay_media_cleanup_jobs
        (tenant_id,storage_key,record_id,take_id,content_type,byte_size,sha256,ready_at) VALUES ($1,$2,$3,$4,$5,$6,$7,clock_timestamp())`,
        [tenant,entry.storageKey,entry.recordId,entry.takeId,entry.contentType,entry.byteSize,entry.sha256]);
    }
    imported += 1;
  }
  return { validated: inventory.entries.length, imported, existing: 0 };
}
