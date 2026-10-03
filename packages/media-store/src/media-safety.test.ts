/**
 * Direct boundary regressions for portable media keys and persisted metadata.
 *
 * Why: storage keys cross filesystem and object-store boundaries before metadata is trusted.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertSafeStorageKey, parseMediaMeta } from "./media-safety.ts";

const safeRelativePathError = "media storageKey must be a safe relative path";
const traversalError = "media storageKey must not contain traversal segments";

const validMeta = {
  storageKey: "record/take.bin",
  recordId: "record",
  takeId: "take",
  contentType: "video/mp4",
  byteSize: 1,
  sha256: "a".repeat(64),
  createdAt: "2026-08-11T00:00:00.000Z",
};

const parse = (value: unknown, requestedKey?: unknown) => {
  return parseMediaMeta(JSON.stringify(value), requestedKey as string | undefined);
};

describe("media safety", () => {
  it("accepts portable relative storage keys without normalizing them", () => {
    for (const storageKey of ["a/b", "C:relative", "file:stream", "CON", "%2e%2e"]) {
      assert.doesNotThrow(() => assertSafeStorageKey(storageKey));
    }
  });

  it("rejects portable and native absolute keys, NULs, and backslashes", () => {
    for (const storageKey of [
      "",
      "\0key",
      "folder\\key",
      "/tmp/media.bin",
      "C:/media.bin",
      "//server/share/media.bin",
      "\\\\server\\share\\media.bin",
    ]) {
      assert.throws(() => assertSafeStorageKey(storageKey), new Error(safeRelativePathError));
    }
  });

  it("rejects empty, dot, and parent path segments after portable-key checks", () => {
    for (const storageKey of ["a//b", "./a", "a/.", "../a", "a/../b", "a/"]) {
      assert.throws(() => assertSafeStorageKey(storageKey), new Error(traversalError));
    }
  });

  it("uses the portable-key error for overlapping unsafe-key and traversal inputs", () => {
    for (const storageKey of ["", "\0../key", "folder\\../key", "/../key"]) {
      assert.throws(() => assertSafeStorageKey(storageKey), new Error(safeRelativePathError));
    }
  });

  it("preserves direct non-string and proxy evaluation behavior", () => {
    assert.throws(() => assertSafeStorageKey(1 as unknown as string), TypeError);

    const reads = { includes: 0, split: 0 };
    const key = new Proxy({}, {
      get(_target, property) {
        if (property === "includes") {
          reads.includes += 1;
          return () => false;
        }
        if (property === "split") {
          reads.split += 1;
          return () => [];
        }
        return undefined;
      },
    });
    assert.throws(() => assertSafeStorageKey(key as unknown as string), TypeError);
    assert.deepEqual(reads, { includes: 2, split: 0 });

    const rejectedReads = { includes: 0, split: 0 };
    const rejectedKey = new Proxy({}, {
      get(_target, property) {
        if (property === "includes") {
          rejectedReads.includes += 1;
          return () => true;
        }
        if (property === "split") rejectedReads.split += 1;
        return undefined;
      },
    });
    assert.throws(() => assertSafeStorageKey(rejectedKey as unknown as string), new Error(safeRelativePathError));
    assert.deepEqual(rejectedReads, { includes: 1, split: 0 });
  });

  it("rejects malformed JSON, null, arrays, and non-object primitive metadata", () => {
    assert.equal(parseMediaMeta("{"), undefined);
    for (const raw of ["null", "[]", "true", "1", "\"metadata\""]) {
      assert.equal(parseMediaMeta(raw), undefined);
    }
  });

  it("requires every required metadata field to have its exact primitive type", () => {
    const invalidFields: Array<[keyof typeof validMeta, unknown]> = [
      ["storageKey", 1],
      ["recordId", 1],
      ["takeId", 1],
      ["contentType", 1],
      ["sha256", 1],
      ["createdAt", 1],
      ["byteSize", "1"],
    ];
    for (const [field, value] of invalidFields) {
      assert.equal(parse({ ...validMeta, [field]: value }), undefined, field);
      const { [field]: _removed, ...missing } = validMeta;
      assert.equal(parse(missing), undefined, `${field} missing`);
    }
  });

  it("rejects unsafe string storage keys embedded in otherwise valid metadata", () => {
    for (const storageKey of ["../take.bin", "record/\0take.bin", "record\\take.bin"]) {
      assert.equal(parse({ ...validMeta, storageKey }), undefined);
    }
  });

  it("accepts only string optional names when they are supplied", () => {
    const namedMeta = { ...validMeta, originalName: "take.mp4", deletedAt: "2026-08-11" };
    assert.deepEqual(parse(namedMeta), namedMeta);
    for (const field of ["originalName", "deletedAt"]) {
      for (const value of [null, 1, true]) {
        assert.equal(parse({ ...validMeta, [field]: value }), undefined, `${field} ${String(value)}`);
      }
    }
  });

  it("accepts finite fractional byte sizes and rejects negative or non-finite values", () => {
    assert.equal(parse({ ...validMeta, byteSize: 1.5 })?.byteSize, 1.5);
    assert.equal(parse({ ...validMeta, byteSize: -1 }), undefined);
    assert.equal(parseMediaMeta(`{"storageKey":"record/take.bin","recordId":"record","takeId":"take","contentType":"video/mp4","byteSize":1e999,"sha256":"${validMeta.sha256}","createdAt":"${validMeta.createdAt}"}`), undefined);
  });

  it("matches a requested key strictly and keeps undefined as no key constraint", () => {
    assert.deepEqual(parse(validMeta), validMeta);
    assert.deepEqual(parse(validMeta, "record/take.bin"), validMeta);
    assert.equal(parse(validMeta, "other/take.bin"), undefined);
    assert.equal(parse(validMeta, null), undefined);
    assert.equal(parse(validMeta, { toString: () => "record/take.bin" }), undefined);
  });

  it("keeps JSON.parse raw-input coercion without adding a parsing wrapper", () => {
    const raw = { toString: () => JSON.stringify(validMeta) };
    assert.deepEqual(parseMediaMeta(raw as unknown as string), validMeta);
    assert.equal(
      parseMediaMeta({ toString: () => { throw new Error("coercion failed"); } } as unknown as string),
      undefined,
    );
  });

  it("continues to accept empty identity strings and unknown metadata fields", () => {
    const permissiveMeta = {
      ...validMeta,
      recordId: "",
      takeId: "",
      contentType: "",
      sha256: "",
      createdAt: "",
      extra: true,
    };
    assert.deepEqual(parse(permissiveMeta), permissiveMeta);
  });
});
