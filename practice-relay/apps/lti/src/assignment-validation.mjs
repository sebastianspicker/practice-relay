/** Multi-asset assignment payload validation at the LTI boundary. */
import { trackProblem, takeProblem } from "./assignment-fields.mjs";

function addAssignmentIdentityProblems(payload, problems) {
  if (payload.kind !== "practice-relay-multi-asset-assignment") {
    problems.push('kind must be "practice-relay-multi-asset-assignment"');
  }
  if (typeof payload.packageId !== "string" || !payload.packageId) {
    problems.push("packageId required");
  }
  if (payload.assetMode !== "multi-asset") {
    problems.push('assetMode must be "multi-asset"');
  }
  if (payload.singleVideoUrl != null) {
    problems.push("singleVideoUrl must be null (not video-only assignment)");
  }
}

function addAssignmentTrackProblems(payload, problems) {
  if (!Array.isArray(payload.trackTypes) || payload.trackTypes.length < 1) {
    problems.push("trackTypes must be a non-empty array");
  } else if (
    payload.trackTypes.some((type) => typeof type !== "string" || !type)
  ) {
    problems.push("trackTypes must contain non-empty strings");
  }
  if (!Array.isArray(payload.tracks)) {
    problems.push("tracks must be an array");
    return;
  }
  for (const track of payload.tracks) {
    const problem = trackProblem(track);
    if (problem) {
      problems.push(problem);
      return;
    }
  }
}

function addAssignmentTakeProblems(payload, problems) {
  if (!Array.isArray(payload.takes)) {
    problems.push("takes must be an array");
    return;
  }
  for (const take of payload.takes) {
    const problem = takeProblem(take);
    if (problem) {
      problems.push(problem);
      return;
    }
  }
}

function addAssignmentOptionalProblems(payload, problems) {
  if (typeof payload.consentRequired !== "boolean") {
    problems.push("consentRequired must be boolean");
  }
  if (typeof payload.title !== "string") problems.push("title must be a string");
  if (
    payload.preferredTakeId !== null &&
    typeof payload.preferredTakeId !== "string"
  ) {
    problems.push("preferredTakeId must be a string or null");
  }
  if (payload.assignmentPayloadStatus !== "ready") {
    problems.push('assignmentPayloadStatus must be "ready"');
  }
}

function assignmentProblems(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return ["payload must be an object"];
  }
  const assignment = /** @type {Record<string, unknown>} */ (payload);
  const problems = [];
  addAssignmentIdentityProblems(assignment, problems);
  addAssignmentTrackProblems(assignment, problems);
  addAssignmentTakeProblems(assignment, problems);
  addAssignmentOptionalProblems(assignment, problems);
  return problems;
}

/** Validate the multi-asset assignment payload before it crosses the LTI boundary. */
export function validateMultiAssetAssignmentPayload(payload) {
  const problems = assignmentProblems(payload);
  if (problems.length) return { ok: false, errors: problems.join("; ") };
  return { ok: true };
}
