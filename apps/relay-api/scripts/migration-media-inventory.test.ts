/** Offline media migration rejects absent, corrupt, and mismatched referenced bytes. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createEmptyRecord } from "@practice-relay/work-record";
import { readMediaInventory } from "./migration-media-inventory.js";

test("media inventory verifies complete bytes and canonical take identity without source writes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "relay-media-inventory-"));
  const oldRoot = process.env.PRACTICE_RELAY_MEDIA;
  const oldMode = process.env.PRACTICE_RELAY_OBJECT_STORE;
  const mediaRoot = path.join(root, "media");
  await mkdir(mediaRoot, { mode: 0o700 });
  process.env.PRACTICE_RELAY_MEDIA = mediaRoot; process.env.PRACTICE_RELAY_OBJECT_STORE = "fs";
  try {
    const bytes = Buffer.from("canonical media");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    await mkdir(path.join(mediaRoot, "record"), { mode: 0o700 });
    const object = path.join(mediaRoot, "record/take.bin");
    const file = path.join(root, "inventory.json");
    await writeFile(object, bytes, { mode: 0o600 });
    const meta = { storageKey: "record/take.bin", recordId: "record", takeId: "take", contentType: "application/octet-stream", byteSize: bytes.length, sha256, createdAt: new Date().toISOString(), state: "attached" };
    await writeFile(file, JSON.stringify({ version: 1, entries: [meta] }), { mode: 0o600 });
    const record = { ...createEmptyRecord("record", "Media"), takes: [{ id: "take", storageKey: meta.storageKey, sha256, byteSize: bytes.length }] };
    assert.equal((await readMediaInventory(file, [record])).length, 1);
    assert.deepEqual(await readFile(object), bytes);
    const orphan = path.join(mediaRoot, "record/orphan.bin");
    await writeFile(orphan, bytes, { mode: 0o600 });
    await assert.rejects(readMediaInventory(file, [record]), /no metadata/);
    await rm(orphan);
    await assert.rejects(readMediaInventory(file, []), /not referenced by a canonical take/);
    await assert.rejects(readMediaInventory(file, [{ ...record, takes: [{ ...record.takes[0]!, sha256: "0".repeat(64) }] }]), /canonical take/);
    await writeFile(object, Buffer.alloc(bytes.length));
    await assert.rejects(readMediaInventory(file, [record]), /integrity mismatch/);
    await rm(object);
    await assert.rejects(readMediaInventory(file, [record]), /ENOENT/);
  } finally {
    if (oldRoot === undefined) delete process.env.PRACTICE_RELAY_MEDIA; else process.env.PRACTICE_RELAY_MEDIA = oldRoot;
    if (oldMode === undefined) delete process.env.PRACTICE_RELAY_OBJECT_STORE; else process.env.PRACTICE_RELAY_OBJECT_STORE = oldMode;
    await rm(root, { recursive: true, force: true });
  }
});
