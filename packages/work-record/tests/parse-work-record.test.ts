/** Differential schema-boundary tests for complete WorkRecord documents. */
import assert from "node:assert/strict";
import test from "node:test";
import {
  addTake,
  addTrack,
  attachUsePolicySnapshot,
  assertWorkRecord,
  createEmptyRecord,
  parseWorkRecord,
  validateWorkRecord,
} from "../src/index.ts";

function completeRecord(): ReturnType<typeof createEmptyRecord> {
  let record = createEmptyRecord("record-parse", "Schema boundary");
  record = addTrack(record, { id: "track-video", type: "video", ref: "media/run.mp4" });
  record = addTake(record, { id: "take-1", mediaPath: "media/run.mp4", byteSize: 1 });
  record = attachUsePolicySnapshot(record, {
    id: "snapshot-1",
    subjectId: "student-1",
    purposes: ["course_assessment"],
    exportAllowed: true,
    createdAt: "2026-08-29T00:00:00.000Z",
  });
  return {
    ...record,
    revision: 3,
    members: [{ userId: "student-1", role: "student" }],
    representedSubjects: [{
      id: "student-1",
      type: "Person",
      label: "Student",
    }],
    spine: {
      schemaVersion: "0.1.0",
      mode: "hybrid",
      durationMs: 1_000,
      meter: { tempoBpm: 120, timeSignature: "4/4" },
      markers: [{ id: "marker-1", tMs: 0, label: "Start" }],
      regions: [{ id: "region-1", startMs: 0, endMs: 1_000 }],
    },
    usePolicies: [{
      id: "grant-1",
      representedSubjectId: "student-1",
      purpose: "course_assessment",
      destination: "lms",
      state: "granted",
      createdAt: "2026-08-29T00:00:00.000Z",
    }],
  };
}

