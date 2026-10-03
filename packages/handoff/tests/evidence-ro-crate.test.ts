/** Policy-scoped evidence RO-Crate disclosure tests. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addArtifact,
  addMember,
  addRepresentedSubject,
  addUsePolicy,
  createEmptyRecord,
} from "@practice-relay/work-record";
import { writeEvidenceRoCrate13 } from "../src/evidence-ro-crate.ts";

function evidenceRecord() {
  let record = createEmptyRecord("wr-evidence", "Sensitive working title");
  record = addMember(record, { userId: "member-private", role: "faculty" });
  record = addRepresentedSubject(record, {
    id: "subject-approved",
    type: "Person",
    label: "Approved performer",
  });
  record = addRepresentedSubject(record, {
    id: "subject-private",
    type: "Person",
    label: "Private performer",
  });
  record = addArtifact(record, {
    id: "artifact-approved",
    name: "Approved video",
    representedSubjectIds: ["subject-approved"],
  });
  record = addArtifact(record, {
    id: "artifact-private",
    name: "Private notes",
    representedSubjectIds: ["subject-private"],
  });
  record = addUsePolicy(record, {
    id: "policy-approved",
    representedSubjectId: "subject-approved",
    purpose: "course_assessment",
    destination: "lms",
    state: "granted",
    createdAt: "2026-08-30T00:00:00.000Z",
  });
  return record;
}

test("evidence RO-Crate contains only approved artifact metadata and subjects", () => {
  const pkg = writeEvidenceRoCrate13(evidenceRecord(), ["artifact-approved"]);
  assert.deepEqual(Object.keys(pkg.files), ["ro-crate-metadata.json"]);
  const metadata = pkg.files["ro-crate-metadata.json"]!;
  assert.match(metadata, /artifact-approved/);
  assert.match(metadata, /Approved performer/);
  assert.doesNotMatch(metadata, /artifact-private|Private performer|Private notes/);
  assert.doesNotMatch(metadata, /member-private|Sensitive working title|policy-approved/);
});

test("evidence RO-Crate rejects empty, duplicate, and unknown approval sets", () => {
  const record = evidenceRecord();
  assert.throws(() => writeEvidenceRoCrate13(record, []), /requires approved artifacts/);
  assert.throws(
    () => writeEvidenceRoCrate13(record, ["artifact-approved", "artifact-approved"]),
    /must be unique/,
  );
  assert.throws(
    () => writeEvidenceRoCrate13(record, ["artifact-missing"]),
    /not present/,
  );
});
