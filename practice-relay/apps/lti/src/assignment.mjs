/**
 * Practice Relay LTI package - multi-asset assignment + LTI 1.3 local-mock.
 *
 * Status: local-mock (not IMS-certified campus deployment).
 * Residual G4: multi-asset assignment shape + simulated OIDC launch + AGS passback.
 *
 * Signing: prefer RS256 when lab RSA keys are present (JWKS at GET /lti/jwks);
 * fall back to HS256 with PRACTICE_RELAY_LTI_SECRET.
 */
import {
  projectAssignmentTakes,
  projectAssignmentTracks,
} from "./assignment-fields.mjs";
import { validateMultiAssetAssignmentPayload } from "./assignment-validation.mjs";

/**
 * @typedef {{
 *   id: string,
 *   title?: string,
 *   tracks?: Array<{ id: string, type: string, label?: string, ref?: string }>,
 *   preferredTakeId?: string | null,
 *   takes?: Array<{ id: string, label?: string, mediaPath?: string }>,
 *   takeIds?: string[],
 *   consents?: Array<{ purposes?: string[], exportAllowed?: boolean }>,
 * }} WorkRecordLike
 */

/** @type {"local-mock"} */
export const LTI_STATUS = "local-mock";

/** @type {"ready"} */
export const LTI_ASSIGNMENT_PAYLOAD_STATUS = "ready";

/** Default JWK kid for lab RSA keys. */
export const LTI_LAB_KID = "practice-relay-lab-1";

/** AGS score write scope (IMS LTI AGS). */
export const AGS_SCORE_SCOPE =
  "https://purl.imsglobal.org/spec/lti-ags/scope/score";

/** Registered local-mock tool launch URL; never derive this from OIDC input. */
export const LTI_DEFAULT_LAUNCH_URL = "http://localhost:8787/lti/launch";

/** Describe the implemented local-mock LTI boundary without certification claims. */
export function ltiStatusMessage() {
  return (
    "Practice Relay multi-asset LTI local-mock is ready (launch + AGS sim); " +
    "not IMS-certified / not a live campus Canvas registration."
  );
}

function hasExportableUsePolicy(score) {
  return (score.consents ?? []).some(
    (c) =>
      Array.isArray(c.purposes) &&
      c.purposes.length > 0 &&
      c.exportAllowed !== false,
  );
}

/**
 * Build multi-asset assignment payload from WorkRecord-like document.
 * singleVideoUrl is always null - multi-asset assignment shape is mandatory.
 * @param {WorkRecordLike} score
 */
export function buildMultiAssetAssignmentPayload(score) {
  if (!score || typeof score !== "object" || typeof score.id !== "string") {
    throw new TypeError("score with string id is required");
  }
  if (score.title != null && typeof score.title !== "string") {
    throw new TypeError("score title must be a string when present");
  }
  if (
    score.preferredTakeId != null &&
    typeof score.preferredTakeId !== "string"
  ) {
    throw new TypeError("preferredTakeId must be a string or null");
  }

  const { tracks, trackTypes, mveiTrack, musicTrack } =
    projectAssignmentTracks(score.tracks);
  const takes = projectAssignmentTakes(score.takes, score.takeIds);
  const consentRequired = !hasExportableUsePolicy(score);

  const payload = {
    schemaVersion: "0.2.0",
    kind: "practice-relay-multi-asset-assignment",
    packageId: score.id,
    workId: score.id,
    title: score.title ?? "",
    trackTypes,
    tracks,
    preferredTakeId: score.preferredTakeId ?? null,
    takes,
    consentRequired,
    mveiRef: mveiTrack?.ref ?? null,
    motifRef: mveiTrack?.ref ?? null,
    musicxmlRef: musicTrack?.ref ?? null,
    assetMode: "multi-asset",
    singleVideoUrl: null,
    ltiHandshakeStatus: LTI_STATUS,
    assignmentPayloadStatus: LTI_ASSIGNMENT_PAYLOAD_STATUS,
  };
  const validation = validateMultiAssetAssignmentPayload(payload);
  if (!validation.ok) {
    throw new TypeError(`invalid multi-asset assignment: ${validation.errors}`);
  }
  return payload;
}

export { validateMultiAssetAssignmentPayload };
