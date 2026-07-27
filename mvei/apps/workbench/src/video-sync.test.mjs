/**
 * Tests: video-sync.test.mjs
 *
 * Why: guard shipped behaviour for technical reviewers; drive real modules,
 * not a re-implementation of domain/export/validate logic.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nearestItemAt,
  seekMsForItem,
  shouldUpdateHighlight,
} from "./video-sync.mjs";

const items = [
  { id: "i1", symbol: "walk", order: 0, timeAnchor: { tMs: 0 } },
  { id: "i2", symbol: "gesture_arm", order: 1, timeAnchor: { tMs: 2400 } },
  { id: "i3", symbol: "travel", order: 2, timeAnchor: { tMs: 4800 } },
];

test("nearestItemAt picks closest within window", () => {
  assert.equal(nearestItemAt(items, 100)?.id, "i1");
  assert.equal(nearestItemAt(items, 2500)?.id, "i2");
  assert.equal(nearestItemAt(items, 9000, 500), null);
});

test("seekMsForItem", () => {
  assert.equal(seekMsForItem(items[1]), 2400);
  assert.equal(seekMsForItem({ id: "x" }), null);
});

test("shouldUpdateHighlight changes on scrub", () => {
  assert.equal(shouldUpdateHighlight(0, null, items), "i1");
  assert.equal(shouldUpdateHighlight(0, "i1", items), "i1");
  assert.equal(shouldUpdateHighlight(2400, "i1", items), "i2");
});
