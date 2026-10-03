/** Cross-package acceptance contracts use only published package entrypoints. */
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  exportWorkRecordPackageZip,
  exportRecord,
  importOtioToRecordParts,
} from "@practice-relay/handoff";
import { isMotifSymbol, MOTIF_SYMBOLS, type MotifDocument } from "@practice-relay/movement";
import {
  addMember,
  addRepresentedSubject,
  addTake,
  addTrack,
  attachMveiMotifTrack,
  attachUsePolicySnapshot,
  createEmptyRecord,
  evaluateExportPolicy,
  setPreferredTake,
} from "@practice-relay/work-record";

test("released WorkRecord preserves identity, profile, and package layout across handoff JSON, RO-Crate, and ZIP", () => {
  const record = releasedRecord();
  const handoff = exportWorkRecordPackageZip(record);
  const crateRoot = handoff.roCrateMetadata["@graph"].find(
    (entity) => entity["@id"] === "./",
  );

  assert.equal(handoff.validated, true);
  assert.equal(handoff.manifest.workRecordId, record.id);
  assert.equal(handoff.manifest.preferredTakeId, "take-preferred");
  assert.deepEqual(handoff.manifest.tracks.map((track) => track.id), ["video-main", "score-main"]);
  assert.deepEqual(handoff.manifest.takes.map((take) => take.id), ["take-01", "take-preferred"]);
  assert.equal(handoff.manifest.profile, "urn:practice-relay:profile:work-record-package:0.4");
  assert.deepEqual(handoff.manifest.files.map((file) => file.path), [
    "manifest.json",
    "ro-crate-metadata.json",
  ]);
  assert.ok(crateRoot);
  assert.equal(crateRoot!["workRecord:workRecordId"], record.id);
  assert.equal(crateRoot!["workRecord:profile"], handoff.manifest.profile);
  assert.deepEqual(readZipEntryNames(handoff.zipBytes), [
    "manifest.json",
    "ro-crate-metadata.json",
  ]);
});

test("evidence grants remain fail-closed without invalidating an independent record release", () => {
  const base = releasedRecord();
  const record = {
    ...base,
    artifacts: [{ id: "performance-video", name: "Performance video", representedSubjectIds: ["performer-1"] }],
    usePolicies: [{
      id: "policy-denied-publication",
      representedSubjectId: "performer-1",
      purpose: "public-release",
      destination: "institutional-repository",
      state: "denied" as const,
      createdAt: "2026-08-01T00:00:00.000Z",
    }],
  };

  const denied = evaluateExportPolicy(record, {
    purpose: "public-release",
    destination: "institutional-repository",
  });
  const wrongDestination = evaluateExportPolicy(record, {
    purpose: "public-release",
    destination: "course-archive",
  });
  const release = evaluateExportPolicy(record, { mode: "record-release" });

  assert.deepEqual(denied, {
    allowed: false,
    policySource: "explicit",
    purpose: "public-release",
    destination: "institutional-repository",
    reasons: ["subject performer-1 denies or withdrew purpose public-release for institutional-repository"],
    includedArtifactIds: [],
  });
  assert.equal(wrongDestination.allowed, false);
  assert.equal(wrongDestination.policySource, "explicit");
  assert.match(wrongDestination.reasons[0]!, /no explicit grant/);
  assert.equal(release.allowed, true);
  assert.equal(release.policySource, "record-release");
  assert.equal(exportWorkRecordPackageZip(record).validated, true);
});

test("a public movement document and vocabulary can be referenced by WorkRecord and handed off as a neutral document reference", () => {
  const motif: MotifDocument = {
    schemaVersion: "0.2.0",
    profile: "mvei-motif",
    id: "motif-acceptance-01",
    completeness: "partial",
    items: [{ id: "item-1", symbol: MOTIF_SYMBOLS[0]!, order: 0 }],
  };
  const schemaRef = "@practice-relay/movement/schemas/mvei-motif.schema.json";
  const vocabularyRef = "@practice-relay/movement/vocabulary/motif-vocabulary.json";
  const schema = readPackageJsonAsset("@practice-relay/movement", "schemas/mvei-motif.schema.json");
  const vocabulary = readPackageJsonAsset("@practice-relay/movement", "vocabulary/motif-vocabulary.json");
  let record = createEmptyRecord("wr-movement-reference", "Movement reference handoff");
  record = attachMveiMotifTrack(record, { id: "motif-track", ref: schemaRef, label: motif.profile });
  record = attachUsePolicySnapshot(record, legacySnapshot());

  const handoff = exportWorkRecordPackageZip(record);
  const crateRoot = handoff.roCrateMetadata["@graph"].find((entity) => entity["@id"] === "./");

  assert.ok(isMotifSymbol(motif.items[0]!.symbol));
  assert.equal(schema.$id, "urn:mvei:schema:motif:0.2");
  assert.equal(vocabulary.profile, "mvei-motif-vocabulary");
  assert.ok(Array.isArray(vocabulary.symbols));
  assert.ok(vocabulary.symbols.some((symbol: { id?: unknown }) => symbol.id === motif.items[0]!.symbol));
  assert.equal(record.tracks[0]!.ref, schemaRef);
  assert.equal(handoff.manifest.mveiRef, schemaRef);
  assert.ok(handoff.manifest.mveiRef?.startsWith("@practice-relay/movement/"));
  assert.equal(crateRoot!["workRecord:mveiRef"], schemaRef);
  assert.equal(vocabularyRef, "@practice-relay/movement/vocabulary/motif-vocabulary.json");
});

