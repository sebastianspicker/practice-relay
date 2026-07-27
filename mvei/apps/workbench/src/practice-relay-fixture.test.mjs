/** Fixture tests: Practice Relay-loadable package has real Motif JSON. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMotif } from "./motif.mjs";
import { validateMotifAgainstSchema } from "./validate-motif.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** mvei/fixtures/practice-relay-loadable/ */
const FIXTURE_DIR = join(__dirname, "../../../fixtures/practice-relay-loadable");
const MANIFEST_PATH = join(FIXTURE_DIR, "manifest.json");
const MOTIF_PATH = join(FIXTURE_DIR, "motif.json");

test("Practice Relay-loadable fixture exists on disk", () => {
  assert.ok(existsSync(MANIFEST_PATH), `missing ${MANIFEST_PATH}`);
  assert.ok(existsSync(MOTIF_PATH), `missing ${MOTIF_PATH}`);
  assert.ok(existsSync(join(FIXTURE_DIR, "README.md")), "missing README.md");
});

test("fixture motif.json is real Motif JSON and validates against schema", () => {
  const raw = readFileSync(MOTIF_PATH, "utf8");
  assert.notEqual(raw.trim(), "mock");
  assert.doesNotMatch(raw, /^"mock"/);

  const doc = loadMotif(raw);
  assert.equal(doc.profile, "mvei-motif");
  assert.ok(
    doc.schemaVersion === "0.2.0" || doc.schemaVersion === "0.1.0-stub",
  );
  assert.ok(Array.isArray(doc.items));
  assert.ok(doc.items.length > 0, "fixture Motif should have real items, not empty mock");

  const result = validateMotifAgainstSchema(doc);
  assert.equal(result.ok, true, result.message);
});

test("fixture manifest has mveiRef and WorkRecord package required fields", () => {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));

  assert.equal(
    manifest.profile,
    "urn:practice-relay:profile:work-record-package:0.4",
  );
  assert.equal(typeof manifest.workRecordId, "string");
  assert.ok(manifest.workRecordId.length > 0);
  assert.equal(typeof manifest.title, "string");
  assert.ok(Array.isArray(manifest.tracks));
  assert.ok(manifest.tracks.length >= 1);
  assert.ok(Array.isArray(manifest.takes));
  assert.ok(manifest.consentSummary);
  assert.equal(typeof manifest.consentSummary.allTagged, "boolean");
  assert.ok(Array.isArray(manifest.consentSummary.purposes));

  assert.equal(manifest.mveiRef, "motif.json");

  const moveTrack = manifest.tracks.find((t) => t.type === "movement_notation");
  assert.ok(moveTrack, "tracks must include movement_notation");
  assert.equal(moveTrack.ref, "motif.json");
});
