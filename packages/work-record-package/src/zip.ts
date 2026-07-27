/**
 * Dependency-free ZIP store writer for Practice Relay package exports.
 *
 * Why: archive serialization and path hardening are isolated from work-record package and
 * RO-Crate construction so both contracts remain independently reviewable.
 */

/** Input file accepted by the deterministic store-only ZIP writer. */
export type StoreZipEntry = { path: string; bytes: Buffer | string };

/** Normalized ZIP file path and UTF-8 bytes used for inventory and emission. */
export type NormalizedStoreZipEntry = { path: string; data: Buffer };

/** Serialize a store-method ZIP local header and payload for one normalized entry. */
const buildLocalZipPart = (entry: NormalizedStoreZipEntry): Buffer => {
  const name = Buffer.from(entry.path, "utf8");
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt32LE(crc32(entry.data) >>> 0, 14);
  header.writeUInt32LE(entry.data.length, 18);
  header.writeUInt32LE(entry.data.length, 22);
  header.writeUInt16LE(name.length, 26);
  return Buffer.concat([header, name, entry.data]);
};

/** Serialize central-directory parts aligned with their corresponding local byte offsets. */
const buildCentralZipParts = (
  entries: NormalizedStoreZipEntry[],
  localParts: Buffer[],
): Buffer[] => {
  let offset = 0;
  return entries.map((entry, index) => {
    const part = buildCentralZipPart(entry, offset);
    offset += localParts[index]!.length;
    return part;
  });
};

/** Serialize one central-directory header for a normalized store-method entry. */
const buildCentralZipPart = (
  entry: NormalizedStoreZipEntry,
  offset: number,
): Buffer => {
  const name = Buffer.from(entry.path, "utf8");
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt32LE(crc32(entry.data) >>> 0, 16);
  header.writeUInt32LE(entry.data.length, 20);
  header.writeUInt32LE(entry.data.length, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt32LE(offset, 42);
  return Buffer.concat([header, name]);
};

/** Serialize the ZIP end-of-central-directory record from finalized parts. */
const buildZipEnd = (
  count: number,
  centralLength: number,
  localParts: Buffer[],
): Buffer => {
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(centralLength, 12);
  end.writeUInt32LE(localParts.reduce((offset, part) => offset + part.length, 0), 16);
  end.writeUInt16LE(0, 20);
  return end;
};

const normalizeZipPath = (entryPath: string): string => {
  if (typeof entryPath !== "string" || entryPath.trim().length === 0) {
    throw new Error("ZIP entry path must not be empty");
  }
  if (entryPath.includes("\0")) {
    throw new Error("ZIP entry path must not contain NUL");
  }
  if (/^[a-zA-Z]:/.test(entryPath)) {
    throw new Error("ZIP entry path must not use a drive prefix");
  }
  const normalized = entryPath.replace(/\\/g, "/");
  if (normalized.startsWith("/")) {
    throw new Error("ZIP entry path must be relative");
  }
  const segments = normalized.split("/");
  if (segments.some((segment) => segment.length === 0)) {
    throw new Error("ZIP entry path must not contain empty segments");
  }
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("ZIP entry path must not contain traversal segments");
  }
  return normalized;
};

const zipPathKey = (entryPath: string): string => {
  return entryPath.normalize("NFC").toLowerCase();
};

const crc32 = (buf: Buffer): number => {
  let checksum = 0xffffffff;
  for (const byte of buf) {
    checksum ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      checksum =
        checksum & 1
          ? 0xedb88320 ^ (checksum >>> 1)
          : checksum >>> 1;
    }
  }
  return (checksum ^ 0xffffffff) >>> 0;
};

/** Minimal ZIP (store method, no compression) for lab package download. */
export function buildStoreZip(files: StoreZipEntry[]): Buffer {
  const entries = normalizeStoreZipEntries(files);
  const localParts = entries.map(buildLocalZipPart);
  const centralParts = buildCentralZipParts(entries, localParts);
  const centralDir = Buffer.concat(centralParts);
  return Buffer.concat([
    ...localParts,
    centralDir,
    buildZipEnd(entries.length, centralDir.length, localParts),
  ]);
}

/** Convert text entries to UTF-8 while preserving binary entry buffers. */
const storeZipBytes = (bytes: StoreZipEntry["bytes"]): Buffer => {
  if (typeof bytes === "string") return Buffer.from(bytes, "utf8");
  return bytes;
};

/** Normalize and de-duplicate ZIP entries before writing or inventorying them. */
export function normalizeStoreZipEntries(
  files: StoreZipEntry[],
): NormalizedStoreZipEntry[] {
  const seen = new Set<string>();
  const entries: NormalizedStoreZipEntry[] = [];
  for (const file of files) {
    const path = normalizeZipPath(file.path);
    const key = zipPathKey(path);
    if (seen.has(key)) {
      throw new Error(`ZIP entry path is duplicate or reserved: ${path}`);
    }
    seen.add(key);
    entries.push({ path, data: storeZipBytes(file.bytes) });
  }
  return entries;
}
