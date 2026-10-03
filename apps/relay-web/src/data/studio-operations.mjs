/** Authenticated studio operations backed only by existing Relay API routes. */

/** Return the canonical selected record or fail before making a remote request. */
function selectedRecord(controller) {
  const record = controller?.state?.selected?.raw;
  if (!record?.id) throw new Error("Select a canonical WorkRecord first.");
  return record;
}

/** Encode one record-scoped route without allowing ids to change path structure. */
function recordPath(recordId, resource = "") {
  return `/work-records/${encodeURIComponent(recordId)}${resource}`;
}

/** Require the optimistic-concurrency revision carried by a fresh record. */
function revisionHeaders(record) {
  if (!Number.isInteger(record?.revision) || record.revision < 0) {
    throw new Error("The canonical WorkRecord has no valid revision.");
  }
  return { "If-Match": String(record.revision) };
}

/** Convert bytes to a stable lowercase SHA-256 hex digest. */
async function sha256(text) {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Preserve caller JSON bytes while rejecting content that is not JSON. */
function documentText(document) {
  if (typeof document === "string") {
    const parsed = JSON.parse(document);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Movement document must be a JSON object or JSON string.");
    }
    return document;
  }
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error("Movement document must be a JSON object or JSON string.");
  }
  return JSON.stringify(document);
}

/** Require an explicit unique selection of represented subjects known to the record. */
function validateSubjectIds(record, subjectIds) {
  if (!Array.isArray(subjectIds) || subjectIds.length === 0) {
    throw new Error("Select at least one represented subject for this movement document.");
  }
  if (subjectIds.some((id) => typeof id !== "string" || id.trim() === "")) {
    throw new Error("Represented subject selections must contain valid ids.");
  }
  const selected = subjectIds.map((id) => id.trim());
  if (new Set(selected).size !== selected.length) {
    throw new Error("Represented subject selections must be unique.");
  }
  const known = new Set((record.representedSubjects ?? []).map((subject) => subject.id));
  const unknown = selected.find((id) => !known.has(id));
  if (unknown) throw new Error(`Unknown represented subject: ${unknown}`);
  return selected;
}

/** Build an absolute, authenticated API-owned media URL for the stored object. */
function mediaUrl(controller, storageKey) {
  if (typeof storageKey !== "string" || storageKey === "") {
    throw new Error("The media upload returned no storage key.");
  }
  const encodedKey = storageKey.split("/").map(encodeURIComponent).join("/");
  try { return new URL(`/media/${encodedKey}`, controller.apiBase).href; }
  catch { throw new Error("The Relay API base must be an absolute URL for media evidence."); }
}

/** Attach progress details to an error so the same document can resume safely. */
function recoverable(error, pending) {
  const failure = error instanceof Error ? error : new Error(String(error));
  failure.pending = Object.freeze({ ...pending });
  return failure;
}

/** Compare subject links without making their input order significant. */
function sameSubjectIds(left = [], right = []) {
  return left.length === right.length
    && [...left].sort().every((id, index) => id === [...right].sort()[index]);
}

/** Evaluate a purpose-and-destination evidence export against server policy. */
export async function exportEvidence(controller, { purpose, destination }) {
  const record = selectedRecord(controller);
  return controller.request(recordPath(record.id, "/exports"), {
    body: { purpose, destination },
  });
}

/** Append one policy against a fresh revision and accept the returned canonical record. */
export async function addPolicy(controller, policy) {
  const fresh = await controller.refresh();
  const record = await controller.request(recordPath(fresh.id, "/policies"), {
    body: policy,
    headers: revisionHeaders(fresh),
  });
  return { record, workspace: controller.accept(record) };
}

/**
 * Store one immutable MvEI JSON version, register its evidence, and attach its track.
 * Repeating the same input resumes hash-derived stages already present in the record.
 */
export async function attachMovement(controller, { document, subjectIds, filename }) {
  const initial = selectedRecord(controller);
  const explicitSubjects = validateSubjectIds(initial, subjectIds);
  const text = documentText(document);
  const hash = await sha256(text);
  const suffix = hash.slice(0, 24);
  const takeId = `mvei-take-${suffix}`;
  const artifactId = `mvei-artifact-${suffix}`;
  const trackId = `mvei-track-${suffix}`;
  const name = typeof filename === "string" && filename.trim()
    ? filename.trim()
    : `movement-${suffix}.json`;
  if (name.length > 500) throw new Error("Movement filename must be at most 500 characters.");
  const pending = {
    recordId: String(initial.id),
    sha256: hash,
    takeId,
    artifactId,
    trackId,
    filename: name,
    stage: "refresh",
  };

  try {
    let record = await controller.refresh();
    if (String(record.id) !== pending.recordId) throw new DOMException("Selected record changed", "AbortError");
    const subjects = validateSubjectIds(record, explicitSubjects);

    pending.stage = "upload";
    let take = (record.takes ?? []).find((item) => item.id === takeId);
    let media;
    if (take) {
      if (take.sha256 !== hash || !take.storageKey) {
        throw new Error("The existing movement take conflicts with this immutable document version.");
      }
      media = take;
    } else {
      const upload = await controller.request(
        recordPath(record.id, `/takes/${encodeURIComponent(takeId)}/media`),
        {
          method: "POST",
          rawBody: text,
          headers: { ...revisionHeaders(record), "Content-Type": "application/json" },
        },
      );
      if (!upload?.record || upload?.media?.sha256 !== hash) {
        throw new Error("The Relay media hash did not match the movement document.");
      }
      record = upload.record;
      media = upload.media;
      controller.accept(record);
    }

    const contentUrl = mediaUrl(controller, media.storageKey);
    pending.stage = "artifact";
    let artifact = (record.artifacts ?? []).find((item) => item.id === artifactId);
    if (artifact) {
      if (artifact.sha256 !== hash || artifact.contentUrl !== contentUrl
        || artifact.name !== name
        || !sameSubjectIds(artifact.representedSubjectIds, subjects)) {
        throw new Error("The existing movement artifact conflicts with this immutable document version.");
      }
    } else {
      record = await controller.request(recordPath(record.id, "/artifacts"), {
        body: {
          id: artifactId,
          name,
          mediaType: "application/json",
          contentUrl,
          sha256: media.sha256,
          representedSubjectIds: subjects,
          preservationRequired: true,
        },
        headers: revisionHeaders(record),
      });
      controller.accept(record);
      artifact = record.artifacts?.find((item) => item.id === artifactId);
    }

    pending.stage = "track";
    const track = (record.tracks ?? []).find((item) => item.id === trackId);
    if (track) {
      if (track.type !== "movement_notation" || track.ref !== contentUrl || track.label !== name) {
        throw new Error("The existing MvEI track conflicts with this immutable document version.");
      }
    } else {
      record = await controller.request(recordPath(record.id, "/mvei"), {
        body: { id: trackId, ref: contentUrl, label: name },
        headers: revisionHeaders(record),
      });
    }

    pending.stage = "complete";
    const workspace = controller.accept(record);
    return {
      record,
      workspace,
      media,
      contentUrl,
      sha256: hash,
      takeId,
      artifactId,
      trackId,
      stage: "complete",
    };
  } catch (error) {
    throw recoverable(error, pending);
  }
}
