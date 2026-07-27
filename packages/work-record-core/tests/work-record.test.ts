/** Tests for WorkRecord Core policy and RO-Crate package boundaries. */
import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyRecord,
  evaluateExport,
  readRoCrate13,
  writeRoCrate13,
  type WorkRecord,
} from "../src/index.ts";

function record(): WorkRecord {
  const base = createEmptyRecord("work-1", "Study");
  return {
    ...base,
    actors: [{ id: "author-1", type: "Person", name: "Author" }],
    representedSubjects: [{ id: "subject-1", type: "Person", label: "Performer" }],
    artifacts: [{ id: "media-1", name: "take.mp4", contentUrl: "media/take.mp4", sha256: "abc", representedSubjectIds: ["subject-1"], preservationRequired: true }],
    relations: [], iterations: [], annotations: [], views: [],
    usePolicies: [{ id: "policy-1", representedSubjectId: "subject-1", purpose: "research_archive", destination: "repository", state: "granted", createdAt: "2026-01-01T00:00:00.000Z" }],
    provenance: { createdAt: "2026-01-01T00:00:00.000Z" },
  };
}

test("policy allows only an explicitly granted requested purpose", () => {
  assert.equal(record().schemaVersion, "0.4");
  assert.equal(record().profile, "urn:work-record:profile:core:0.4");
  assert.equal(evaluateExport(record(), { purpose: "research_archive", destination: "repository" }).allowed, true);
  const decision = evaluateExport(record(), { purpose: "public_showcase", destination: "site" });
  assert.equal(decision.allowed, false);
  assert.match(decision.reasons[0]!, /no explicit grant/);
  assert.equal(evaluateExport(record(), { purpose: "research_archive", destination: "public-site" }).allowed, false);
});

test("withdrawal and preservation integrity deny an export", () => {
  const work = record();
  work.usePolicies.push({ ...work.usePolicies[0]!, id: "withdrawal", state: "withdrawn" });
  work.artifacts[0]!.sha256 = undefined;
  const decision = evaluateExport(work, { purpose: "research_archive", destination: "repository" });
  assert.equal(decision.allowed, false);
  assert.ok(decision.reasons.some((reason) => reason.includes("withdrew")));
  assert.ok(decision.reasons.some((reason) => reason.includes("unresolved or unhashed")));
});

test("RO-Crate 1.3 package round-trips the WorkRecord", () => {
  const pkg = writeRoCrate13(record());
  assert.equal(readRoCrate13(pkg).id, "work-1");
  const invalid = { files: { ...pkg.files, "ro-crate-metadata.json": "{}" } };
  assert.throws(() => readRoCrate13(invalid), /metadata descriptor/);
  const missingRoot = {
    files: {
      ...pkg.files,
      "ro-crate-metadata.json": JSON.stringify({
        "@graph": [{ "@id": "ro-crate-metadata.json", conformsTo: "https://w3id.org/ro/crate/1.3" }],
      }),
    },
  };
  assert.throws(() => readRoCrate13(missingRoot), /metadata descriptor/);
});
