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

/** Entry metadata calculated once before the final archive allocation. */
type PreparedStoreZipEntry = NormalizedStoreZipEntry & {
  name: Buffer;
  checksum: number;
  localOffset: number;
};

const LOCAL_HEADER_LENGTH = 30;
const CENTRAL_HEADER_LENGTH = 46;
const END_RECORD_LENGTH = 22;
const UTF8_FLAG = 0x0800;

/** Static lookup table used by every entry checksum. */
const CRC32_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let checksum = value;
  for (let bit = 0; bit < 8; bit += 1) {
    checksum = checksum & 1 ? 0xedb88320 ^ (checksum >>> 1) : checksum >>> 1;
  }
  return checksum >>> 0;
});

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

const crc32 = (buffer: Buffer): number => {
  let checksum = 0xffffffff;
  for (const byte of buffer) {
    checksum = CRC32_TABLE[(checksum ^ byte) & 0xff]! ^ (checksum >>> 8);
  }
  return (checksum ^ 0xffffffff) >>> 0;
};

/** Convert normalized entries into reusable header metadata and archive offsets. */
const prepareStoreZipEntries = (
  entries: NormalizedStoreZipEntry[],
): { entries: PreparedStoreZipEntry[]; localLength: number; centralLength: number } => {
  let localLength = 0;
  let centralLength = 0;
  const prepared = entries.map((entry) => {
    const name = Buffer.from(entry.path, "utf8");
    if (name.length > 0xffff) {
      throw new Error(`ZIP entry path is too long: ${entry.path}`);
    }
    if (entry.data.length > 0xffffffff) {
      throw new Error(`ZIP entry is too large: ${entry.path}`);
    }
    const result = {
      ...entry,
      name,
      checksum: crc32(entry.data),
      localOffset: localLength,
    };
    localLength += LOCAL_HEADER_LENGTH + name.length + entry.data.length;
    centralLength += CENTRAL_HEADER_LENGTH + name.length;
    return result;
  });
  if (prepared.length > 0xffff) {
    throw new Error("ZIP archive has too many entries");
  }
  if (localLength > 0xffffffff || centralLength > 0xffffffff) {
    throw new Error("ZIP archive exceeds the classic ZIP size limit");
  }
  return { entries: prepared, localLength, centralLength };
};

/** Write one local file header, filename, and payload into the final archive. */
const writeLocalEntry = (
  archive: Buffer,
  entry: PreparedStoreZipEntry,
): number => {
  const offset = entry.localOffset;
  archive.writeUInt32LE(0x04034b50, offset);
  archive.writeUInt16LE(20, offset + 4);
  archive.writeUInt16LE(UTF8_FLAG, offset + 6);
  archive.writeUInt32LE(entry.checksum, offset + 14);
  archive.writeUInt32LE(entry.data.length, offset + 18);
  archive.writeUInt32LE(entry.data.length, offset + 22);
  archive.writeUInt16LE(entry.name.length, offset + 26);
  entry.name.copy(archive, offset + LOCAL_HEADER_LENGTH);
  entry.data.copy(archive, offset + LOCAL_HEADER_LENGTH + entry.name.length);
  return offset + LOCAL_HEADER_LENGTH + entry.name.length + entry.data.length;
};

/** Write one central-directory entry using its already calculated checksum and offset. */
const writeCentralEntry = (
  archive: Buffer,
  entry: PreparedStoreZipEntry,
  offset: number,
): number => {
  archive.writeUInt32LE(0x02014b50, offset);
  archive.writeUInt16LE(20, offset + 4);
  archive.writeUInt16LE(20, offset + 6);
  archive.writeUInt16LE(UTF8_FLAG, offset + 8);
  archive.writeUInt32LE(entry.checksum, offset + 16);
  archive.writeUInt32LE(entry.data.length, offset + 20);
  archive.writeUInt32LE(entry.data.length, offset + 24);
  archive.writeUInt16LE(entry.name.length, offset + 28);
  archive.writeUInt32LE(entry.localOffset, offset + 42);
  entry.name.copy(archive, offset + CENTRAL_HEADER_LENGTH);
  return offset + CENTRAL_HEADER_LENGTH + entry.name.length;
};

/** Write the end-of-central-directory record into the final archive. */
const writeZipEnd = (
  archive: Buffer,
  end: {
    offset: number;
    count: number;
    centralLength: number;
    localLength: number;
  },
): void => {
  archive.writeUInt32LE(0x06054b50, end.offset);
  archive.writeUInt16LE(end.count, end.offset + 8);
  archive.writeUInt16LE(end.count, end.offset + 10);
  archive.writeUInt32LE(end.centralLength, end.offset + 12);
  archive.writeUInt32LE(end.localLength, end.offset + 16);
};

/** Minimal ZIP (store method, no compression) for lab package download. */
export function buildStoreZip(files: StoreZipEntry[]): Buffer {
  const normalized = normalizeStoreZipEntries(files);
  const { entries, localLength, centralLength } = prepareStoreZipEntries(normalized);
  const archive = Buffer.alloc(localLength + centralLength + END_RECORD_LENGTH);
  for (const entry of entries) writeLocalEntry(archive, entry);
  let centralOffset = localLength;
  for (const entry of entries) {
    centralOffset = writeCentralEntry(archive, entry, centralOffset);
  }
  writeZipEnd(archive, {
    offset: centralOffset,
    count: entries.length,
    centralLength,
    localLength,
  });
  return archive;
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
