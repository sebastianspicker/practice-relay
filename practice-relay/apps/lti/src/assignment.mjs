/**
 * Practice Relay LTI package - multi-asset assignment + LTI 1.3 local-mock.
 *
 * Status: local-mock (not IMS-certified campus deployment).
 * Residual G4: multi-asset assignment shape + simulated OIDC launch + AGS passback.
 *
 * Signing: prefer RS256 when lab RSA keys are present (JWKS at GET /lti/jwks);
 * fall back to HS256 with PRACTICE_RELAY_LTI_SECRET.
 */
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

  const tracks = Array.isArray(score.tracks) ? score.tracks : [];
  for (const track of tracks) {
    if (
      !track ||
      typeof track !== "object" ||
      typeof track.id !== "string" ||
      !track.id ||
      typeof track.type !== "string" ||
      !track.type
    ) {
      throw new TypeError("each track requires non-empty string id and type");
    }
    if (
      (track.label != null && typeof track.label !== "string") ||
      (track.ref != null && typeof track.ref !== "string")
    ) {
      throw new TypeError("track label and ref must be strings when present");
    }
  }
  const trackTypes = [...new Set(tracks.map((t) => t.type).filter(Boolean))];

  const mveiTrack = tracks.find((t) => t.type === "movement_notation");
  const musicTrack = tracks.find((t) => t.type === "music_notation");

  const richTakes = Array.isArray(score.takes) ? score.takes : [];
  for (const take of richTakes) {
    if (
      !take ||
      typeof take !== "object" ||
      typeof take.id !== "string" ||
      !take.id
    ) {
      throw new TypeError("each take requires a non-empty string id");
    }
    if (
      (take.label != null && typeof take.label !== "string") ||
      (take.mediaPath != null && typeof take.mediaPath !== "string")
    ) {
      throw new TypeError("take label and mediaPath must be strings when present");
    }
  }
  const takeIds = Array.isArray(score.takeIds) ? score.takeIds : [];
  if (richTakes.length === 0 && takeIds.some((id) => typeof id !== "string" || !id)) {
    throw new TypeError("each takeId requires a non-empty string");
  }
  const takes =
    richTakes.length > 0
      ? richTakes.map((t) => ({
          id: t.id,
          label: t.label,
          mediaPath: t.mediaPath,
        }))
      : takeIds.map((id) => ({ id }));

  const consentRequired = !hasExportableUsePolicy(score);

  const payload = {
    schemaVersion: "0.2.0",
    kind: "practice-relay-multi-asset-assignment",
    packageId: score.id,
    workId: score.id,
    title: score.title ?? "",
    trackTypes,
    tracks: tracks.map((t) => ({
      id: t.id,
      type: t.type,
      label: t.label,
      ref: t.ref,
    })),
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

function addAssignmentIdentityProblems(p, problems) {
  if (p.kind !== "practice-relay-multi-asset-assignment") problems.push('kind must be "practice-relay-multi-asset-assignment"');
  if (typeof p.packageId !== "string" || !p.packageId) problems.push("packageId required");
  if (p.assetMode !== "multi-asset") problems.push('assetMode must be "multi-asset"');
  if (p.singleVideoUrl != null) problems.push("singleVideoUrl must be null (not video-only assignment)");
}

function isNonEmptyString(value) {
  return typeof value === "string" && Boolean(value);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyStringOptionalFields(value, fields) {
  return fields.every(
    (field) => value[field] == null || typeof value[field] === "string",
  );
}

function trackProblem(track) {
  if (
    !isRecord(track) ||
    !isNonEmptyString(track.id) ||
    !isNonEmptyString(track.type)
  ) {
    return "each track requires non-empty string id and type";
  }
  if (!hasOnlyStringOptionalFields(track, ["label", "ref"])) {
    return "track label and ref must be strings when present";
  }
  return null;
}

function addAssignmentTrackProblems(p, problems) {
  if (!Array.isArray(p.trackTypes) || p.trackTypes.length < 1) problems.push("trackTypes must be a non-empty array");
  else if (p.trackTypes.some((type) => typeof type !== "string" || !type)) problems.push("trackTypes must contain non-empty strings");
  if (!Array.isArray(p.tracks)) {
    problems.push("tracks must be an array");
    return;
  }
  for (const track of p.tracks) {
    const problem = trackProblem(track);
    if (problem) {
      problems.push(problem);
      return;
    }
  }
}

function takeProblem(take) {
  if (!isRecord(take) || !isNonEmptyString(take.id)) {
    return "each take requires a non-empty string id";
  }
  if (!hasOnlyStringOptionalFields(take, ["label", "mediaPath"])) {
    return "take label and mediaPath must be strings when present";
  }
  return null;
}

function addAssignmentTakeProblems(p, problems) {
  if (!Array.isArray(p.takes)) {
    problems.push("takes must be an array");
    return;
  }
  for (const take of p.takes) {
    const problem = takeProblem(take);
    if (problem) {
      problems.push(problem);
      return;
    }
  }
}

function addAssignmentOptionalProblems(p, problems) {
  if (typeof p.consentRequired !== "boolean") problems.push("consentRequired must be boolean");
  if (typeof p.title !== "string") problems.push("title must be a string");
  if (p.preferredTakeId !== null && typeof p.preferredTakeId !== "string") problems.push("preferredTakeId must be a string or null");
  if (p.assignmentPayloadStatus !== "ready") problems.push('assignmentPayloadStatus must be "ready"');
}

function assignmentProblems(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return ["payload must be an object"];
  }
  const p = /** @type {Record<string, unknown>} */ (payload);
  const problems = [];
  addAssignmentIdentityProblems(p, problems);
  addAssignmentTrackProblems(p, problems);
  addAssignmentTakeProblems(p, problems);
  addAssignmentOptionalProblems(p, problems);
  return problems;
}

/** Validate the multi-asset assignment payload before it crosses the LTI boundary. */
export function validateMultiAssetAssignmentPayload(payload) {
  const problems = assignmentProblems(payload);
  if (problems.length) return { ok: false, errors: problems.join("; ") };
  return { ok: true };
}
