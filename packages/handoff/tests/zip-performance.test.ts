/** Byte-compatibility and workload benchmarks for the optimized ZIP writer. */
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { test } from "node:test";
import {
  buildStoreZip,
  normalizeStoreZipEntries,
  type StoreZipEntry,
} from "../src/integrity/zip.ts";

/** Previous store-only implementation retained as a test oracle. */
function legacyBuildStoreZip(files: StoreZipEntry[]): Buffer {
  const entries = normalizeStoreZipEntries(files);
  const localParts = entries.map((entry) => {
    const name = Buffer.from(entry.path, "utf8");
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt32LE(legacyCrc32(entry.data), 14);
    header.writeUInt32LE(entry.data.length, 18);
    header.writeUInt32LE(entry.data.length, 22);
    header.writeUInt16LE(name.length, 26);
    return Buffer.concat([header, name, entry.data]);
  });
  let localOffset = 0;
  const centralParts = entries.map((entry, index) => {
    const name = Buffer.from(entry.path, "utf8");
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt32LE(legacyCrc32(entry.data), 16);
    header.writeUInt32LE(entry.data.length, 20);
    header.writeUInt32LE(entry.data.length, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE(localOffset, 42);
    localOffset += localParts[index]!.length;
    return Buffer.concat([header, name]);
  });
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function legacyCrc32(buffer: Buffer): number {
  let checksum = 0xffffffff;
  for (const byte of buffer) {
    checksum ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      checksum =
        checksum & 1 ? 0xedb88320 ^ (checksum >>> 1) : checksum >>> 1;
    }
  }
  return (checksum ^ 0xffffffff) >>> 0;
}

function measure(action: () => Buffer): { value: Buffer; milliseconds: number } {
  const start = performance.now();
  const value = action();
  return { value, milliseconds: performance.now() - start };
}

test("optimized ZIP output is byte-identical to the previous writer", () => {
  const files: StoreZipEntry[] = [
    { path: "manifest.json", bytes: "{\"schemaVersion\":\"0.4\"}\n" },
    { path: "records/résumé-演奏.txt", bytes: Buffer.from([0, 1, 2, 255]) },
    { path: "empty.bin", bytes: Buffer.alloc(0) },
  ];
  assert.deepEqual(buildStoreZip(files), legacyBuildStoreZip(files));
});

for (const mebibytes of [1, 10]) {
  test(`optimized ZIP matches the legacy oracle for a ${mebibytes} MiB payload`, (context) => {
    const bytes = Buffer.alloc(mebibytes * 1024 * 1024, 0xa5);
    const files = [{ path: `payload-${mebibytes}m.bin`, bytes }];
    const legacy = measure(() => legacyBuildStoreZip(files));
    const optimized = measure(() => buildStoreZip(files));
    assert.deepEqual(optimized.value, legacy.value);
    context.diagnostic(
      `${mebibytes} MiB ZIP benchmark: legacy=${legacy.milliseconds.toFixed(2)}ms optimized=${optimized.milliseconds.toFixed(2)}ms`,
    );
  });
}
