/** Durable-store no-follow and replacement safety contracts. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  lstatSync,
  linkSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createEmptyRecord } from "@practice-relay/work-record";
import { createDurableRecordStore } from "./index.ts";
import {
  appendPrivateFile,
  readRegularFile,
  removeManagedDirectory,
  removeRegularFile,
  writePrivateFileAtomic,
} from "./store-paths.ts";

describe("durable record-store filesystem safety", () => {
  it("rejects pre-existing managed directory symlinks without touching their targets", () => {
    const root = mkdtempSync(path.join(tmpdir(), "hub-store-link-root-"));
    const external = mkdtempSync(path.join(tmpdir(), "hub-store-link-external-"));
    const sentinel = path.join(external, "sentinel.txt");
    try {
      writeFileSync(sentinel, "outside", "utf8");
      symlinkSync(external, path.join(root, "records"), "dir");
      assert.throws(
        () => createDurableRecordStore({ rootDir: root }),
        /managed directory is not a real directory/i,
      );
      assert.equal(readFileSync(sentinel, "utf8"), "outside");
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(external, { recursive: true, force: true });
    }
  });

  it("rejects group-writable configured roots without changing their ancestors", () => {
    const root = mkdtempSync(path.join(tmpdir(), "hub-store-untrusted-root-"));
    try {
      chmodSync(root, 0o770);
      assert.throws(
        () => createDurableRecordStore({ rootDir: root }),
        /group or world writable/i,
      );
    } finally {
      chmodSync(root, 0o700);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects final record and event symlinks without reading or appending external bytes", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "hub-store-link-file-"));
    const external = mkdtempSync(path.join(tmpdir(), "hub-store-link-target-"));
    const recordTarget = path.join(external, "record.json");
    const eventTarget = path.join(external, "event.jsonl");
    try {
      const store = createDurableRecordStore({ rootDir: root });
      writeFileSync(recordTarget, '{"outside":true}', "utf8");
      writeFileSync(eventTarget, "outside-event\n", "utf8");
      symlinkSync(recordTarget, path.join(root, "records", "ps-link.json"), "file");
      symlinkSync(eventTarget, path.join(root, "events", "ps-link.jsonl"), "file");
      await assert.rejects(async () => (await store.get("ps-link")), /regular file/i);
      await assert.rejects(async () => (await store.delete("ps-link")), /regular file/i);
      await assert.rejects(async () => (await store.appendEvent("ps-link", "export")), /regular file/i);
      assert.equal(readFileSync(recordTarget, "utf8"), '{"outside":true}');
      assert.equal(readFileSync(eventTarget, "utf8"), "outside-event\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(external, { recursive: true, force: true });
    }
  });

  it("rejects a replaced live managed directory without touching its target", async () => {
    const sourceRoot = mkdtempSync(path.join(tmpdir(), "hub-store-restore-source-"));
    const liveRoot = mkdtempSync(path.join(tmpdir(), "hub-store-restore-live-"));
    const external = mkdtempSync(path.join(tmpdir(), "hub-store-restore-external-"));
    const sentinel = path.join(external, "sentinel.txt");
    try {
      const source = createDurableRecordStore({ rootDir: sourceRoot });
      (await source.create(createEmptyRecord("ps-restore-race", "Backup")));
      const backup = (await source.backup());
      const live = createDurableRecordStore({ rootDir: liveRoot });
      (await live.create(createEmptyRecord("ps-live-race", "Live")));
      writeFileSync(sentinel, "outside", "utf8");
      rmSync(path.join(liveRoot, "records"), { recursive: true, force: true });
      symlinkSync(external, path.join(liveRoot, "records"), "dir");
      await assert.rejects(
        async () => (await live.restoreFromBackup(backup.backupDir)),
        /managed directory is not a real directory/i,
      );
      assert.equal(readFileSync(sentinel, "utf8"), "outside");
    } finally {
      rmSync(sourceRoot, { recursive: true, force: true });
      rmSync(liveRoot, { recursive: true, force: true });
      rmSync(external, { recursive: true, force: true });
    }
  });

  it("uses atomic private files without leaving record temporaries", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "hub-store-atomic-"));
    try {
      const store = createDurableRecordStore({ rootDir: root });
      const created = (await store.create(createEmptyRecord("ps-atomic", "First")));
      (await store.update("ps-atomic", { ...created, title: "Second" }));
      assert.equal((await store.get("ps-atomic"))?.title, "Second");
      assert.equal(
        readdirSync(path.join(root, "records")).some((name) => name.endsWith(".tmp")),
        false,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("exercises the validated identity fallback before filesystem access", () => {
    const root = mkdtempSync(path.join(tmpdir(), "hub-store-fallback-"));
    const filePath = path.join(root, "record.json");
    try {
      writeFileSync(filePath, "safe", "utf8");
      assert.equal(readRegularFile(filePath, { forceIdentityFallback: true }).toString(), "safe");
      assert.throws(
        () => readRegularFile(path.join(root, "missing"), { forceIdentityFallback: false } as never),
        /invalid store path test options/i,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects hardlinked managed files without exposing or mutating external content", () => {
    const root = mkdtempSync(path.join(tmpdir(), "hub-store-hardlink-root-"));
    const external = mkdtempSync(path.join(tmpdir(), "hub-store-hardlink-external-"));
    const externalFile = path.join(external, "outside.json");
    const managed = path.join(root, "record.json");
    try {
      writeFileSync(externalFile, "outside", "utf8");
      linkSync(externalFile, managed);
      assert.throws(() => readRegularFile(managed), /singly linked/i);
      assert.throws(() => appendPrivateFile(managed, "mutate"), /singly linked/i);
      assert.throws(() => removeRegularFile(managed), /singly linked/i);
      assert.equal(readFileSync(externalFile, "utf8"), "outside");
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(external, { recursive: true, force: true });
    }
  });

  it("rejects replacements between validation and descriptor open or publication", () => {
    const root = mkdtempSync(path.join(tmpdir(), "hub-store-open-race-"));
    const external = mkdtempSync(path.join(tmpdir(), "hub-store-open-external-"));
    const managed = path.join(root, "record.json");
    const externalFile = path.join(external, "outside.json");
    try {
      writeFileSync(managed, "safe", "utf8");
      writeFileSync(externalFile, "outside", "utf8");
      assert.throws(
        () => readRegularFile(managed, {
          afterValidation: () => {
            unlinkSync(managed);
            symlinkSync(externalFile, managed, "file");
          },
        }),
      );
      unlinkSync(managed);
      assert.throws(
        () => writePrivateFileAtomic(managed, "safe", {
          afterValidation: () => symlinkSync(externalFile, managed, "file"),
        }),
        /regular file|changed before publication/i,
      );
      assert.equal(readFileSync(externalFile, "utf8"), "outside");
      assert.equal(readdirSync(root).some((name) => name.endsWith(".tmp")), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(external, { recursive: true, force: true });
    }
  });

  it("rolls mismatched restore-removal quarantines back without touching external files or trees", () => {
    const root = mkdtempSync(path.join(tmpdir(), "hub-store-remove-race-"));
    const external = mkdtempSync(path.join(tmpdir(), "hub-store-remove-external-"));
    const filePath = path.join(root, "record.json");
    const sentinel = path.join(external, "sentinel.txt");
    try {
      writeFileSync(filePath, "safe", "utf8");
      writeFileSync(sentinel, "outside", "utf8");
      assert.throws(
        () => removeRegularFile(filePath, {
          afterValidation: () => {
            unlinkSync(filePath);
            symlinkSync(sentinel, filePath, "file");
          },
        }),
        /changed before removal/i,
      );
      assert.equal(lstatSync(filePath).isSymbolicLink(), true);
      rmSync(filePath);
      writeFileSync(filePath, "safe", "utf8");
      const replacement = path.join(external, "replacement.json");
      writeFileSync(replacement, "outside-two", "utf8");
      assert.throws(
        () => removeRegularFile(filePath, {
          afterValidation: () => {
            unlinkSync(filePath);
            linkSync(replacement, filePath);
          },
        }),
        /changed before removal/i,
      );
      assert.equal(lstatSync(filePath).isFile(), true);
      assert.equal(readFileSync(replacement, "utf8"), "outside-two");
      assert.throws(
        () => removeManagedDirectory(root, {
          afterValidation: () => {
            rmSync(root, { recursive: true, force: true });
            symlinkSync(external, root, "dir");
          },
        }),
        /changed before removal/i,
      );
      assert.equal(lstatSync(root).isSymbolicLink(), true);
      assert.equal(readFileSync(sentinel, "utf8"), "outside");
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(external, { recursive: true, force: true });
    }
  });
});
