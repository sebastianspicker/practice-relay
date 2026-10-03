/** Critical durable storage and secret-boundary contracts. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createEmptyRecord, addTrack } from "@practice-relay/work-record";
import {
  createDurableRecordStore,
  createMemoryRecordStore,
  createRecordStore,
  resolveTenantRoot,
  safePathSegment,
  type CreateRecordStoreOptions,
} from "./index.ts";
import type { Database } from "@practice-relay/database";

describe("durable record store", () => {
  it("creates durable data and backup paths with owner-only permissions", async () => {
    if (process.platform === "win32") return;
    const parent = mkdtempSync(path.join(tmpdir(), "hub-store-modes-"));
    const root = path.join(parent, "data");
    try {
      const store = createDurableRecordStore({ rootDir: root });
      (await store.create(createEmptyRecord("ps-private", "Private")));
      (await store.appendEvent("ps-private", "export", "fixture", "teacher-1"));
      const backup = (await store.backup());
      const directoryPaths = [
        root,
        path.join(root, "records"),
        path.join(root, "events"),
        path.join(root, "audit"),
        path.join(root, "backups"),
        backup.backupDir,
        path.join(backup.backupDir, "records"),
        path.join(backup.backupDir, "events"),
        path.join(backup.backupDir, "audit"),
      ];
      const filePaths = [
        path.join(root, "records", "ps-private.json"),
        path.join(root, "events", "ps-private.jsonl"),
        path.join(root, "audit", "audit.jsonl"),
        path.join(backup.backupDir, "records", "ps-private.json"),
        path.join(backup.backupDir, "events", "ps-private.jsonl"),
        path.join(backup.backupDir, "audit", "audit.jsonl"),
        path.join(backup.backupDir, "backup-manifest.json"),
      ];
      for (const directory of directoryPaths) {
        assert.equal(statSync(directory).mode & 0o777, 0o700, directory);
      }
      for (const file of filePaths) {
        assert.equal(statSync(file).mode & 0o777, 0o600, file);
      }
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("rejects stale optimistic revisions in JSON and memory adapters", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "hub-store-revision-"));
    try {
      for (const store of [
        createDurableRecordStore({ rootDir: root }),
        createMemoryRecordStore(),
      ]) {
        const id = store.backend === "json" ? "ps-revision-json" : "ps-revision-memory";
        const created = (await store.create(createEmptyRecord(id, "Revision")));
        const updated = (await store.update(id, { ...created, title: "Fresh" }));
        assert.equal(updated.revision, 1);
        await assert.rejects(
          async () => (await store.update(id, { ...created, title: "Stale" })),
          /revision conflict/i,
        );
        assert.equal((await store.get(id))?.title, "Fresh");
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("persists across store instances (restart-safe)", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "hub-store-"));
    try {
      const a = createDurableRecordStore({ rootDir: root });
      let record = createEmptyRecord("ps-persist", "Persist me");
      record = addTrack(record, { id: "v", type: "video", ref: "t.mp4" });
      (await a.create(record));
      (await a.update("ps-persist", record));

      const b = createDurableRecordStore({ rootDir: root });
      const loaded = (await b.get("ps-persist"));
      assert.ok(loaded);
      assert.equal(loaded!.title, "Persist me");
      assert.equal(loaded!.tracks.length, 1);
      assert.ok((loaded as { revision?: number }).revision! >= 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("listByMember, audit events, and backup", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "hub-store-"));
    try {
      const store = createDurableRecordStore({ rootDir: root });
      const record = {
        ...createEmptyRecord("ps-m", "Members"),
        members: [
          { userId: "teacher-1", role: "faculty" as const },
          { userId: "student-1", role: "student" as const },
        ],
      };
      (await store.create(record));
      (await store.appendEvent("ps-m", "export", "zip", "teacher-1"));
      assert.equal((await store.listByMember("teacher-1")).length, 1);
      assert.equal((await store.listByMember("nobody")).length, 0);
      const events = (await store.listEvents("ps-m"));
      assert.ok(events.some((e) => e.kind === "create"));
      const all = (await store.listAllEvents());
      assert.ok(all.some((e) => e.kind === "export" && e.actorId === "teacher-1"));
      const bak = (await store.backup());
      assert.ok(bak.recordCount >= 1);
      assert.ok(bak.recordIds.includes("ps-m"));
      assert.ok(existsSync(path.join(bak.backupDir, "backup-manifest.json")));
      assert.ok(
        existsSync(path.join(bak.backupDir, "records", "ps-m.json")),
      );
      const listed = (await store.listBackups());
      assert.ok(listed.some((m) => m.backupDir === bak.backupDir));
      const metrics = (await store.healthMetrics());
      assert.ok(metrics.recordCount >= 1);
      assert.ok(metrics.auditEventCount >= 1);
      assert.equal(metrics.durable, true);
      assert.equal(metrics.backend, "json");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("restoreFromBackup reloads records after wipe", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "hub-store-"));
    const other = mkdtempSync(path.join(tmpdir(), "hub-store-restore-"));
    try {
      const a = createDurableRecordStore({ rootDir: root });
      const record = createEmptyRecord("ps-restore", "Restore me");
      (await a.create(record));
      (await a.appendEvent("ps-restore", "export", "zip", "teacher-1"));
      const bak = (await a.backup());

      const b = createDurableRecordStore({ rootDir: other });
      assert.equal((await b.get("ps-restore")), undefined);
      (await b.create(createEmptyRecord("ps-after-backup", "Must be removed")));
      const restored = (await b.restoreFromBackup(bak.backupDir));
      assert.ok(restored.recordIds.includes("ps-restore"));
      assert.equal(restored.recordIds.includes("ps-after-backup"), false);
      assert.equal((await b.get("ps-after-backup")), undefined);
      const loaded = (await b.get("ps-restore"));
      assert.ok(loaded);
      assert.equal(loaded!.title, "Restore me");
      assert.ok((await b.listAllEvents()).some((e) => e.kind === "restore"));
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(other, { recursive: true, force: true });
    }
  });

  it("validates a backup completely before replacing live data", async () => {
    const sourceRoot = mkdtempSync(path.join(tmpdir(), "hub-store-bad-backup-"));
    const liveRoot = mkdtempSync(path.join(tmpdir(), "hub-store-live-"));
    try {
      const source = createDurableRecordStore({ rootDir: sourceRoot });
      (await source.create(createEmptyRecord("ps-backup", "Backup")));
      const backup = (await source.backup());
      writeFileSync(
        path.join(backup.backupDir, "records", "ps-backup.json"),
        "{not-json",
      );

      const live = createDurableRecordStore({ rootDir: liveRoot });
      (await live.create(createEmptyRecord("ps-live", "Keep live")));
      await assert.rejects(
        async () => (await live.restoreFromBackup(backup.backupDir)),
        /invalid record file/i,
      );
      assert.equal((await live.get("ps-live"))?.title, "Keep live");
    } finally {
      rmSync(sourceRoot, { recursive: true, force: true });
      rmSync(liveRoot, { recursive: true, force: true });
    }
  });

  it("tenant A cannot list/get tenant B records", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "hub-tenant-"));
    try {
      const a = createDurableRecordStore({ rootDir: root, tenantId: "tenant-a" });
      const b = createDurableRecordStore({ rootDir: root, tenantId: "tenant-b" });
      (await a.create(createEmptyRecord("ps-shared-id", "Only A")));
      assert.ok((await a.get("ps-shared-id")));
      assert.equal((await b.get("ps-shared-id")), undefined);
      assert.equal((await b.list()).length, 0);
      assert.equal((await a.list()).length, 1);
      assert.ok(a.rootDir.endsWith(path.join("tenant-a")) || a.rootDir.includes("tenant-a"));
      assert.ok(existsSync(path.join(root, "tenant-a", "records", "ps-shared-id.json")));
      assert.equal(
        existsSync(path.join(root, "tenant-b", "records", "ps-shared-id.json")),
        false,
      );
      assert.notEqual(resolveTenantRoot(root, "tenant-a"), resolveTenantRoot(root, "tenant-b"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects unsafe tenant and record path segments without rewriting them", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "hub-store-paths-"));
    try {
      for (const value of ["", ".", "..", "tenant/other", "tenant\\other", "C:drive", "has space", "nul\0byte"]) {
        assert.throws(() => safePathSegment(value), /invalid filesystem path segment/);
      }
      assert.equal(safePathSegment("tenant-1._ok"), "tenant-1._ok");
      assert.throws(
        () => createDurableRecordStore({ rootDir: root, tenantId: "../other" }),
        /invalid filesystem path segment/,
      );

      const store = createDurableRecordStore({ rootDir: root });
      await assert.rejects(
        async () => (await store.create({
          ...createEmptyRecord("safe-id", "Unsafe"),
          id: "../escape",
        })),
        /invalid filesystem path segment/,
      );
      await assert.rejects(async () => (await store.get("..")), /invalid filesystem path segment/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("surfaces corrupt record files instead of silently dropping records", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "hub-store-corrupt-"));
    try {
      const store = createDurableRecordStore({ rootDir: root });
      writeFileSync(path.join(root, "records", "broken.json"), "{", "utf8");
      await assert.rejects(async () => (await store.list()), /invalid record file.*broken\.json/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("memory store preserves mutation, snapshot, audit, and tenant isolation contracts", async () => {
    const a = createMemoryRecordStore({ tenantId: "ta" });
    const b = createMemoryRecordStore({ tenantId: "tb" });
    const created = (await a.create(createEmptyRecord("ps-m1", "A")));
    assert.equal(created.revision, 0);
    await assert.rejects(
      async () => (await a.create(createEmptyRecord("ps-m1", "Duplicate"))),
      /already exists/i,
    );
    assert.equal((await b.get("ps-m1")), undefined);

    (await b.create(createEmptyRecord("ps-m1", "B")));
    const updated = (await a.update("ps-m1", { ...created, title: "A updated" }));
    assert.equal(updated.revision, 1);
    await assert.rejects(async () => (await a.update("ps-m1", created)), /revision conflict/i);

    const backup = (await a.backup(":memory-backup:provided"));
    assert.equal(backup.rootDir, ":memory:ta");
    assert.equal(backup.tenantId, "ta");
    assert.equal(backup.recordCount, 1);
    assert.deepEqual(backup.recordIds, ["ps-m1"]);
    assert.equal(backup.backupDir, ":memory-backup:provided");
    const generatedBackup = (await a.backup());
    assert.match(
      generatedBackup.backupDir,
      /^:memory-backup:\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9]{8}$/,
    );
    assert.equal(generatedBackup.recordCount, 1);
    assert.deepEqual(generatedBackup.recordIds, ["ps-m1"]);
    assert.deepEqual((await a.listBackups()), [backup, generatedBackup]);

    assert.equal((await a.delete("ps-m1")), true);
    const restored = (await a.restoreFromBackup(":memory-backup:restore"));
    assert.equal((await a.get("ps-m1")), undefined);
    assert.equal((await b.get("ps-m1"))?.title, "B");
    assert.equal(restored.rootDir, ":memory:ta");
    assert.equal(restored.tenantId, "ta");
    assert.equal(restored.recordCount, 0);
    assert.deepEqual(restored.recordIds, []);
    assert.equal(restored.backupDir, ":memory-backup:restore");

    assert.deepEqual(
      (await a.listAllEvents()).map(({ kind, recordId, detail }) => ({ kind, recordId, detail })),
      [
        { kind: "create", recordId: "ps-m1", detail: undefined },
        { kind: "update", recordId: "ps-m1", detail: undefined },
        { kind: "backup", recordId: "_system", detail: ":memory-backup:provided" },
        { kind: "backup", recordId: "_system", detail: generatedBackup.backupDir },
        { kind: "delete", recordId: "ps-m1", detail: undefined },
        { kind: "restore", recordId: "_system", detail: ":memory-backup:restore" },
      ],
    );
    assert.deepEqual((await a.listEvents("ps-m1")).map((event) => event.kind), [
      "create",
      "update",
      "delete",
    ]);
    assert.deepEqual((await a.healthMetrics()), {
      recordCount: 0,
      auditEventCount: 6,
      rootDir: ":memory:ta",
      durable: false,
      tenantId: "ta",
      backend: "memory",
    });
  });

  it("createRecordStore selects explicit memory|json|postgres backends", async () => {
    const mem = createRecordStore({ backend: "memory" });
    assert.deepEqual(
      [mem.backend, mem.rootDir, mem.tenantId, (await mem.healthMetrics()).rootDir],
      ["memory", ":memory:", undefined, ":memory:"],
    );
    assert.equal(createRecordStore({ backend: "memory", tenantId: "t1" }).tenantId, "t1");
    const root = mkdtempSync(path.join(tmpdir(), "hub-options-json-"));
    try {
      const json = createRecordStore({ backend: "json", rootDir: root, tenantId: "course-1" });
      assert.equal(json.backend, "json");
      assert.equal(json.tenantId, "course-1");
      (await json.create(createEmptyRecord("ps-options", "Options")));
      assert.ok((await json.get("ps-options")));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
    const database = {} as unknown as Database;
    const postgres = createRecordStore({ backend: "postgres", database, tenantId: "t2" });
    assert.deepEqual([postgres.backend, postgres.durable, postgres.rootDir], ["postgres", true, "postgres:t2"]);
    assert.throws(
      () => createRecordStore({ backend: "sqlite" } as unknown as CreateRecordStoreOptions),
      /backend must be memory\|json\|postgres; received "sqlite"/,
    );
  });
});
