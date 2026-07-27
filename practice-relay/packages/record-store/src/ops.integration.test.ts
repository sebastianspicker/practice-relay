/**
 * Integration: durable store restart + backup + audit (real entry createDurableRecordStore).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createEmptyRecord,
  addTrack,
  addMember,
  addTake,
} from "@practice-relay/work-record-core";
import { createDurableRecordStore } from "./index.ts";

describe("ops integration", () => {
  it("multi-user record survives reopen and backup", () => {
    const root = mkdtempSync(path.join(tmpdir(), "ops-int-"));
    try {
      const a = createDurableRecordStore({ rootDir: root });
      let record = createEmptyRecord("ps-ops", "Ops multi-user");
      record = addMember(record, { userId: "teacher-1", role: "faculty" });
      record = addMember(record, { userId: "student-1", role: "student" });
      record = addTrack(record, { id: "v", type: "video", ref: "m.mp4" });
      record = addTake(record, { id: "t1", label: "Take 1" });
      a.create(record);
      a.appendEvent("ps-ops", "export", "zip", "teacher-1");

      const b = createDurableRecordStore({ rootDir: root });
      const loaded = b.get("ps-ops");
      assert.ok(loaded);
      assert.equal(loaded!.members.length, 2);
      assert.equal(b.listByMember("student-1").length, 1);
      const audit = b.listAllEvents();
      assert.ok(audit.some((e) => e.kind === "export"));

      const bak = b.backup();
      assert.ok(existsSync(path.join(bak.backupDir, "backup-manifest.json")));
      const man = JSON.parse(
        readFileSync(path.join(bak.backupDir, "backup-manifest.json"), "utf8"),
      );
      assert.equal(man.recordCount, 1);
      assert.ok(man.recordIds.includes("ps-ops"));

      const metrics = b.healthMetrics();
      assert.equal(metrics.recordCount, 1);
      assert.ok(metrics.auditEventCount >= 1);

      const restoreRoot = mkdtempSync(path.join(tmpdir(), "ops-restore-"));
      try {
        const c = createDurableRecordStore({ rootDir: restoreRoot });
        c.restoreFromBackup(bak.backupDir);
        assert.ok(c.get("ps-ops"));
        assert.equal(c.listByMember("student-1").length, 1);
      } finally {
        rmSync(restoreRoot, { recursive: true, force: true });
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
