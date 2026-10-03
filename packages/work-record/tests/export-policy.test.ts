/** Fail-closed evidence-grant and record-release policy tests. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  attachUsePolicySnapshot,
  createEmptyRecord,
  evaluateExport,
  evaluateExportPolicy,
} from "../src/index.ts";

test("explicit export policy requires a matching subject grant", () => {
  const record = createEmptyRecord("ps-explicit-policy", "Policy");
  record.representedSubjects = [{
    id: "subject-1",
    type: "Person",
    label: "Subject",
  }];
  record.artifacts = [{ id: "artifact-1", name: "Take", representedSubjectIds: ["subject-1"] }];
  record.usePolicies = [{
    id: "grant-1",
    representedSubjectId: "subject-1",
    purpose: "course_assessment",
    destination: "lms",
    state: "granted",
    createdAt: "2026-08-29T00:00:00.000Z",
  }];
  assert.equal(evaluateExport(record, { purpose: "course_assessment", destination: "lms" }).allowed, true);
  assert.equal(evaluateExport(record, { purpose: "research_archive", destination: "archive" }).allowed, false);
});

test("explicit export rejects empty and policy-unlinked artifact sets", () => {
  const empty = createEmptyRecord("ps-empty-export", "Empty export");
  const emptyDecision = evaluateExport(empty, {
    purpose: "course_assessment",
    destination: "lms",
  });
  assert.equal(emptyDecision.allowed, false);
  assert.match(emptyDecision.reasons.join(" "), /at least one policy-linked artifact/i);

  const unlinked = {
    ...empty,
    artifacts: [{ id: "artifact-unlinked", name: "Unlinked" }],
  };
  const unlinkedDecision = evaluateExport(unlinked, {
    purpose: "course_assessment",
    destination: "lms",
  });
  assert.equal(unlinkedDecision.allowed, false);
  assert.match(unlinkedDecision.reasons.join(" "), /no represented-subject policy linkage/i);
  assert.deepEqual(unlinkedDecision.includedArtifactIds, []);
});

test("explicit export rejects dangling subject and policy references", () => {
  const record = createEmptyRecord("ps-dangling-export", "Dangling export");
  record.artifacts = [{
    id: "artifact-1",
    name: "Artifact",
    representedSubjectIds: ["missing-subject"],
  }];
  record.usePolicies = [{
    id: "policy-1",
    representedSubjectId: "missing-subject",
    purpose: "course_assessment",
    destination: "lms",
    state: "granted",
    createdAt: "2026-08-30T00:00:00.000Z",
  }];
  const decision = evaluateExport(record, {
    purpose: "course_assessment",
    destination: "lms",
  });
  assert.equal(decision.allowed, false);
  assert.match(decision.reasons.join(" "), /unknown represented subject/i);
  assert.deepEqual(decision.includedArtifactIds, []);
});

test("record release and evidence grants remain independent policy scopes", () => {
  let record = createEmptyRecord("ps-record-release", "Record release");
  record = attachUsePolicySnapshot(record, {
    id: "snapshot-1",
    subjectId: "student-1",
    purposes: ["course_assessment"],
    exportAllowed: true,
    createdAt: "2026-08-29T00:00:00.000Z",
  });
  assert.equal(evaluateExportPolicy(record, { mode: "record-release" }).allowed, true);
  record = {
    ...record,
    usePolicies: [{
      id: "grant-1",
      representedSubjectId: "student-1",
      purpose: "course_assessment",
      destination: "lms",
      state: "granted",
      createdAt: "2026-08-29T00:00:00.000Z",
    }],
  };
  const decision = evaluateExportPolicy(record, { mode: "record-release" });
  assert.equal(decision.allowed, true);
  assert.equal(decision.policySource, "record-release");
});
