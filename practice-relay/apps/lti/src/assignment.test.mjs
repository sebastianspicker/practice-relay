/** LTI focused protocol tests. Why: keep protocol regressions independently runnable. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { LTI_STATUS, LTI_ASSIGNMENT_PAYLOAD_STATUS, ltiStatusMessage, buildMultiAssetAssignmentPayload, validateMultiAssetAssignmentPayload } from "./index.mjs";
import { scoreFromDemoSeed, scoreFromFacultyTemplate } from "./test-fixtures.mjs";

test("LTI local-mock status; assignment payload ready", () => {
  assert.equal(LTI_STATUS, "local-mock");
  assert.equal(LTI_ASSIGNMENT_PAYLOAD_STATUS, "ready");
  assert.match(ltiStatusMessage(), /local-mock/i);
  assert.match(ltiStatusMessage(), /not IMS-certified|not a live campus/i);
});
test("faculty template → multi-asset payload validates", () => {
  const payload = buildMultiAssetAssignmentPayload(scoreFromFacultyTemplate());
  const v = validateMultiAssetAssignmentPayload(payload);
  assert.equal(v.ok, true, v.errors);
  assert.equal(payload.assetMode, "multi-asset");
  assert.equal(payload.singleVideoUrl, null);
  assert.ok(payload.trackTypes.length >= 2);
});

test("singleVideoUrl always null; reject non-null in validator", () => {
  const payload = buildMultiAssetAssignmentPayload(scoreFromDemoSeed());
  assert.equal(payload.singleVideoUrl, null);
  const bad = { ...payload, singleVideoUrl: "https://video.example/only.mp4" };
  const v = validateMultiAssetAssignmentPayload(bad);
  assert.equal(v.ok, false);
  assert.match(String(v.errors), /singleVideoUrl/);
});

test("multi-asset builder and validator reject malformed projected children", () => {
  const malformed = {
    id: "x",
    tracks: [{ type: "video" }],
    takes: [{}],
  };
  assert.throws(
    () => buildMultiAssetAssignmentPayload(malformed),
    /track requires non-empty string id and type/,
  );
  assert.throws(
    () =>
      buildMultiAssetAssignmentPayload({
        id: "x",
        tracks: [{ id: "track-1", type: "video", label: 1 }],
      }),
    /track label and ref must be strings/,
  );

  const payload = buildMultiAssetAssignmentPayload(scoreFromDemoSeed());
  const invalid = {
    ...payload,
    tracks: [{ type: "video" }],
    takes: [{}],
  };
  const validation = validateMultiAssetAssignmentPayload(invalid);
  assert.equal(validation.ok, false);
  assert.match(String(validation.errors), /each track requires/);
  assert.match(String(validation.errors), /each take requires/);

  const invalidOptionalFields = {
    ...payload,
    title: 1,
    preferredTakeId: 1,
    tracks: [{ id: "track-1", type: "video", ref: 1 }],
  };
  const optionalValidation = validateMultiAssetAssignmentPayload(
    invalidOptionalFields,
  );
  assert.equal(optionalValidation.ok, false);
  assert.match(String(optionalValidation.errors), /track label and ref/);
  assert.match(String(optionalValidation.errors), /title must be a string/);
  assert.match(
    String(optionalValidation.errors),
    /preferredTakeId must be a string or null/,
  );
});

test("demo seed payload includes motif ref", () => {
  const payload = buildMultiAssetAssignmentPayload(scoreFromDemoSeed());
  assert.ok(payload.motifRef || payload.mveiRef);
  assert.equal(payload.ltiHandshakeStatus, "local-mock");
});

test("multi-asset assignment: trackTypes multi-domain and singleVideoUrl null", () => {
  const faculty = scoreFromFacultyTemplate();
  const demo = scoreFromDemoSeed();
  for (const score of [faculty, demo]) {
    const payload = buildMultiAssetAssignmentPayload(score);
    assert.equal(payload.singleVideoUrl, null);
    assert.equal(payload.assetMode, "multi-asset");
    assert.equal(payload.kind, "practice-relay-multi-asset-assignment");
    assert.ok(payload.trackTypes.length >= 2, "multi-asset needs ≥2 track types");
    assert.equal(validateMultiAssetAssignmentPayload(payload).ok, true);
  }
});
