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

function inspectOwnDataProperty(value, name) {
  const descriptor = Object.getOwnPropertyDescriptor(value, name);
  const isData = Boolean(descriptor && Object.hasOwn(descriptor, "value"));
  return {
    present: Boolean(descriptor),
    isData,
    value: isData ? descriptor.value : undefined,
  };
}

function inspectRequiredString(value, name) {
  const property = inspectOwnDataProperty(value, name);
  return { valid: property.isData && isNonEmptyString(property.value), value: property.value };
}

function inspectOptionalString(value, name) {
  const property = inspectOwnDataProperty(value, name);
  return {
    valid:
      !property.present ||
      (property.isData &&
        (property.value == null || typeof property.value === "string")),
    value: property.isData ? property.value : undefined,
  };
}

/** Return whether each named optional field is absent or a string. */
export function hasOnlyStringOptionalFields(value, fields) {
  return fields.every((field) => inspectOptionalString(value, field).valid);
}

function inspectTrack(track, isValidObject) {
  if (!isValidObject(track)) {
    return { problem: "each track requires non-empty string id and type" };
  }
  const id = inspectRequiredString(track, "id");
  if (!id.valid) {
    return { problem: "each track requires non-empty string id and type" };
  }
  const type = inspectRequiredString(track, "type");
  if (!type.valid) {
    return { problem: "each track requires non-empty string id and type" };
  }
  const label = inspectOptionalString(track, "label");
  const ref = inspectOptionalString(track, "ref");
  if (!label.valid || !ref.valid) {
    return { problem: "track label and ref must be strings when present" };
  }
  return {
    problem: null,
    value: { id: id.value, type: type.value, label: label.value, ref: ref.value },
  };
}

function inspectTake(take, isValidObject) {
  if (!isValidObject(take)) {
    return { problem: "each take requires a non-empty string id" };
  }
  const id = inspectRequiredString(take, "id");
  if (!id.valid) {
    return { problem: "each take requires a non-empty string id" };
  }
  const label = inspectOptionalString(take, "label");
  const mediaPath = inspectOptionalString(take, "mediaPath");
  if (!label.valid || !mediaPath.valid) {
    return { problem: "take label and mediaPath must be strings when present" };
  }
  return {
    problem: null,
    value: { id: id.value, label: label.value, mediaPath: mediaPath.value },
  };
}

/** Return the validation message for a track, if it is invalid. */
export function trackProblem(track, isValidObject = isRecord) {
  return inspectTrack(track, isValidObject).problem;
}

/** Return the validation message for a take, if it is invalid. */
export function takeProblem(take, isValidObject = isRecord) {
  return inspectTake(take, isValidObject).problem;
}

function throwProblem(problem) {
  throw new TypeError(problem);
}

/** Validate and project the source tracks used by an assignment payload. */
export function projectAssignmentTracks(rawTracks) {
  const sourceTracks = Array.isArray(rawTracks) ? rawTracks : [];
  const tracks = [];
  for (const track of sourceTracks) {
    const inspected = inspectTrack(track, isObjectLike);
    if (inspected.problem) throwProblem(inspected.problem);
    tracks.push(inspected.value);
  }

  return {
    tracks,
    trackTypes: [...new Set(tracks.map((track) => track.type).filter(Boolean))],
    mveiTrack: tracks.find((track) => track.type === "movement_notation"),
    musicTrack: tracks.find((track) => track.type === "music_notation"),
  };
}

/** Validate and project rich takes or their legacy id-only representation. */
export function projectAssignmentTakes(rawTakes, rawTakeIds) {
  const richTakes = Array.isArray(rawTakes) ? rawTakes : [];
  const takes = [];
  for (const take of richTakes) {
    const inspected = inspectTake(take, isObjectLike);
    if (inspected.problem) throwProblem(inspected.problem);
    takes.push(inspected.value);
  }

  const takeIds = Array.isArray(rawTakeIds) ? rawTakeIds : [];
  const legacyTakes = [];
  if (richTakes.length === 0) {
    for (const id of takeIds) {
      if (typeof id !== "string" || !id) {
        throw new TypeError("each takeId requires a non-empty string");
      }
      legacyTakes.push({ id });
    }
  }
  return richTakes.length > 0 ? takes : legacyTakes;
}
