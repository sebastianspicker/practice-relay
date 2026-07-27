/**
 * Tests - collab.test.ts
 *
 * Why: guard shipped behaviour for technical reviewers; drive real modules,
 * not a re-implementation of domain/export/validate logic.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createEmptyRecord, addTrack, addRegion } from "@practice-relay/work-record-core";
import { createRecordCollabRoom, collabEnabled, COLLAB_STATUS } from "./index.ts";

describe("hub-collab", () => {
  it("applies record fields into Y.Doc and reads back", () => {
    assert.equal(COLLAB_STATUS, "document-yjs");
    const room = createRecordCollabRoom("ps-c");
    let record = createEmptyRecord("ps-c", "Collab");
    record = addTrack(record, { id: "v", type: "video" });
    record = addRegion(record, { id: "r1", startMs: 0, endMs: 1000 });
    room.applyRecord(record);
    const overlay = room.toRecordOverlay();
    assert.equal(overlay.tracks.length, 1);
    assert.equal(overlay.regions.length, 1);
    room.destroy();
  });

  it("collabEnabled respects env", () => {
    assert.equal(collabEnabled({} as NodeJS.ProcessEnv), false);
    assert.equal(collabEnabled({ COLLAB: "1" } as NodeJS.ProcessEnv), true);
  });
});
