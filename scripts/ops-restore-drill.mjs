#!/usr/bin/env node
/**
 * JSON tenant-prefix backup SLO drill without Docker or MinIO.
 *
 * Drives real @practice-relay/record-store code:
 *   create records → backup → wipe → restore → assert counts + path separation
 *
 * Run: pnpm test:ops-restore
 *      node --import tsx scripts/ops-restore-drill.mjs
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createEmptyRecord, addMember, addTrack } from "@practice-relay/work-record-core";
import {
  createDurableRecordStore,
  createStoreFromEnv,
} from "../practice-relay/packages/record-store/src/index.ts";

function wipeLiveRecords(store) {
  const ids = store.list().map((s) => s.id);
  for (const id of ids) {
    store.delete(id);
  }
  // Also clear record files if any orphan remains under records/.
  const recordsDir = path.join(store.rootDir, "records");
  if (existsSync(recordsDir)) {
    for (const name of readdirSync(recordsDir)) {
      if (name.endsWith(".json")) {
        unlinkSync(path.join(recordsDir, name));
      }
    }
  }
  // Force empty list via new instance is handled by caller re-open when needed
  return ids.length;
}

function main() {
  const root = mkdtempSync(path.join(tmpdir(), "ops-restore-drill-"));
  const started = Date.now();
  console.log(JSON.stringify({ msg: "ops-restore-drill start", root }));

  try {
    // ── Tenant A: two records ────────────────────────────────────────────
    const tenantA = createDurableRecordStore({
      rootDir: root,
      tenantId: "course-a",
    });
    let s1 = createEmptyRecord("ps-drill-1", "Drill record 1");
    s1 = addMember(s1, { userId: "faculty-1", role: "faculty" });
    s1 = addTrack(s1, { id: "v", type: "video", ref: "media/t1.mp4" });
    tenantA.create(s1);

    let s2 = createEmptyRecord("ps-drill-2", "Drill record 2");
    s2 = addMember(s2, { userId: "student-1", role: "student" });
    tenantA.create(s2);
    tenantA.appendEvent("ps-drill-1", "export", "zip", "faculty-1");

    assert.equal(tenantA.list().length, 2, "tenant A should have 2 records");

    // ── Tenant B: one record (path-separation witness) ───────────────────
    const tenantB = createDurableRecordStore({
      rootDir: root,
      tenantId: "course-b",
    });
    tenantB.create(createEmptyRecord("ps-other", "Other tenant"));
    assert.equal(tenantB.list().length, 1);
    assert.equal(
      tenantB.get("ps-drill-1"),
      undefined,
      "tenant B must not see tenant A records",
    );

    // ── Backup tenant A ──────────────────────────────────────────────────
    const bak = tenantA.backup();
    assert.ok(bak.backupDir);
    assert.equal(bak.recordCount, 2);
    assert.ok(existsSync(path.join(bak.backupDir, "backup-manifest.json")));
    assert.equal(bak.tenantId, "course-a");
    console.log(
      JSON.stringify({
        msg: "backup ok",
        backupDir: bak.backupDir,
        recordCount: bak.recordCount,
        tenantId: bak.tenantId,
      }),
    );

    // ── Wipe tenant A live data ──────────────────────────────────────────
    const wiped = wipeLiveRecords(tenantA);
    // reopen to clear in-memory cache after file unlink of orphans
    const tenantAAfterWipe = createDurableRecordStore({
      rootDir: root,
      tenantId: "course-a",
    });
    assert.equal(
      tenantAAfterWipe.list().length,
      0,
      "after wipe tenant A must be empty",
    );
    console.log(JSON.stringify({ msg: "wipe ok", wiped }));

    // ── Restore ──────────────────────────────────────────────────────────
    const restored = tenantAAfterWipe.restoreFromBackup(bak.backupDir);
    assert.ok(restored.recordIds.includes("ps-drill-1"));
    assert.ok(restored.recordIds.includes("ps-drill-2"));
    assert.equal(
      tenantAAfterWipe.list().length,
      2,
      "restore must recover 2 records",
    );
    assert.ok(tenantAAfterWipe.get("ps-drill-1"));
    assert.equal(tenantAAfterWipe.get("ps-drill-1")?.title, "Drill record 1");
    assert.ok(
      tenantAAfterWipe.listAllEvents().some((e) => e.kind === "restore"),
    );

    // ── Tenant B untouched ───────────────────────────────────────────────
    const tenantB2 = createDurableRecordStore({
      rootDir: root,
      tenantId: "course-b",
    });
    assert.equal(tenantB2.list().length, 1);
    assert.ok(tenantB2.get("ps-other"));

    // ── Factory path preserves the tenant prefix ─────────────────────────
    const viaEnv = createStoreFromEnv({
      env: {
        PRACTICE_RELAY_STORE: "json",
        PRACTICE_RELAY_DATA: root,
        PRACTICE_RELAY_TENANT_ID: "course-a",
      },
    });
    assert.equal(viaEnv.backend, "json");
    assert.equal(viaEnv.list().length, 2);

    const ms = Date.now() - started;
    console.log(
      JSON.stringify({
        msg: "ops-restore-drill pass",
        recordCount: 2,
        tenantBRecordCount: 1,
        rtoMs: ms,
        // Lab RTO target is hours; this is a unit drill, not wall-clock RTO claim
        note: "unit drill only - not multi-campus RTO certification",
      }),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

main();
