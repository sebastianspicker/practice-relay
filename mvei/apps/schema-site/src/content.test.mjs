/** Contract checks for the structured MvEI schema-site content. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BRAND,
  CAPTURE_PREFERENCE,
  CO_TIMELINE,
  COMPANIONS,
  CONSORTIUM_SEED,
  CORPUS_INDEX,
  CORPUS_SAMPLES,
  MIGRATION,
  NON_CLAIMS,
  PROFILES,
  getSiteCopy,
  hasCapturePreference,
  hasConsortiumSeed,
  listsCorpus,
} from "./content.mjs";

test("declares the MvEI identity and separate companion surfaces", () => {
  assert.deepEqual(BRAND, {
    short: "MvEI",
    full: "Movement Encoding Initiative",
    tagline: "Schema profiles, validators, and fixtures for movement records.",
  });
  assert.deepEqual(
    COMPANIONS.map(({ name, role }) => [name, role]),
    [
      ["MvEI Workbench", "authoring workbench"],
      ["Practice Relay", "handoff application"],
    ],
  );
  assert.deepEqual(NON_CLAIMS, [
    "Not first browser Laban editor.",
    "Not LabanLite.",
    "Not MARC 358.",
  ]);
});

test("declares current profiles and the full-Laban non-claim", () => {
  assert.deepEqual(
    PROFILES.map(({ id, status }) => [id, status]),
    [
      ["mvei-motif", "0.2.0"],
      ["mvei-laban-subset", "0.2.0"],
      ["movement_annotation", "v0"],
      ["mvei-laban", "not implemented"],
    ],
  );
});

test("lists declared corpus samples and links the authoritative catalogue", () => {
  assert.equal(
    CORPUS_INDEX.path,
    "packages/movement-encode/fixtures/corpus/index.json",
  );
  assert.deepEqual(
    listsCorpus(),
    CORPUS_SAMPLES.map(({ id }) => id),
  );
  assert.equal(new Set(listsCorpus()).size, CORPUS_SAMPLES.length);
});

test("preserves capture, governance, migration, and co-timeline boundaries", () => {
  assert.equal(hasCapturePreference(), true);
  assert.deepEqual(CAPTURE_PREFERENCE.acceptedSources, [
    "opencap",
    "mediapipe",
    "pose2sim",
    "other",
  ]);
  assert.match(CAPTURE_PREFERENCE.conversion, /source plugin_pose/);
  assert.match(CAPTURE_PREFERENCE.conversion, /quality sketch/);

  assert.equal(hasConsortiumSeed(), true);
  assert.equal(CONSORTIUM_SEED.minOrgs, 2);
  assert.equal(CONSORTIUM_SEED.doc, "mvei/docs/consortium-seed.md");
  assert.equal(MIGRATION.doc, "mvei/docs/labanwriter-migration.md");
  assert.equal(CO_TIMELINE.doc, "mvei/docs/co-timeline-annex.md");
  assert.equal(
    CO_TIMELINE.schema,
    "packages/movement-encode/schemas/music-co-timeline-annex.schema.json",
  );
});

test("returns the complete structured site-copy contract", () => {
  const copy = getSiteCopy();
  assert.equal(copy.brand, BRAND);
  assert.equal(copy.companions, COMPANIONS);
  assert.equal(copy.profiles, PROFILES);
  assert.equal(copy.corpusSamples, CORPUS_SAMPLES);
  assert.equal(copy.corpusIndex, CORPUS_INDEX);
  assert.equal(copy.nonClaims, NON_CLAIMS);
  assert.equal(copy.capturePreference, CAPTURE_PREFERENCE);
  assert.equal(copy.consortiumSeed, CONSORTIUM_SEED);
  assert.equal(copy.migration, MIGRATION);
  assert.equal(copy.coTimeline, CO_TIMELINE);
});