function clone(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

test("parseWorkRecord accepts complete nested WorkRecord values", () => {
  const value = clone(completeRecord());
  assert.deepEqual(parseWorkRecord(value), value);
  assert.doesNotThrow(() => assertWorkRecord(value));
  assert.doesNotThrow(() => validateWorkRecord(value as never));
});

test("parseWorkRecord rejects every malformed nested contract in the matrix", () => {
  const cases: Array<[string, (record: Record<string, unknown>) => void]> = [
    ["member", (record) => { (record.members as unknown[])[0] = { userId: 42, role: "student" }; }],
    ["track", (record) => { (record.tracks as unknown[])[0] = { id: "track-video", type: "unknown" }; }],
    ["hybrid spine without meter", (record) => { delete (record.spine as Record<string, unknown>).meter; }],
    ["absolute spine with meter", (record) => { record.spine = { ...(record.spine as object), mode: "absolute" }; }],
    ["meter", (record) => { (record.spine as Record<string, unknown>).meter = { tempoBpm: 0, timeSignature: "4/4" }; }],
    ["take", (record) => { (record.takes as unknown[])[0] = { id: "take-1", unexpected: true }; }],
    ["policy", (record) => { (record.usePolicies as unknown[])[0] = { id: "grant-1", state: "maybe" }; }],
    ["top-level extra property", (record) => { record.unexpected = true; }],
    ["negative revision", (record) => { record.revision = -1; }],
    ["fractional revision", (record) => { record.revision = 1.5; }],
    ["unsafe revision", (record) => { record.revision = 9_007_199_254_740_992; }],
  ];

  for (const [name, mutate] of cases) {
    const value = clone(completeRecord());
    mutate(value);
    assert.throws(() => parseWorkRecord(value), /invalid WorkRecord/, name);
  }
  assert.throws(
    () => validateWorkRecord({ ...completeRecord(), unexpected: true } as never),
    /invalid WorkRecord/,
  );
});

test("parseWorkRecord rejects impossible aggregate states with stable errors", () => {
  const cases: Array<[string, (record: Record<string, unknown>) => void, RegExp]> = [
    ["reversed region", (record) => {
      const region = ((record.spine as Record<string, unknown>).regions as Array<Record<string, unknown>>)[0]!;
      region.startMs = 1_000;
      region.endMs = 1;
    }, /invalid WorkRecord: region times must be finite, nonnegative, and end after start/],
    ["zero-length region", (record) => { ((record.spine as Record<string, unknown>).regions as Array<Record<string, unknown>>)[0]!.endMs = 0; }, /invalid WorkRecord: region times must be finite, nonnegative, and end after start/],
    ["duplicate region", (record) => { ((record.spine as Record<string, unknown>).regions as unknown[]).push({ id: "region-1", startMs: 1_000, endMs: 2_000 }); }, /invalid WorkRecord: duplicate region id: region-1/],
    ["duplicate track", (record) => { (record.tracks as unknown[]).push(structuredClone((record.tracks as unknown[])[0])); }, /invalid WorkRecord: duplicate track id: track-video/],
    ["duplicate take id", (record) => { (record.takeIds as string[]).push("take-1"); }, /invalid WorkRecord: duplicate takeId: take-1/],
    ["unindexed rich take", (record) => { record.takeIds = []; }, /invalid WorkRecord: take id is missing from takeIds: take-1/],
    ["missing preferred take", (record) => { record.preferredTakeId = "take-missing"; }, /invalid WorkRecord: preferredTakeId not found: take-missing/],
    ["duplicate member", (record) => { (record.members as unknown[]).push(structuredClone((record.members as unknown[])[0])); }, /invalid WorkRecord: duplicate member userId: student-1/],
    ["orphan comment region", (record) => { record.comments = [{ id: "comment-1", regionId: "missing", authorId: "student-1", body: "Note", resolved: false, createdAt: "2026-08-29T00:00:00.000Z" }]; }, /invalid WorkRecord: comment region not found: missing/],
    ["orphan comment track", (record) => { record.comments = [{ id: "comment-1", regionId: "region-1", trackId: "missing", authorId: "student-1", body: "Note", resolved: false, createdAt: "2026-08-29T00:00:00.000Z" }]; }, /invalid WorkRecord: comment track not found: missing/],
    ["duplicate comment", (record) => { record.comments = [{ id: "comment-1", regionId: "region-1", authorId: "student-1", body: "Note", resolved: false, createdAt: "2026-08-29T00:00:00.000Z" }, { id: "comment-1", regionId: "region-1", authorId: "student-1", body: "Again", resolved: false, createdAt: "2026-08-29T00:00:00.000Z" }]; }, /invalid WorkRecord: duplicate comment id: comment-1/],
    ["duplicate snapshot", (record) => { record.snapshots = [{ id: "snapshot-1", createdAt: "2026-08-29T00:00:00.000Z", artifactIds: [] }, { id: "snapshot-1", createdAt: "2026-08-29T00:00:00.000Z", artifactIds: [] }]; }, /invalid WorkRecord: duplicate snapshot id: snapshot-1/],
    ["orphan snapshot artifact", (record) => { record.snapshots = [{ id: "snapshot-1", createdAt: "2026-08-29T00:00:00.000Z", artifactIds: ["missing"] }]; }, /invalid WorkRecord: snapshot artifact not found: missing/],
    ["orphan version snapshot", (record) => { record.versions = [{ id: "version-1", name: "Submission", createdAt: "2026-08-29T00:00:00.000Z", snapshotRef: "missing" }]; }, /invalid WorkRecord: version snapshot not found: missing/],
    ["orphan artifact subject", (record) => { record.artifacts = [{ id: "artifact-1", name: "Artifact", representedSubjectIds: ["missing"] }]; }, /invalid WorkRecord: artifact represented subject not found: missing/],
    ["orphan policy subject", (record) => { (record.usePolicies as Array<Record<string, unknown>>)[0]!.representedSubjectId = "missing"; }, /invalid WorkRecord: use policy represented subject not found: missing/],
    ["orphan relation subject", (record) => { record.relations = [{ subjectId: "missing", predicate: "references", objectId: "track-video" }]; }, /invalid WorkRecord: relation subject not found: missing/],
    ["orphan relation object", (record) => { record.relations = [{ subjectId: "track-video", predicate: "references", objectId: "missing" }]; }, /invalid WorkRecord: relation object not found: missing/],
  ];

  for (const [name, mutate, expected] of cases) {
    const value = clone(completeRecord());
    mutate(value);
    assert.throws(() => parseWorkRecord(value), expected, name);
  }
});

test("parseWorkRecord preserves the supported identifier-only take shape", () => {
  const value = clone(completeRecord());
  value.takes = [];
  value.takeIds = ["legacy-take"];
  value.preferredTakeId = "legacy-take";
  assert.deepEqual(parseWorkRecord(value), value);
});

test("parseWorkRecord accepts coherent version and artifact references", () => {
  const value = clone(completeRecord());
  value.artifacts = [{ id: "artifact-1", name: "Performance" }];
  value.iterations = [{ id: "iteration-1", createdAt: "2026-08-29T00:00:00.000Z", artifactIds: ["artifact-1"] }];
  value.snapshots = [{ id: "snapshot-1", createdAt: "2026-08-29T00:00:00.000Z", artifactIds: ["artifact-1"] }];
  value.versions = [{ id: "version-1", name: "Submission", createdAt: "2026-08-29T00:00:00.000Z", snapshotRef: "snapshot-1" }];
  assert.deepEqual(parseWorkRecord(value), value);
});
