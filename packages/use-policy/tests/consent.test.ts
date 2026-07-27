/** Unit tests for @practice-relay/use-policy create + export gate. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SCHEMA_VERSION,
  createConsentRecord,
  consentAllowsExport,
} from "../src/index.ts";

test("createConsentRecord fills schemaVersion and createdAt", () => {
  const rec = createConsentRecord({
    id: "c1",
    subjectId: "s1",
    purposes: ["course_assessment"],
  });
  assert.equal(rec.schemaVersion, SCHEMA_VERSION);
  assert.equal(rec.id, "c1");
  assert.equal(rec.subjectId, "s1");
  assert.deepEqual(rec.purposes, ["course_assessment"]);
  assert.ok(typeof rec.createdAt === "string" && rec.createdAt.length > 0);
  assert.ok(!Number.isNaN(Date.parse(rec.createdAt)));
});

test("consentAllowsExport true when purposes non-empty and export not denied", () => {
  const ok = createConsentRecord({
    id: "c1",
    subjectId: "s1",
    purposes: ["formative_feedback"],
  });
  assert.equal(consentAllowsExport([ok]), true);
});

test("consentAllowsExport false when exportAllowed is false", () => {
  const denied = createConsentRecord({
    id: "c2",
    subjectId: "s1",
    purposes: ["research_archive"],
    exportAllowed: false,
  });
  assert.equal(consentAllowsExport([denied]), false);
});

test("consentAllowsExport false for empty list", () => {
  assert.equal(consentAllowsExport([]), false);
});
