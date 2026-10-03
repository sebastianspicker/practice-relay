/** Validate canonical media references and streamed destination bytes before offline import. */
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import type { WorkRecord } from "@practice-relay/work-record";
import { createS3CompatibleObjectStore, scanFilesystemMediaInventory, validateMediaInventory, type MediaBlobMeta } from "@practice-relay/media-store";
import { readSnapshotFile } from "./json-record-snapshot.js";

async function privateFilesystemStream(root: string, key: string): Promise<Readable> {
  const segments = key.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..") || key.includes("\\") || key.includes("\0")) throw new Error("unsafe inventory storage key");
  let directory = path.resolve(root);
  for (const segment of ["", ...segments.slice(0, -1)]) {
    directory = path.join(directory, segment);
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) throw new Error("media inventory requires private real directories");
  }
  const descriptor = await open(path.join(directory, segments.at(-1)!), constants.O_RDONLY | constants.O_NOFOLLOW);
  const stat = await descriptor.stat();
  if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0) {
    await descriptor.close(); throw new Error("media inventory requires private regular objects");
  }
  return descriptor.createReadStream();
}

function canonicalReferences(records: readonly WorkRecord[], items: readonly MediaBlobMeta[]): void {
  const referenced = new Set<string>();
  const byKey = new Map(items.map((meta) => [meta.storageKey, meta]));
  for (const record of records) {
    for (const take of Object.values(record.takes)) {
      const key = take.storageKey;
      if (!key) {
        if (take.mediaPath) throw new Error(`take ${record.id}/${take.id} has a media path without authoritative storage metadata`);
        continue;
      }
      const meta = byKey.get(key);
      referenced.add(key);
      if (!meta || meta.cleanupPending || meta.recordId !== record.id || meta.takeId !== take.id || meta.sha256 !== take.sha256 || meta.byteSize !== take.byteSize) {
        throw new Error(`media inventory does not match canonical take ${record.id}/${take.id}`);
      }
    }
  }
  for (const item of items) {
    if (!item.cleanupPending && !referenced.has(item.storageKey)) {
      throw new Error(`attached inventory object is not referenced by a canonical take: ${item.storageKey}`);
    }
  }
}

/** Read an explicit complete inventory and verify each immutable destination object. */
export async function readMediaInventory(file: string, records: readonly WorkRecord[]): Promise<MediaBlobMeta[]> {
  const inventory = validateMediaInventory(JSON.parse(await readSnapshotFile(file)));
  canonicalReferences(records, inventory.entries);
  const mode = process.env.PRACTICE_RELAY_OBJECT_STORE ?? "fs";
  if (!["fs", "s3"].includes(mode)) throw new Error("migration media must use filesystem or S3");
  if (mode === "fs") {
    const root = process.env.PRACTICE_RELAY_MEDIA;
    if (!root) throw new Error("migration requires an explicit filesystem media root");
    const stat = await lstat(root);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) throw new Error("media inventory requires a private real root");
    const knownStorageKeys = new Set(inventory.entries.map((entry) => entry.storageKey));
    const scanned = await scanFilesystemMediaInventory(root, { knownStorageKeys });
    if (scanned.entries.some((entry) => !knownStorageKeys.has(entry.storageKey))) {
      throw new Error("filesystem media contains objects omitted from the inventory");
    }
  }
  const s3 = mode === "s3" ? createS3CompatibleObjectStore({
    endpoint: process.env.PRACTICE_RELAY_S3_ENDPOINT ?? "", bucket: process.env.PRACTICE_RELAY_S3_BUCKET ?? "",
    accessKey: process.env.PRACTICE_RELAY_S3_ACCESS_KEY ?? "", secretKey: process.env.PRACTICE_RELAY_S3_SECRET_KEY ?? "",
    region: process.env.PRACTICE_RELAY_S3_REGION, forcePathStyle: process.env.PRACTICE_RELAY_S3_FORCE_PATH_STYLE !== "0",
  }) : undefined;
  for (const meta of inventory.entries) {
    const stream = s3 ? await s3.getStream(meta.storageKey) : await privateFilesystemStream(process.env.PRACTICE_RELAY_MEDIA ?? "", meta.storageKey);
    if (!stream) throw new Error(`inventory object missing: ${meta.storageKey}`);
    const hash = createHash("sha256");
    let size = 0;
    try {
      for await (const chunk of stream) {
        const bytes = chunk as Buffer;
        size += bytes.length;
        if (size > meta.byteSize) throw new Error("inventory object exceeds declared size");
        hash.update(bytes);
      }
      if (size !== meta.byteSize || hash.digest("hex") !== meta.sha256) throw new Error(`inventory integrity mismatch: ${meta.storageKey}`);
    } finally { stream.destroy(); }
  }
  return [...inventory.entries];
}
