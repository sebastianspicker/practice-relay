/** Critical durable storage and secret-boundary contracts. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  existsSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createEmptyRecord, addTrack } from "@practice-relay/work-record-core";
import {
  createDurableRecordStore,
  createMemoryRecordStore,
  createStoreFromEnv,
  createPostgresRecordStore,
  resolveOpsSecrets,
  kmsStubEncrypt,
  resolveTenantRoot,
  safePathSegment,
} from "./index.ts";

describe("durable record store", () => {
  it("creates durable data and backup paths with owner-only permissions", () => {
    if (process.platform === "win32") return;
    const parent = mkdtempSync(path.join(tmpdir(), "hub-store-modes-"));
    const root = path.join(parent, "data");
    try {
      const store = createDurableRecordStore({ rootDir: root });
      store.create(createEmptyRecord("ps-private", "Private"));
      store.appendEvent("ps-private", "export", "fixture", "teacher-1");
      const backup = store.backup();
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

  it("rejects stale optimistic revisions in JSON and memory adapters", () => {
    const root = mkdtempSync(path.join(tmpdir(), "hub-store-revision-"));
    try {
      for (const store of [
        createDurableRecordStore({ rootDir: root }),
        createMemoryRecordStore(),
      ]) {
        const id = store.backend === "json" ? "ps-revision-json" : "ps-revision-memory";
        const created = store.create(createEmptyRecord(id, "Revision"));
        const updated = store.update(id, { ...created, title: "Fresh" });
        assert.equal(updated.revision, 1);
        assert.throws(
          () => store.update(id, { ...created, title: "Stale" }),
          /revision conflict/i,
        );
        assert.equal(store.get(id)?.title, "Fresh");
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("persists across store instances (restart-safe)", () => {
    const root = mkdtempSync(path.join(tmpdir(), "hub-store-"));
    try {
      const a = createDurableRecordStore({ rootDir: root });
      let record = createEmptyRecord("ps-persist", "Persist me");
      record = addTrack(record, { id: "v", type: "video", ref: "t.mp4" });
      a.create(record);
      a.update("ps-persist", record);

      const b = createDurableRecordStore({ rootDir: root });
      const loaded = b.get("ps-persist");
      assert.ok(loaded);
      assert.equal(loaded!.title, "Persist me");
      assert.equal(loaded!.tracks.length, 1);
      assert.ok((loaded as { revision?: number }).revision! >= 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("listByMember, audit events, and backup", () => {
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
      store.create(record);
      store.appendEvent("ps-m", "export", "zip", "teacher-1");
      assert.equal(store.listByMember("teacher-1").length, 1);
      assert.equal(store.listByMember("nobody").length, 0);
      const events = store.listEvents("ps-m");
      assert.ok(events.some((e) => e.kind === "create"));
      const all = store.listAllEvents();
      assert.ok(all.some((e) => e.kind === "export" && e.actorId === "teacher-1"));
      const bak = store.backup();
      assert.ok(bak.recordCount >= 1);
      assert.ok(bak.recordIds.includes("ps-m"));
      assert.ok(existsSync(path.join(bak.backupDir, "backup-manifest.json")));
      assert.ok(
        existsSync(path.join(bak.backupDir, "records", "ps-m.json")),
      );
      const listed = store.listBackups();
      assert.ok(listed.some((m) => m.backupDir === bak.backupDir));
      const metrics = store.healthMetrics();
      assert.ok(metrics.recordCount >= 1);
      assert.ok(metrics.auditEventCount >= 1);
      assert.equal(metrics.durable, true);
      assert.equal(metrics.backend, "json");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("restoreFromBackup reloads records after wipe", () => {
    const root = mkdtempSync(path.join(tmpdir(), "hub-store-"));
    const other = mkdtempSync(path.join(tmpdir(), "hub-store-restore-"));
    try {
      const a = createDurableRecordStore({ rootDir: root });
      const record = createEmptyRecord("ps-restore", "Restore me");
      a.create(record);
      a.appendEvent("ps-restore", "export", "zip", "teacher-1");
      const bak = a.backup();

      const b = createDurableRecordStore({ rootDir: other });
      assert.equal(b.get("ps-restore"), undefined);
      b.create(createEmptyRecord("ps-after-backup", "Must be removed"));
      const restored = b.restoreFromBackup(bak.backupDir);
      assert.ok(restored.recordIds.includes("ps-restore"));
      assert.equal(restored.recordIds.includes("ps-after-backup"), false);
      assert.equal(b.get("ps-after-backup"), undefined);
      const loaded = b.get("ps-restore");
      assert.ok(loaded);
      assert.equal(loaded!.title, "Restore me");
      assert.ok(b.listAllEvents().some((e) => e.kind === "restore"));
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(other, { recursive: true, force: true });
    }
  });

  it("validates a backup completely before replacing live data", () => {
    const sourceRoot = mkdtempSync(path.join(tmpdir(), "hub-store-bad-backup-"));
    const liveRoot = mkdtempSync(path.join(tmpdir(), "hub-store-live-"));
    try {
      const source = createDurableRecordStore({ rootDir: sourceRoot });
      source.create(createEmptyRecord("ps-backup", "Backup"));
      const backup = source.backup();
      writeFileSync(
        path.join(backup.backupDir, "records", "ps-backup.json"),
        "{not-json",
      );

      const live = createDurableRecordStore({ rootDir: liveRoot });
      live.create(createEmptyRecord("ps-live", "Keep live"));
      assert.throws(
        () => live.restoreFromBackup(backup.backupDir),
        /invalid record file/i,
      );
      assert.equal(live.get("ps-live")?.title, "Keep live");
    } finally {
      rmSync(sourceRoot, { recursive: true, force: true });
      rmSync(liveRoot, { recursive: true, force: true });
    }
  });

  it("tenant A cannot list/get tenant B records", () => {
    const root = mkdtempSync(path.join(tmpdir(), "hub-tenant-"));
    try {
      const a = createDurableRecordStore({ rootDir: root, tenantId: "tenant-a" });
      const b = createDurableRecordStore({ rootDir: root, tenantId: "tenant-b" });
      a.create(createEmptyRecord("ps-shared-id", "Only A"));
      assert.ok(a.get("ps-shared-id"));
      assert.equal(b.get("ps-shared-id"), undefined);
      assert.equal(b.list().length, 0);
      assert.equal(a.list().length, 1);
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

  it("rejects unsafe tenant and record path segments without rewriting them", () => {
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
      assert.throws(
        () => store.create({
          ...createEmptyRecord("safe-id", "Unsafe"),
          id: "../escape",
        }),
        /invalid filesystem path segment/,
      );
      assert.throws(() => store.get(".."), /invalid filesystem path segment/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("surfaces corrupt record files instead of silently dropping records", () => {
    const root = mkdtempSync(path.join(tmpdir(), "hub-store-corrupt-"));
    try {
      const store = createDurableRecordStore({ rootDir: root });
      writeFileSync(path.join(root, "records", "broken.json"), "{", "utf8");
      assert.throws(() => store.list(), /invalid record file.*broken\.json/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("memory store preserves mutation, snapshot, audit, and tenant isolation contracts", () => {
    const a = createMemoryRecordStore({ tenantId: "ta" });
    const b = createMemoryRecordStore({ tenantId: "tb" });
    const created = a.create(createEmptyRecord("ps-m1", "A"));
    assert.equal(created.revision, 0);
    assert.throws(
      () => a.create(createEmptyRecord("ps-m1", "Duplicate")),
      /already exists/i,
    );
    assert.equal(b.get("ps-m1"), undefined);

    b.create(createEmptyRecord("ps-m1", "B"));
    const updated = a.update("ps-m1", { ...created, title: "A updated" });
    assert.equal(updated.revision, 1);
    assert.throws(() => a.update("ps-m1", created), /revision conflict/i);

    const backup = a.backup(":memory-backup:provided");
    assert.equal(backup.rootDir, ":memory:ta");
    assert.equal(backup.tenantId, "ta");
    assert.equal(backup.recordCount, 1);
    assert.deepEqual(backup.recordIds, ["ps-m1"]);
    assert.equal(backup.backupDir, ":memory-backup:provided");
    const generatedBackup = a.backup();
    assert.match(
      generatedBackup.backupDir,
      /^:memory-backup:\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9]{8}$/,
    );
    assert.equal(generatedBackup.recordCount, 1);
    assert.deepEqual(generatedBackup.recordIds, ["ps-m1"]);
    assert.deepEqual(a.listBackups(), [backup, generatedBackup]);

    assert.equal(a.delete("ps-m1"), true);
    const restored = a.restoreFromBackup(":memory-backup:restore");
    assert.equal(a.get("ps-m1"), undefined);
    assert.equal(b.get("ps-m1")?.title, "B");
    assert.equal(restored.rootDir, ":memory:ta");
    assert.equal(restored.tenantId, "ta");
    assert.equal(restored.recordCount, 0);
    assert.deepEqual(restored.recordIds, []);
    assert.equal(restored.backupDir, ":memory-backup:restore");

    assert.deepEqual(
      a.listAllEvents().map(({ kind, recordId, detail }) => ({ kind, recordId, detail })),
      [
        { kind: "create", recordId: "ps-m1", detail: undefined },
        { kind: "update", recordId: "ps-m1", detail: undefined },
        { kind: "backup", recordId: "_system", detail: ":memory-backup:provided" },
        { kind: "backup", recordId: "_system", detail: generatedBackup.backupDir },
        { kind: "delete", recordId: "ps-m1", detail: undefined },
        { kind: "restore", recordId: "_system", detail: ":memory-backup:restore" },
      ],
    );
    assert.deepEqual(a.listEvents("ps-m1").map((event) => event.kind), [
      "create",
      "update",
      "delete",
    ]);
    assert.deepEqual(a.healthMetrics(), {
      recordCount: 0,
      auditEventCount: 6,
      rootDir: ":memory:ta",
      durable: false,
      tenantId: "ta",
      backend: "memory",
    });
  });

  it("createStoreFromEnv respects PRACTICE_RELAY_STORE=memory|json", () => {
    const mem = createStoreFromEnv({
      env: { PRACTICE_RELAY_STORE: "memory" } as NodeJS.ProcessEnv,
    });
    assert.equal(mem.backend, "memory");
    const root = mkdtempSync(path.join(tmpdir(), "hub-env-json-"));
    try {
      const json = createStoreFromEnv({
        env: {
          PRACTICE_RELAY_STORE: "json",
          PRACTICE_RELAY_DATA: root,
          PRACTICE_RELAY_TENANT_ID: "course-1",
        } as NodeJS.ProcessEnv,
      });
      assert.equal(json.backend, "json");
      assert.equal(json.tenantId, "course-1");
      json.create(createEmptyRecord("ps-env", "Env"));
      assert.ok(json.get("ps-env"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
    assert.throws(() =>
      createStoreFromEnv({
        env: { PRACTICE_RELAY_STORE: "sqlite" } as NodeJS.ProcessEnv,
      }),
    );
    assert.throws(
      () => createPostgresRecordStore({ connectionString: "postgres://x" }),
      /not configured/,
    );
    assert.throws(
      () =>
        createStoreFromEnv({
          env: { PRACTICE_RELAY_STORE: "postgres" } as NodeJS.ProcessEnv,
        }),
      /not configured/,
    );
  });
});

describe("resolveOpsSecrets backends", () => {
  const kmsStubTestKey = ["lab", "kms", "stub", "key"].join("-");

  it("env backend and require-secrets", () => {
    const lab = resolveOpsSecrets({});
    assert.equal(lab.usingDevDefaults, true);
    assert.equal(lab.secretBackend, "env");
    assert.equal(lab.secretSource, "env");
    assert.throws(() =>
      resolveOpsSecrets({ PRACTICE_RELAY_REQUIRE_SECRETS: "1" } as NodeJS.ProcessEnv),
    );
    for (const [authSecret, ltiSecret] of [
      ["short", "also-short"],
      ["replace-me-practice-relay-auth-lab-secret", "x".repeat(40)],
      ["x".repeat(40), "x".repeat(40)],
    ]) {
      assert.throws(
        () => resolveOpsSecrets({
          PRACTICE_RELAY_REQUIRE_SECRETS: "1",
          PRACTICE_RELAY_AUTH_SECRET: authSecret,
          PRACTICE_RELAY_LTI_SECRET: ltiSecret,
        } as NodeJS.ProcessEnv),
        /distinct, non-placeholder/i,
      );
    }
    const strict = resolveOpsSecrets({
      PRACTICE_RELAY_REQUIRE_SECRETS: "1",
      PRACTICE_RELAY_AUTH_SECRET: "a".repeat(40),
      PRACTICE_RELAY_LTI_SECRET: "b".repeat(40),
    } as NodeJS.ProcessEnv);
    assert.equal(strict.usingDevDefaults, false);
    const prod = resolveOpsSecrets({
      PRACTICE_RELAY_AUTH_SECRET: "a",
      PRACTICE_RELAY_LTI_SECRET: "b",
      SECRET_SOURCE: "kms-inject",
    } as NodeJS.ProcessEnv);
    assert.equal(prod.usingDevDefaults, false);
    assert.equal(prod.authSecret, "a");
    assert.equal(prod.secretSource, "kms-inject");
  });

  it("file backend reads secret files", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hub-secrets-"));
    try {
      writeFileSync(path.join(dir, "auth"), "file-auth-secret\n", "utf8");
      writeFileSync(path.join(dir, "lti"), "file-lti-secret\n", "utf8");
      const s = resolveOpsSecrets({
        SECRET_BACKEND: "file",
        SECRET_FILE_DIR: dir,
      } as NodeJS.ProcessEnv);
      assert.equal(s.secretBackend, "file");
      assert.equal(s.authSecret, "file-auth-secret");
      assert.equal(s.ltiSecret, "file-lti-secret");
      assert.equal(s.usingDevDefaults, false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("kms-stub decrypts base64 ciphertext with local key", () => {
    const key = kmsStubTestKey;
    const authCipher = kmsStubEncrypt("auth-from-kms", key);
    const ltiCipher = kmsStubEncrypt("lti-from-kms", key);
    const s = resolveOpsSecrets({
      SECRET_BACKEND: "kms-stub",
      KMS_STUB_KEY: key,
      PRACTICE_RELAY_AUTH_SECRET_CIPHER: authCipher,
      PRACTICE_RELAY_LTI_SECRET_CIPHER: ltiCipher,
    } as NodeJS.ProcessEnv);
    assert.equal(s.secretBackend, "kms-stub");
    assert.equal(s.authSecret, "auth-from-kms");
    assert.equal(s.ltiSecret, "lti-from-kms");
    assert.equal(s.usingDevDefaults, false);
  });

  it("kms-stub rejects a tampered authentication tag without disclosing secrets", () => {
    const key = kmsStubTestKey;
    const plaintext = "auth-from-kms";
    const tampered = Buffer.from(kmsStubEncrypt(plaintext, key), "base64");
    tampered[12] ^= 0x01;

    assert.throws(
      () =>
        resolveOpsSecrets({
          SECRET_BACKEND: "kms-stub",
          KMS_STUB_KEY: key,
          PRACTICE_RELAY_AUTH_SECRET_CIPHER: tampered.toString("base64"),
        } as NodeJS.ProcessEnv),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message.includes(plaintext), false);
        assert.equal(error.message.includes(key), false);
        return true;
      },
    );
  });

  it("kms-stub rejects ciphertexts shorter than iv, tag, and data", () => {
    assert.throws(
      () =>
        resolveOpsSecrets({
          SECRET_BACKEND: "kms-stub",
          KMS_STUB_KEY: kmsStubTestKey,
          PRACTICE_RELAY_AUTH_SECRET_CIPHER: Buffer.alloc(28).toString("base64"),
        } as NodeJS.ProcessEnv),
      /kms-stub ciphertext too short/,
    );
  });

  it("kms-stub requires KMS_STUB_KEY", () => {
    assert.throws(() =>
      resolveOpsSecrets({
        SECRET_BACKEND: "kms-stub",
        PRACTICE_RELAY_AUTH_SECRET_CIPHER: "AAAA",
      } as NodeJS.ProcessEnv),
    );
  });

  it("file backend with explicit secret file paths", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hub-secrets-paths-"));
    try {
      const authPath = path.join(dir, "a.secret");
      const ltiPath = path.join(dir, "l.secret");
      writeFileSync(authPath, "path-auth", "utf8");
      writeFileSync(ltiPath, "path-lti", "utf8");
      const s = resolveOpsSecrets({
        SECRET_BACKEND: "file",
        PRACTICE_RELAY_AUTH_SECRET_FILE: authPath,
        PRACTICE_RELAY_LTI_SECRET_FILE: ltiPath,
      } as NodeJS.ProcessEnv);
      assert.equal(s.authSecret, "path-auth");
      assert.equal(s.ltiSecret, "path-lti");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
