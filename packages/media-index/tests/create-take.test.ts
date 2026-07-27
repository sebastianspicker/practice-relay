/** Unit tests for @practice-relay/media-index take helpers. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createTake } from "../src/index.ts";

test("createTake sets id and optional fields", () => {
  const take = createTake("take-01", {
    label: "Run 1",
    mediaPath: "media/take-01.mp4",
    recordedAt: "2026-07-16T12:00:00.000Z",
    consentId: "consent-1",
  });
  assert.equal(take.id, "take-01");
  assert.equal(take.label, "Run 1");
  assert.equal(take.mediaPath, "media/take-01.mp4");
  assert.equal(take.recordedAt, "2026-07-16T12:00:00.000Z");
  assert.equal(take.consentId, "consent-1");
});

test("createTake with only id", () => {
  const take = createTake("take-02");
  assert.equal(take.id, "take-02");
  assert.equal(take.label, undefined);
});
