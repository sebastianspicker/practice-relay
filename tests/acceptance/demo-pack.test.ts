/**
 * Demo pack acceptance - fixtures/demo through shipped domain, export, validator, and MvEI Workbench.
 * No re-implementation of validation; no hardcoded oracle without module imports.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDemoScoreFromSeed,
  runE2eDemo,
} from "../../scripts/e2e-demo.ts";
import {
  validateWorkRecordPackageManifest,
  validateRoCrateMetadata,
  WORK_RECORD_PACKAGE_PROFILE_URI,
  RO_CRATE_CONTEXT,
  exportWorkRecordPackage,
} from "@practice-relay/work-record-package";
import { validateMveiDocument } from "../../mvei/packages/validator/src/cli.ts";
import {
  loadMotif,
  emitMotif,
} from "../../mvei/apps/workbench/src/motif.mjs";
import { validateMotifAgainstSchema } from "../../mvei/apps/workbench/src/validate-motif.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const demoDir = join(root, "fixtures/demo");
const seedPath = join(demoDir, "work-record-seed.json");
const motifPath = join(demoDir, "motif.json");

test("demo pack files exist with multi-domain seed + Motif content", () => {
  assert.ok(existsSync(seedPath), "seed");
  assert.ok(existsSync(motifPath), "motif");
  assert.ok(existsSync(join(demoDir, "scenario.json")), "scenario");

  const seed = JSON.parse(readFileSync(seedPath, "utf8")) as {
    tracks: { type: string }[];
    takes: unknown[];
    preferredTakeId: string;
    consent: { purposes: string[] };
    comment: { regionId: string };
  };
  const types = new Set(seed.tracks.map((t) => t.type));
  assert.ok(types.size >= 4, `expected ≥4 track types, got ${types.size}`);
  assert.ok(seed.takes.length >= 1);
  assert.ok(seed.preferredTakeId);
  assert.ok(seed.consent.purposes.length >= 1);
  assert.ok(seed.comment.regionId);

  const motif = JSON.parse(readFileSync(motifPath, "utf8")) as {
    profile: string;
    items: unknown[];
  };
  assert.equal(motif.profile, "mvei-motif");
  assert.ok(motif.items.length > 0);
});

test("buildDemoScoreFromSeed uses hub-domain constructors", () => {
  const score = buildDemoScoreFromSeed();
  assert.equal(score.id, "ps-demo-week6-duet");
  assert.ok(score.tracks.length >= 4);
  assert.equal(score.preferredTakeId, "take-02");
  assert.ok(score.usePolicySnapshots.some((c) => c.purposes.includes("course_assessment")));
  assert.ok(score.comments.some((c) => c.resolved && c.regionId === "reg-phrase-a"));
  assert.ok(score.tracks.some((t) => t.type === "movement_notation"));
});

test("exportWorkRecordPackage on demo score validates work-record package + RO-Crate identity", () => {
  const score = buildDemoScoreFromSeed();
  const { manifest, roCrateMetadata, validated } = exportWorkRecordPackage(score);
  assert.equal(validated, true);
  assert.equal(manifest.profile, WORK_RECORD_PACKAGE_PROFILE_URI);
  assert.ok(manifest.profile.length > 0);
  const again = validateWorkRecordPackageManifest(manifest);
  assert.equal(again.ok, true, again.errors);

  const crate = validateRoCrateMetadata(roCrateMetadata);
  assert.equal(crate.ok, true, crate.errors);
  assert.equal(roCrateMetadata["@context"], RO_CRATE_CONTEXT);
  const root = roCrateMetadata["@graph"].find((n) => n["@id"] === "./") as
    | Record<string, unknown>
    | undefined;
  assert.ok(root);
  assert.equal(root["workRecord:workRecordId"], manifest.workRecordId);
  assert.equal(root["workRecord:mveiRef"], manifest.mveiRef);
  assert.deepEqual(
    root["workRecord:trackTypes"],
    manifest.tracks.map((t) => t.type),
  );
});

test("mvei-validate accepts demo Motif and rejects empty object", () => {
  const ok = validateMveiDocument(motifPath);
  assert.equal(ok.ok, true, ok.message);

  const dir = mkdtempSync(join(tmpdir(), "practice-relay-invalid-motif-"));
  try {
    const badPath = join(dir, "invalid-for-test.json");
    writeFileSync(badPath, "{}\n");
    const bad = validateMveiDocument(badPath);
    assert.equal(bad.ok, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("MvEI Workbench loadMotif/emitMotif/validateMotifAgainstSchema on demo Motif", () => {
  const raw = readFileSync(motifPath, "utf8");
  const doc = loadMotif(raw);
  assert.equal(doc.profile, "mvei-motif");
  const emitted = emitMotif(doc);
  const round = loadMotif(emitted);
  assert.equal(round.id, doc.id);
  const schema = validateMotifAgainstSchema(doc);
  assert.equal(schema.ok, true, schema.message);
});

test("runE2eDemo all steps ok via shipped modules", () => {
  const result = runE2eDemo();
  assert.equal(result.ok, true, result.logText);
  const ids = result.steps.map((s) => s.id);
  for (const need of [
    "practice-relay.lifecycle",
    "practice-relay.work-record-package-export",
    "practice-relay.multi-asset-assignment",
    "mvei.validate_valid",
    "mvei.validate_invalid",
    "mvei-workbench.load-emit",
    "mvei-workbench.motif-edit",
  ]) {
    assert.ok(ids.includes(need), `missing step ${need}`);
  }
  assert.ok(result.steps.every((s) => s.ok));
  // Log must reflect real outcomes, not a single hardcoded PASS
  assert.match(result.logText, /profile=/);
  assert.match(result.logText, /roCrate=/);
  assert.match(result.logText, /\[OK\] mvei\.validate_valid/);
  assert.match(result.logText, /\[OK\] mvei\.validate_invalid/);
  assert.match(result.logText, /\[OK\] practice-relay\.multi-asset-assignment/);
  assert.match(result.logText, /\[OK\] mvei-workbench\.motif-edit/);
});
