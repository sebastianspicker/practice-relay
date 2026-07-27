/** Unit tests for @practice-relay/work-record-core - record lifecycle and roles. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addComment,
  addMember,
  addRegion,
  addTake,
  addTrack,
  annotationTrackLabel,
  assertCanExport,
  assertCanMutate,
  attachUsePolicySnapshot,
  attachMveiMotifTrack,
  attachMusicNotationTrack,
  canMutate,
  createEmptyRecord,
  createRecordStore,
  FORBIDDEN_STRINGS,
  getVersionTag,
  hasExportableUsePolicy,
  resolveComment,
  WORK_RECORD_SCHEMA_VERSION,
  setPreferredTake,
  submitVersion,
  validateRecordCoTimeline,
} from "../src/index.ts";

test("createEmptyRecord sets annotation capability not mvei", () => {
  const s = createEmptyRecord("ps-1", "Test");
  assert.equal(s.movementCapability, "annotation");
  assert.equal(s.schemaVersion, WORK_RECORD_SCHEMA_VERSION);
  assert.equal(s.schemaVersion, "0.4");
  assert.deepEqual(s.usePolicySnapshots, []);
  assert.deepEqual(s.takes, []);
});

test("addTrack / addTake / setPreferredTake are immutable", () => {
  const s0 = createEmptyRecord("ps-2", "T");
  const s1 = addTrack(s0, { id: "v", type: "video", ref: "a.mp4" });
  const s2 = addTake(s1, { id: "take-1", label: "Run 1" });
  const s3 = setPreferredTake(s2, "take-1");
  assert.equal(s0.tracks.length, 0);
  assert.equal(s1.tracks.length, 1);
  assert.equal(s2.takeIds.includes("take-1"), true);
  assert.equal(s3.preferredTakeId, "take-1");
  assert.throws(() => setPreferredTake(s2, "missing"), /takeId/);
});

test("addTake independently repairs either inconsistent take index", () => {
  const base = createEmptyRecord("ps-take-index", "T");
  const idOnly = { ...base, takeIds: ["take-1"] };
  const takeOnly = { ...base, takes: [{ id: "take-2", label: "Older" }] };

  const repairedIdOnly = addTake(idOnly, { id: "take-1", label: "New" });
  assert.deepEqual(repairedIdOnly.takeIds, ["take-1"]);
  assert.deepEqual(repairedIdOnly.takes, [{ id: "take-1", label: "New" }]);
  assert.deepEqual(idOnly.takes, []);

  const repairedTakeOnly = addTake(takeOnly, { id: "take-2", mediaPath: "run.mp4" });
  assert.deepEqual(repairedTakeOnly.takeIds, ["take-2"]);
  assert.deepEqual(repairedTakeOnly.takes, [
    { id: "take-2", label: "Older", mediaPath: "run.mp4" },
  ]);
  assert.deepEqual(takeOnly.takeIds, []);
});

test("domain mutations validate runtime resource ids, roles, and track types", () => {
  assert.throws(() => createEmptyRecord("../record", "T"), /record id/i);
  const score = createEmptyRecord("ps-runtime", "T");
  assert.throws(
    () => addTrack(score, { id: "../track", type: "video" }),
    /track id/i,
  );
  assert.throws(
    () => addTrack(score, { id: "track-1", type: "unknown" as never }),
    /track type/i,
  );
  assert.throws(
    () => addMember(score, { userId: "teacher-1", role: "owner" as never }),
    /role/i,
  );
});

test("tracks, regions, and comments retain unique valid identities", () => {
  let score = createEmptyRecord("ps-unique", "T");
  score = addTrack(score, { id: "track-1", type: "video" });
  assert.throws(
    () => addTrack(score, { id: "track-1", type: "audio" }),
    /already exists/i,
  );

  score = addRegion(score, { id: "region-1", startMs: 0, endMs: 100 });
  assert.throws(
    () => addRegion(score, { id: "region-1", startMs: 100, endMs: 200 }),
    /already exists/i,
  );
  for (const region of [
    { id: "negative", startMs: -1, endMs: 1 },
    { id: "infinite", startMs: 0, endMs: Number.POSITIVE_INFINITY },
    { id: "reversed", startMs: 100, endMs: 0 },
    { id: "empty", startMs: 10, endMs: 10 },
  ]) {
    assert.throws(() => addRegion(score, region), /region times/i);
  }

  score = addComment(score, {
    id: "comment-1",
    regionId: "region-1",
    trackId: "track-1",
    authorId: "teacher-1",
    body: "Watch the landing",
    resolved: false,
  });
  assert.throws(
    () => addComment(score, {
      id: "comment-1",
      regionId: "region-1",
      authorId: "teacher-1",
      body: "duplicate",
      resolved: false,
    }),
    /already exists/i,
  );
  assert.throws(
    () => addComment(score, {
      regionId: "missing-region",
      authorId: "teacher-1",
      body: "orphan",
      resolved: false,
    }),
    /region not found/i,
  );
  assert.throws(
    () => addComment(score, {
      regionId: "region-1",
      trackId: "missing-track",
      authorId: "teacher-1",
      body: "orphan track",
      resolved: false,
    }),
    /track not found/i,
  );
});

test("members update by user id; takes, consent, and submissions validate inputs", () => {
  let score = createEmptyRecord("ps-inputs", "T");
  score = addMember(score, { userId: "teacher-1", role: "student" });
  score = addMember(score, { userId: "teacher-1", role: "faculty" });
  assert.deepEqual(score.members, [{ userId: "teacher-1", role: "faculty" }]);

  assert.throws(
    () => addTake(score, { id: "take-1", byteSize: Number.NaN }),
    /byteSize/i,
  );
  assert.throws(
    () => addTake(score, { id: "../take" }),
    /take id/i,
  );
  assert.throws(
    () => addTake(score, { id: "take-1", mediaPath: 42 as never }),
    /mediaPath/i,
  );
  assert.throws(
    () => attachUsePolicySnapshot(score, {
      id: "consent-1",
      subjectId: "student-1",
      purposes: [""],
      createdAt: "2026-01-01T00:00:00.000Z",
    }),
    /purposes/i,
  );
  assert.throws(
    () => attachUsePolicySnapshot(score, {
      id: "consent-2",
      subjectId: "student-1",
      purposes: ["course_assessment"],
      exportAllowed: "false" as never,
      createdAt: "2026-01-01T00:00:00.000Z",
    }),
    /exportAllowed/i,
  );
  assert.throws(() => submitVersion(score, "not a resource id"), /submission name/i);
  assert.throws(() => createEmptyRecord("ps-empty-title", ""), /title/i);

  score = addRegion(score, { id: "region-1", startMs: 0, endMs: 10 });
  assert.throws(
    () => addComment(score, {
      regionId: "region-1",
      authorId: "teacher-1",
      body: "",
      resolved: false,
    }),
    /comment body/i,
  );
});

test("region-anchored comments require regionId", () => {
  let s = createEmptyRecord("ps-3", "T");
  s = addRegion(s, { id: "r1", startMs: 0, endMs: 1000 });
  s = addComment(s, {
    regionId: "r1",
    authorId: "u1",
    body: "nice phrase",
    resolved: false,
  });
  assert.equal(s.comments.length, 1);
  assert.equal(s.comments[0]!.regionId, "r1");
  assert.throws(
    () =>
      addComment(s, {
        regionId: "",
        authorId: "u1",
        body: "x",
        resolved: false,
      }),
    /regionId/,
  );
});

test("use policy snapshots gate export", () => {
  let s = createEmptyRecord("ps-4", "T");
  assert.equal(hasExportableUsePolicy(s), false);
  assert.throws(() => assertCanExport(s), /use policy/i);
  s = attachUsePolicySnapshot(s, {
    id: "c1",
    subjectId: "sub-1",
    purposes: ["course_assessment"],
    exportAllowed: true,
    createdAt: new Date().toISOString(),
  });
  assert.equal(hasExportableUsePolicy(s), true);
  assert.doesNotThrow(() => assertCanExport(s));
});

test("all student members need current export use policy and revocation wins", () => {
  let score = createEmptyRecord("ps-policy-members", "Policy members");
  score = addMember(score, { userId: "student-a", role: "student" });
  score = addMember(score, { userId: "student-b", role: "student" });
  score = addMember(score, { userId: "teacher-1", role: "faculty" });
  score = attachUsePolicySnapshot(score, {
    id: "consent-a-1",
    subjectId: "student-a",
    purposes: ["course_assessment"],
    exportAllowed: true,
    createdAt: new Date().toISOString(),
  });
  assert.equal(hasExportableUsePolicy(score), false);
  score = attachUsePolicySnapshot(score, {
    id: "consent-b-1",
    subjectId: "student-b",
    purposes: ["course_assessment"],
    exportAllowed: true,
    createdAt: new Date().toISOString(),
  });
  assert.equal(hasExportableUsePolicy(score), true);
  score = attachUsePolicySnapshot(score, {
    id: "consent-a-revoked",
    subjectId: "student-a",
    purposes: ["course_assessment"],
    exportAllowed: false,
    createdAt: new Date().toISOString(),
  });
  assert.equal(hasExportableUsePolicy(score), false);
});

test("submitVersion is immutable on re-submit same name", () => {
  let s = createEmptyRecord("ps-5", "T");
  s = submitVersion(s, "submit-week6");
  const first = getVersionTag(s, "submit-week6")!;
  assert.ok(first.snapshotRef);
  const before = structuredClone(first);
  s = submitVersion(s, "submit-week6");
  const again = getVersionTag(s, "submit-week6")!;
  assert.deepEqual(again, before);
  assert.equal(s.versions.length, 1);
  assert.equal(s.snapshots.length, 1);
  assert.equal(s.snapshots[0]?.id, first.snapshotRef);
});

test("annotationTrackLabel never says Labanotation", () => {
  const label = annotationTrackLabel();
  assert.equal(label, "Movement annotation");
  assert.equal(label.toLowerCase().includes("laban"), false);
  assert.ok(FORBIDDEN_STRINGS.includes("Labanotation"));
});

test("record store CRUD", () => {
  const store = createRecordStore();
  const s = createEmptyRecord("ps-store", "Store");
  const created = store.create(s);
  assert.equal(created.revision, 0);
  assert.throws(() => store.create(s), /already exists/i);
  assert.equal(store.get("ps-store")?.title, "Store");
  assert.equal(store.list().length, 1);
  store.update("ps-store", { ...created, title: "Updated" });
  assert.equal(store.get("ps-store")?.title, "Updated");
  assert.throws(
    () => store.update("ps-store", { ...created, title: "Stale" }),
    /revision conflict/i,
  );
  assert.equal(store.delete("ps-store"), true);
  assert.equal(store.get("ps-store"), undefined);
});

test("role enforcement: student cannot admin or edit_members", () => {
  let s = createEmptyRecord("ps-roles", "Roles");
  s = addMember(s, { userId: "stu", role: "student" });
  s = addMember(s, { userId: "fac", role: "faculty" });
  assert.equal(canMutate(s, "stu", "edit_members"), false);
  assert.equal(canMutate(s, "stu", "admin"), false);
  assert.equal(canMutate(s, "stu", "analysis"), false);
  assert.equal(canMutate(s, "stu", "add_comment"), true);
  assert.equal(canMutate(s, "fac", "submit"), true);
  assert.throws(
    () => assertCanMutate(s, "stu", "edit_members"),
    /role denied|student cannot admin/i,
  );
});

test("resolveComment marks resolved", () => {
  let s = createEmptyRecord("ps-res", "R");
  s = addRegion(s, { id: "r1", startMs: 0, endMs: 500 });
  s = addComment(s, {
    id: "cmt-1",
    regionId: "r1",
    authorId: "f1",
    body: "fix landing",
    resolved: false,
  });
  assert.equal(s.comments[0]!.resolved, false);
  s = resolveComment(s, "cmt-1");
  assert.equal(s.comments[0]!.resolved, true);
  assert.throws(() => resolveComment(s, "missing"), /comment not found/);
});

test("attachMveiMotifTrack uses real Motif ref", () => {
  let s = createEmptyRecord("ps-mvei", "M");
  s = attachMveiMotifTrack(s, {
    id: "tr-mvei",
    ref: "motif.json",
    label: "MvEI Motif",
  });
  const t = s.tracks.find((x) => x.id === "tr-mvei");
  assert.equal(t?.type, "movement_notation");
  assert.equal(t?.ref, "motif.json");
  assert.equal(s.movementCapability, "mvei_view");
  assert.throws(
    () => attachMveiMotifTrack(s, { id: "x", ref: "mock-data" }),
    /mock/i,
  );
  assert.throws(
    () => attachMveiMotifTrack(s, { id: "x-underscore", ref: "mock_data.json" }),
    /mock/i,
  );
  const withVideo = addTrack(createEmptyRecord("ps-mvei-boundary", "M"), {
    id: "shared-id",
    type: "video",
  });
  assert.throws(
    () => attachMveiMotifTrack(withVideo, {
      id: "shared-id",
      ref: "fixtures/demo/motif.json",
    }),
    /cannot overwrite/i,
  );
  assert.throws(
    () => attachMveiMotifTrack(s, { id: "bad-ref", ref: 42 as never }),
    /ref required/i,
  );
});

test("attachMusicNotationTrack + validateRecordCoTimeline measure alignment", () => {
  let s = createEmptyRecord("ps-ct", "Co-timeline");
  s = attachMusicNotationTrack(s, {
    id: "tr-music",
    ref: "fixtures/demo/score.musicxml",
    label: "Demo score",
  });
  s = attachMveiMotifTrack(s, {
    id: "tr-mvei",
    ref: "fixtures/demo/motif.json",
  });
  assert.equal(
    s.tracks.find((t) => t.type === "music_notation")?.ref,
    "fixtures/demo/score.musicxml",
  );

  const motif = {
    musicCoTimeline: {
      musicxmlRef: "fixtures/demo/score.musicxml",
      meiRef: "fixtures/demo/score.mei",
      anchors: [
        { motifItemId: "i1", musicMeasure: "1", tMs: 0 },
        { motifItemId: "i2", musicMeasure: "2", tMs: 2000 },
        { motifItemId: "i3", musicMeasure: "3", tMs: 4000 },
      ],
    },
  };
  const ok = validateRecordCoTimeline(s, motif, 3);
  assert.equal(ok.ok, true, ok.errors.join("; "));

  const bad = validateRecordCoTimeline(s, {
    musicCoTimeline: {
      musicxmlRef: "fixtures/demo/score.musicxml",
      anchors: [{ motifItemId: "i1", musicMeasure: "9", tMs: 0 }],
    },
  }, 3);
  assert.equal(bad.ok, false);
  assert.match(bad.errors.join(" "), /out of range/);
});

test("attachMusicNotationTrack cannot replace a different track type", () => {
  const score = addTrack(createEmptyRecord("ps-music-boundary", "Music"), {
    id: "shared-id",
    type: "audio",
  });
  assert.throws(
    () => attachMusicNotationTrack(score, {
      id: "shared-id",
      ref: "score.musicxml",
    }),
    /cannot overwrite/i,
  );
});