test("lossy OTIO projection returns stable warning metadata instead of silently discarding unsupported data", () => {
  const imported = importOtioToRecordParts({
    OTIO_SCHEMA: "Timeline.1",
    name: "Lossy import",
    metadata: { workRecordId: "wr-lossy" },
    markers: [{ OTIO_SCHEMA: "Marker.1" }],
    tracks: {
      OTIO_SCHEMA: "Stack.1",
      children: [{
        OTIO_SCHEMA: "Track.1",
        name: "Video",
        children: [
          { OTIO_SCHEMA: "Gap.1" },
          { OTIO_SCHEMA: "UnsupportedThing.1" },
        ],
      }],
    },
  });

  assert.equal(imported.workRecordId, "wr-lossy");
  assert.equal(imported.tracks.length, 1);
  assert.deepEqual(imported.warnings.map((warning) => warning.code), [
    "UNSUPPORTED_OTIO_NODE",
    "GAP_SKIPPED",
    "MARKERS_NOT_IMPORTED",
  ]);
  assert.ok(imported.warnings.every((warning) => warning.message.length > 0));
});

test("public interop exports report deterministic WorkRecord field losses", () => {
  const record = releasedRecord();
  const expectedCodes = {
    "otio-json": "OTIO_WORK_RECORD_FIELD_OMISSIONS",
    eaf: "EAF_WORK_RECORD_FIELD_OMISSIONS",
    "osc-cue-map": "OSC_CUE_MAP_WORK_RECORD_FIELD_OMISSIONS",
    "musicxml-ref": "MUSICXML_REF_WORK_RECORD_FIELD_OMISSIONS",
  } as const;

  for (const [format, code] of Object.entries(expectedCodes)) {
    const result = exportRecord(record, format as keyof typeof expectedCodes);
    assert.deepEqual(result.losses.map((loss) => loss.code), [code]);
    assert.ok(result.losses[0]!.message.length > 0);
    assert.ok(result.losses[0]!.omittedFields.length > 0);
  }

  const otioLoss = exportRecord(record, "otio-json").losses[0]!;
  assert.ok(otioLoss.omittedFields.includes("actors"));
  assert.ok(otioLoss.omittedFields.includes("artifacts"));
  assert.ok(otioLoss.omittedFields.includes("usePolicies"));
  assert.ok(otioLoss.omittedFields.includes("spine.markers"));
  assert.ok(exportRecord(record, "eaf").losses[0]!.omittedFields.includes("comments[].resolved"));
  assert.ok(exportRecord(record, "osc-cue-map").losses[0]!.omittedFields.includes("tracks[non-cue]"));
  assert.ok(exportRecord(record, "musicxml-ref").losses[0]!.omittedFields.includes("tracks[non-music]"));
});

test("movement toolkit retains each published CLI bin name and every bin target exists", () => {
  const manifestPath = packageManifestPath("@practice-relay/movement-toolkit");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    bin?: Record<string, string>;
  };
  const expectedBins = [
    "mvei-validate",
    "mvei-engrave",
    "mvei-labanwriter-import",
    "mvei-reference-read",
  ];

  assert.deepEqual(Object.keys(manifest.bin ?? {}).sort(), expectedBins.sort());
  for (const name of expectedBins) {
    const target = manifest.bin?.[name];
    assert.equal(typeof target, "string", `${name} must have a string bin target`);
    assert.equal(statSync(resolve(dirname(manifestPath), target!)).isFile(), true, `${name} target must exist`);
  }
});

function releasedRecord() {
  let record = createEmptyRecord("wr-acceptance-01", "Canonical acceptance WorkRecord");
  record = addMember(record, { userId: "performer-1", role: "student" });
  record = addRepresentedSubject(record, {
    id: "performer-1",
    type: "Person",
    label: "Performer",
  });
  record = addTrack(record, { id: "video-main", type: "video", label: "Performance", ref: "media/performance.mp4" });
  record = addTrack(record, { id: "score-main", type: "music_notation", label: "Score", ref: "notation/piece.musicxml" });
  record = addTake(record, { id: "take-01", label: "First take", mediaPath: "media/take-01.mp4" });
  record = addTake(record, { id: "take-preferred", label: "Preferred take", mediaPath: "media/take-preferred.mp4" });
  record = setPreferredTake(record, "take-preferred");
  return attachUsePolicySnapshot(record, legacySnapshot());
}

function legacySnapshot() {
  return {
    id: "legacy-consent-01",
    subjectId: "performer-1",
    purposes: ["course-assessment"],
    exportAllowed: true,
    createdAt: "2026-08-01T00:00:00.000Z",
  };
}

function readZipEntryNames(bytes: Buffer): string[] {
  const names: string[] = [];
  let offset = 0;
  while (offset < bytes.length && bytes.readUInt32LE(offset) === 0x04034b50) {
    const nameLength = bytes.readUInt16LE(offset + 26);
    const dataLength = bytes.readUInt32LE(offset + 18);
    names.push(bytes.subarray(offset + 30, offset + 30 + nameLength).toString("utf8"));
    offset += 30 + nameLength + dataLength;
  }
  return names;
}

function readPackageJsonAsset(packageSpecifier: string, assetPath: string): Record<string, unknown> {
  const packageRoot = dirname(packageManifestPath(packageSpecifier));
  return JSON.parse(readFileSync(resolve(packageRoot, assetPath), "utf8")) as Record<string, unknown>;
}

function packageManifestPath(packageSpecifier: string): string {
  return fileURLToPath(import.meta.resolve(`${packageSpecifier}/package.json`));
}
