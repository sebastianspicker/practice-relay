/**
 * Pure adapters from WorkRecord payloads to Practice Relay workspace display fields.
 * Why residual: the browser surface must normalise snapshots, policies, and tracks
 * without coupling render code to collection-item shape drift.
 */

/** Coerce a value to an array; non-arrays become an empty list. */
export function strings(items) {
  return Array.isArray(items) ? items : [];
}

/** Pick a human-readable label from common WorkRecord field names. */
export function label(item, fallback) {
  return String(item?.label ?? item?.name ?? item?.title ?? item?.id ?? fallback);
}

/** First element of a list, or the provided fallback when empty. */
function first(items, fallback) {
  return strings(items)[0] ?? fallback;
}

/** Adapt a WorkRecord or older collection item into the display fields the browser workspace needs. */
export function toWorkspaceRecord(record) {
  const artifacts = strings(record.artifacts).length
    ? record.artifacts
    : strings(record.evidence).map((name, index) => ({ id: `evidence-${index}`, name }));
  const snapshots = strings(record.snapshots);
  const versions = strings(record.versions);
  const policies = strings(record.usePolicies);
  const snapshot = first(snapshots, null);
  const includedIds = snapshot?.artifactIds?.length
    ? snapshot.artifactIds.map(String)
    : artifacts.map((artifact) => String(artifact.id));
  return {
    id: String(record.id ?? "local-record"),
    title: String(record.title ?? "Untitled work record"),
    profile: String(record.profile ?? "WorkRecord"),
    revision: record.revision ?? versions.length,
    artifacts,
    tracks: strings(record.tracks),
    members: strings(record.members ?? record.collaborators),
    subjects: strings(record.representedSubjects ?? record.subjects),
    policies,
    snapshots,
    versions,
    comments: strings(record.comments),
    provenance: record.provenance ?? {},
    snapshotLabel: snapshot ? `Snapshot ${snapshot.id.replace(/^snapshot-/, "").replace(/-/g, " ")}` : "No snapshot",
    submitted: snapshot?.createdAt ?? record.updated,
    handoff: snapshot?.reason ?? record.handoff ?? "Local review",
    preferred: record.preferredTakeId ? String(record.preferredTakeId) : "Not selected",
    motion: strings(record.tracks).find((track) => track.type === "movement_annotation"),
    includedIds,
  };
}
