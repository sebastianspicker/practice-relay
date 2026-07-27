/**
 * Maturity scorecard unit tests - structural strong bar + multi-asset path.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateMaturity } from "./maturity-check.mjs";
import { hasStrongWebShellExport } from "./maturity-functional-gates.mjs";
import {
  hasDomainSurface,
  hasLtiSurface,
  hasOpsSurface,
} from "./maturity-snapshot-dimensions.mjs";
import { hasFederationSurface } from "./maturity-readiness-dimensions.mjs";
import {
  elevatedLevel,
  presentFiles,
} from "./maturity-dimension-helpers.mjs";
import {
  buildMultiAssetAssignmentPayload,
  validateMultiAssetAssignmentPayload,
} from "../practice-relay/apps/lti/src/index.mjs";

function assertRequiredMarkers(predicate, source, markers) {
  assert.equal(predicate(source), true);
  for (const marker of markers) {
    assert.equal(predicate(source.replace(marker, "")), false);
  }
}

test("structural maturity: all snapshot dimensions ≥ strong", () => {
  const { ok, dimensions, summary } = evaluateMaturity({ skipHeavy: true });
  const snapshot = dimensions.filter((d) => !d.id.startsWith("gate-"));
  assert.ok(snapshot.length >= 14, `expected ≥14 snapshot rows, got ${snapshot.length}`);
  for (const d of snapshot) {
    assert.equal(d.target, "strong", d.id);
    assert.equal(d.level, "strong", `${d.id} is ${d.level}: ${d.evidence.join("; ")}`);
    assert.equal(d.ok, true, d.id);
  }
  assert.equal(ok, true, summary);
});

test("institutional rows keep NON-CLAIM labels", () => {
  const { dimensions } = evaluateMaturity({ skipHeavy: true });
  for (const id of [
    "practice-relay-lti-mock",
    "practice-relay-ops",
    "mvei-external-ecosystem",
    "mvei-schemas-ladder",
    "capture-pilot-dry-run",
    "faculty-pilots-readiness",
    "repository-governance",
  ]) {
    const d = dimensions.find((x) => x.id === id);
    assert.ok(d, id);
    assert.ok(d.nonClaim, `${id} missing nonClaim`);
  }
});

test("shared dimension helpers preserve structural and gate thresholds", () => {
  const mustExist = (path) => path !== "missing";
  assert.deepEqual(presentFiles(["present", "missing"], mustExist), ["present"]);
  assert.equal(
    elevatedLevel({
      structural: false,
      present: 2,
      threshold: 2,
      heavy: false,
      gates: [],
    }),
    "lab-mature",
  );
  assert.equal(
    elevatedLevel({
      structural: true,
      present: 0,
      threshold: 0,
      heavy: true,
      gates: [{ ok: false }],
    }),
    "lab-mature",
  );
  assert.equal(
    elevatedLevel({
      structural: true,
      present: 0,
      threshold: 0,
      heavy: true,
      gates: [{ ok: true }],
    }),
    "strong",
  );
});

test("application maturity requires both the current action and export source", () => {
  assert.equal(
    hasStrongWebShellExport("Prepare export", "<button>Prepare export</button>"),
    true,
  );
  assert.equal(
    hasStrongWebShellExport("Review", "<button>Prepare export</button>"),
    false,
  );
  assert.equal(
    hasStrongWebShellExport("Prepare export", "<button>Review</button>"),
    false,
  );
});

test("structural capability predicates require every claimed marker", () => {
  const domainMarkers = [
    "assertCanMutate",
    "createEmptyRecord",
    "attachUsePolicySnapshot",
    "setPreferredTake",
  ];
  const domainSource = domainMarkers.join(" ");
  assertRequiredMarkers(hasDomainSurface, domainSource, domainMarkers);

  const ltiMarkers = [
    "buildMultiAssetAssignmentPayload",
    "LTI_STATUS",
    "resolveLtiSecret",
    "signHs256Jwt",
    "signRs256Jwt",
    "exportPlatformJwks",
  ];
  const ltiSource = ltiMarkers.join(" ");
  assertRequiredMarkers(hasLtiSurface, ltiSource, ltiMarkers);

  const storeMarkers = ["tenantId", "restoreFromBackup", "backup"];
  const mediaMarkers = ["ObjectStorage", "createMediaStore", "S3Compatible"];
  const storeSource = storeMarkers.join(" ");
  const mediaSource = mediaMarkers.join(" ");
  assert.equal(hasOpsSurface(storeSource, mediaSource), true);
  for (const marker of storeMarkers) {
    assert.equal(hasOpsSurface(storeSource.replace(marker, ""), mediaSource), false);
  }
  for (const marker of mediaMarkers) {
    assert.equal(hasOpsSurface(storeSource, mediaSource.replace(marker, "")), false);
  }

  const federationMarkers = [
    "importEafToRecordParts",
    "importOtioToRecordParts",
    "UNKNOWN_TIER",
    "ImportWarning",
  ];
  const federationSource = federationMarkers.join(" ");
  assert.equal(hasFederationSurface(federationSource), true);
  for (const marker of federationMarkers) {
    assert.equal(
      hasFederationSurface(federationSource.replace(marker, "")),
      false,
    );
  }
});

test("shipped multi-asset LTI path rejects single-video assignment", () => {
  const p = buildMultiAssetAssignmentPayload({
    id: "ps-mat-strong",
    tracks: [
      { id: "v", type: "video" },
      { id: "m", type: "music_notation", ref: "score.musicxml" },
      { id: "a", type: "audio" },
      { id: "ma", type: "movement_annotation" },
    ],
    takes: [{ id: "t1" }],
    usePolicySnapshots: [{ purposes: ["course_assessment"], exportAllowed: true }],
  });
  assert.equal(p.singleVideoUrl, null);
  assert.equal(p.assetMode, "multi-asset");
  assert.equal(validateMultiAssetAssignmentPayload(p).ok, true);
  assert.equal(
    validateMultiAssetAssignmentPayload({ ...p, singleVideoUrl: "http://evil" })
      .ok,
    false,
  );
});
