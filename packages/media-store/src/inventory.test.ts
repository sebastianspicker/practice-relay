/** Legacy filesystem inventory completeness and identity checks. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { Database } from "@practice-relay/database";
import { importMediaSnapshot, scanFilesystemMediaInventory } from "./inventory.ts";

async function withRoot(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(await realpath(os.tmpdir()), "practice-relay-inventory-"));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

test("filesystem inventory rejects orphan object bytes", async () => withRoot(async (root) => {
  await mkdir(path.join(root, "record"), { mode: 0o700 });
  await writeFile(path.join(root, "record/orphan.bin"), "orphan", { mode: 0o600 });
  await assert.rejects(scanFilesystemMediaInventory(root), /has no metadata: record\/orphan\.bin/u);
}));

test("filesystem inventory rejects root files and hidden object artifacts", async () => withRoot(async (root) => {
  await writeFile(path.join(root, "orphan.bin"), "orphan", { mode: 0o600 });
  await assert.rejects(scanFilesystemMediaInventory(root), /unsupported media inventory entry: orphan\.bin/u);
  await rm(path.join(root, "orphan.bin"));
  await mkdir(path.join(root, "record"), { mode: 0o700 });
  await writeFile(path.join(root, "record/.orphan.bin"), "orphan", { mode: 0o600 });
  await assert.rejects(scanFilesystemMediaInventory(root), /has no metadata: record\/\.orphan\.bin/u);
}));

test("filesystem inventory rejects a sidecar assigned to the wrong record", async () => withRoot(async (root) => {
  const bytes = Buffer.from("media");
  await mkdir(path.join(root, "record"), { mode: 0o700 });
  await writeFile(path.join(root, "record/take.bin"), bytes, { mode: 0o600 });
  await writeFile(path.join(root, "record/take.bin.meta.json"), JSON.stringify({
    storageKey: "record/take.bin",
    recordId: "different-record",
    takeId: "take",
    contentType: "application/octet-stream",
    byteSize: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    createdAt: new Date().toISOString(),
  }), { mode: 0o600 });
  await assert.rejects(scanFilesystemMediaInventory(root), /metadata record mismatch/u);
}));

test("filesystem inventory accepts explicitly known state-managed objects", async () => withRoot(async (root) => {
  await mkdir(path.join(root, "record"), { mode: 0o700 });
  await writeFile(path.join(root, "record/managed.bin"), "managed", { mode: 0o600 });
  const inventory = await scanFilesystemMediaInventory(root, {
    knownStorageKeys: new Set(["record/managed.bin"]),
  });
  assert.deepEqual(inventory.entries, []);
}));

test("snapshot import locks and rejects a nonempty media namespace even for no items", async () => {
  const queries: string[] = [];
  const database = {
    async query(text: string) {
      queries.push(text);
      if (text.includes("AS count")) return { rows: [{ count: "1" }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  } as unknown as Database;
  await assert.rejects(
    importMediaSnapshot(database, { items: [], dryRun: true }),
    /destination namespace is not empty/u,
  );
  assert.match(queries[0]!, /pg_advisory_xact_lock/u);
  assert.match(queries[1]!, /practice_relay_media_cleanup_jobs/u);
});
