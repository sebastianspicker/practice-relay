/**
 * Field-fixture tests for lossy ELAN + OTIO import.
 * Asserts stable ImportWarningCode values for the partner-lab fixtures.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatImportWarning,
  importEafToRecordParts,
  importOtioToRecordParts,
  warningCodes,
} from "../src/projections/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const partnerLabDir = join(here, "../fixtures/partner-lab");

describe("partner-lab ELAN/OTIO fidelity", () => {
  it("reports every documented ELAN loss for partner-session.eaf", () => {
    const eaf = readFileSync(join(partnerLabDir, "partner-session.eaf"), "utf8");
    const parts = importEafToRecordParts(eaf);

    assert.deepEqual(
      parts.regions.map((region) => region.label),
      ["entrance", "duet-core", "exit", "bow"],
    );
    assert.equal(parts.comments.length, 4);

    assert.deepEqual(
      parts.warnings.map(({ code, path }) => ({ code, path })),
      [
        { code: "UNKNOWN_TIER", path: "effort_weight" },
        { code: "UNKNOWN_TIER", path: "camera_notes" },
        { code: "UNKNOWN_TIER", path: "gesture_path" },
        { code: "UNKNOWN_TIER", path: "speaker_id" },
        { code: "UNKNOWN_TIER", path: "space_level" },
        { code: "MISSING_MEDIA", path: undefined },
        { code: "EMPTY_ANNOTATION", path: "a-reg-empty" },
        { code: "MISSING_TIME_SLOT", path: "a-cmt-badslot" },
        { code: "ORPHAN_COMMENT", path: "a-cmt-orphan" },
      ],
    );
    assert.deepEqual(
      [...new Set(warningCodes(parts.warnings))].sort(),
      [
        "EMPTY_ANNOTATION",
        "MISSING_MEDIA",
        "MISSING_TIME_SLOT",
        "ORPHAN_COMMENT",
        "UNKNOWN_TIER",
      ],
    );

    for (const warning of parts.warnings) {
      assert.match(formatImportWarning(warning), /^\[[A-Z_]+\]/);
    }
  });

  it("reports every documented NLE loss for partner-nle.otio.json", () => {
    const otio = readFileSync(join(partnerLabDir, "partner-nle.otio.json"), "utf8");
    const parts = importOtioToRecordParts(otio);

    assert.equal(parts.workRecordId, "partner-lab-nle-01");
    assert.equal(parts.tracks.length, 5);
    assert.equal(parts.takes.length, 2);
    assert.equal(parts.durationMs, 15_000);

    assert.deepEqual(
      parts.warnings.map(({ code, path }) => ({ code, path })),
      [
        { code: "UNSUPPORTED_OTIO_NODE", path: "FreezeFrame.1" },
        { code: "UNSUPPORTED_OTIO_NODE", path: "GeneratorReference.1" },
        { code: "GAP_SKIPPED", path: "Wide" },
        { code: "GAP_SKIPPED", path: "Wide" },
        { code: "TRANSITION_SKIPPED", path: "Close-up (offline disk)" },
        { code: "MISSING_MEDIA", path: "Close-up (offline disk)" },
        { code: "TRANSITION_SKIPPED", path: "Boom" },
        { code: "GAP_SKIPPED", path: "Boom" },
        { code: "MARKERS_NOT_IMPORTED", path: undefined },
      ],
    );

    for (const warning of parts.warnings) {
      assert.match(formatImportWarning(warning), /^\[[A-Z_]+\]/);
    }
  });
});
