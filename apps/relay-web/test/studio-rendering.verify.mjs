/** New studio surfaces preserve hostile text, explicit policy scope, and demo boundaries. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderHandoffPreparation, renderHandoffSuccess, permissionRows } from "../src/studio/handoff-render.mjs";
import { simulateEvidenceExport, studioRecord } from "../src/data/studio-demo.mjs";
import { toWorkspaceRecord } from "../src/data/workspace-record.mjs";

/** Return a fresh isolated demo fixture in the same shape as live render data. */
function record() { return toWorkspaceRecord(structuredClone(studioRecord)); }
const intent = { purpose: "formative_feedback", destination: "studio-review" };

test("handoff escapes untrusted record, subject, purpose and decision text", () => {
  const value = record();
  const hostile = '<img src=x onerror="alert(1)">';
  value.artifacts[0].name = hostile; value.subjects[0].label = hostile;
  const html = renderHandoffPreparation(value, { intent: { purpose: hostile, destination: hostile }, decision: { reasons: [hostile] }, canManage: true, demo: false });
  assert.equal(html.includes(hostile), false);
  assert.ok(html.includes("&lt;img"));
  assert.equal(html.includes('src="./assets/studio-rehearsal.png"'), false);
});

test("grant display uses both purpose and destination and preserves withdrawal", () => {
  const value = record();
  assert.match(permissionRows(value, intent), /Granted/);
  assert.match(permissionRows(value, { ...intent, destination: "different" }), /No matching grant/);
  value.policies.push({ ...value.policies[0], state: "withdrawn" });
  assert.match(permissionRows(value, intent), /Withdrawn/);
  assert.equal(simulateEvidenceExport(value, intent).decision.allowed, false);
});

test("unsaved drafts are explicitly outside stored evidence export", () => {
  const html = renderHandoffPreparation(record(), { intent, draftPending: true });
  assert.match(html, /unsaved changes/);
  assert.match(html, /evidence already stored in the record/);
  assert.doesNotMatch(html, /id="policy-form"/);
});

test("demo result stays labeled and does not claim media delivery", () => {
  const value = record();
  const result = simulateEvidenceExport(value, intent);
  const html = renderHandoffSuccess(value, { intent, result, demo: true });
  assert.match(html, /simulated-ro-crate-metadata.json/);
  assert.match(html, /Nothing has been sent/);
  assert.match(html, /Media bytes and permission records are not included/);
  assert.equal(JSON.parse(result.roCrate.files["ro-crate-metadata.json"]).simulation, true);
});

test("newest stored movement notation is opened without discarding earlier versions", () => {
  const raw = structuredClone(studioRecord);
  raw.tracks.push({ id: "next", type: "movement_notation", ref: "next.json" });
  const adapted = toWorkspaceRecord(raw);
  assert.equal(adapted.motion.id, "next");
  assert.equal(adapted.tracks.length, 2);
});
