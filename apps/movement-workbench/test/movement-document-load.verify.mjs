/** Workbench load paths must reject documents outside package-owned contracts. */
import assert from "node:assert/strict";
import test from "node:test";
import { loadLabanSubset, renderLabanSubsetStaffHtml } from "../src/laban-subset.mjs";
import { loadDemoMotif } from "../src/shell.mjs";
import { createMemoryStorage, loadSession, saveSession } from "../src/session-store.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadStored(storage, document) {
  storage.setItem("mvei.workbench.motif.session.v1", JSON.stringify(document));
  return () => loadSession(storage);
}

test("Workbench session restore rejects unknown Motif symbols", () => {
  const storage = createMemoryStorage();
  const document = clone(loadDemoMotif());
  document.items[0].symbol = "unsupported-symbol";
  assert.throws(loadStored(storage, document), /\.items\[0\]\.symbol must be one of/);
});

test("Workbench session restore rejects additional Motif properties", () => {
  const storage = createMemoryStorage();
  const document = { ...clone(loadDemoMotif()), unexpected: true };
  assert.throws(loadStored(storage, document), /\.unexpected is not allowed/);
});

test("Workbench session restore and save reject malformed anchors", () => {
  const storage = createMemoryStorage();
  const malformed = clone(loadDemoMotif());
  malformed.musicCoTimeline.anchors[0].unexpected = "anchor-field";
  assert.throws(loadStored(storage, malformed), /anchors\[0\]\.unexpected is not allowed/);
  assert.throws(() => saveSession(storage, malformed), /anchors\[0\]\.unexpected is not allowed/);
});

test("Workbench Laban load and render reject invalid staff columns", () => {
  const valid = {
    schemaVersion: "0.2.0",
    profile: "mvei-laban-subset",
    id: "invalid-column",
    completeness: "sketch",
    staff: { columns: ["wing"] },
    measures: [],
    symbols: [],
  };
  assert.throws(() => loadLabanSubset(valid), /staff\.columns\[0\] must be one of/);
  assert.throws(() => renderLabanSubsetStaffHtml(valid), /staff\.columns\[0\] must be one of/);
});

test("Workbench Laban renderer rejects amplified staff dimensions", () => {
  const base = {
    schemaVersion: "0.2.0",
    profile: "mvei-laban-subset",
    id: "render-budget",
    completeness: "sketch",
    measures: [],
    symbols: [],
  };
  assert.throws(
    () => renderLabanSubsetStaffHtml({
      ...base,
      staff: { columns: ["body", "body"] },
    }),
    /columns must not contain duplicates/,
  );
  assert.throws(
    () => renderLabanSubsetStaffHtml({
      ...base,
      staff: { columns: ["body"] },
      measures: [
        { id: "m-1", index: 0 },
        { id: "m-1", index: 1 },
      ],
    }),
    /measures must not contain duplicate IDs/,
  );
  assert.throws(
    () => renderLabanSubsetStaffHtml({
      ...base,
      staff: {
        columns: [
          "support_left",
          "support_right",
          "leg_left",
          "leg_right",
          "body",
          "arm_left",
          "arm_right",
          "head",
        ],
      },
      measures: Array.from({ length: 1_251 }, (_, index) => ({
        id: `m-${index}`,
        index,
      })),
    }),
    /cell render limit/,
  );
  assert.throws(
    () => renderLabanSubsetStaffHtml({
      ...base,
      measures: Array.from({ length: 10_001 }, (_, index) => ({
        id: `header-${index}`,
        index,
      })),
    }),
    /cell render limit/,
  );
});
