/** Shared multi-asset assignment child-field validation and projection. */

/** Return whether a value is a non-empty string. */
export function isNonEmptyString(value) {
  return typeof value === "string" && Boolean(value);
}

/** Return whether a value is a non-array object. */
export function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isObjectLike(value) {
  return Boolean(value) && typeof value === "object";
}

/** Return whether each named optional field is absent or a string. */
export function hasOnlyStringOptionalFields(value, fields) {
  return fields.every(
    (field) => value[field] == null || typeof value[field] === "string",
  );
}

/** Return the validation message for a track, if it is invalid. */
export function trackProblem(track, isValidObject = isRecord) {
  if (
    !isValidObject(track) ||
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

/** Return the validation message for a take, if it is invalid. */
export function takeProblem(take, isValidObject = isRecord) {
  if (!isValidObject(take) || !isNonEmptyString(take.id)) {
    return "each take requires a non-empty string id";
  }
  if (!hasOnlyStringOptionalFields(take, ["label", "mediaPath"])) {
    return "take label and mediaPath must be strings when present";
  }
  return null;
}

function throwProblem(problem) {
  throw new TypeError(problem);
}

/** Validate and project the source tracks used by an assignment payload. */
export function projectAssignmentTracks(rawTracks) {
  const sourceTracks = Array.isArray(rawTracks) ? rawTracks : [];
  for (const track of sourceTracks) {
    const problem = trackProblem(track, isObjectLike);
    if (problem) throwProblem(problem);
  }

  return {
    tracks: sourceTracks.map((track) => ({
      id: track.id,
      type: track.type,
      label: track.label,
      ref: track.ref,
    })),
    trackTypes: [
      ...new Set(sourceTracks.map((track) => track.type).filter(Boolean)),
    ],
    mveiTrack: sourceTracks.find((track) => track.type === "movement_notation"),
    musicTrack: sourceTracks.find((track) => track.type === "music_notation"),
  };
}

/** Validate and project rich takes or their legacy id-only representation. */
export function projectAssignmentTakes(rawTakes, rawTakeIds) {
  const richTakes = Array.isArray(rawTakes) ? rawTakes : [];
  for (const take of richTakes) {
    const problem = takeProblem(take, isObjectLike);
    if (problem) throwProblem(problem);
  }

  const takeIds = Array.isArray(rawTakeIds) ? rawTakeIds : [];
  if (
    richTakes.length === 0 &&
    takeIds.some((id) => typeof id !== "string" || !id)
  ) {
    throw new TypeError("each takeId requires a non-empty string");
  }
  return richTakes.length > 0
    ? richTakes.map((take) => ({
        id: take.id,
        label: take.label,
        mediaPath: take.mediaPath,
      }))
    : takeIds.map((id) => ({ id }));
}
