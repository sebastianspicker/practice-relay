/** Aggregate invariants that JSON Schema cannot express across WorkRecord fields. */
import type { WorkRecord } from "./types.ts";

/**
 * Verify referential integrity and unique aggregate identities after schema validation.
 *
 * `takeIds` remains the canonical take index: persisted v0.4 records may retain an
 * identifier without a matching rich `takes` entry, but every rich take must be indexed.
 */
export function assertWorkRecordAggregateInvariants(record: WorkRecord): void {
  assertUniqueValues(record.members.map((member) => member.userId), "member userId");
  assertUniqueIds(record.actors, "actor");
  assertUniqueIds(record.representedSubjects, "represented subject");
  assertUniqueIds(record.tracks, "track");
  assertUniqueIds(record.spine.markers ?? [], "marker");
  assertValidRegions(record);
  assertUniqueValues(record.takeIds, "takeId");
  assertUniqueIds(record.takes, "take");
  assertTakeCoherence(record);
  assertCommentAnchors(record);

  assertUniqueIds(record.comments, "comment");
  assertUniqueIds(record.versions, "version");
  assertUniqueValues(record.versions.map((version) => version.name), "version name");
  assertUniqueIds(record.usePolicySnapshots, "use policy snapshot");
  assertUniqueIds(record.artifacts, "artifact");
  assertUniqueIds(record.iterations, "iteration");
  assertUniqueIds(record.annotations, "annotation");
  assertUniqueIds(record.views, "view");
  assertUniqueIds(record.usePolicies, "use policy");
  assertUniqueIds(record.snapshots, "snapshot");

  for (const artifact of record.artifacts) {
    assertUniqueValues(artifact.representedSubjectIds ?? [], `artifact ${artifact.id} representedSubjectId`);
  }
  assertRepresentedSubjectReferences(record);
  assertArtifactReferences(record);
  assertVersionSnapshotReferences(record);
  assertRelationReferences(record);
}

/** Evidence artifacts and explicit policies may name only represented subjects. */
function assertRepresentedSubjectReferences(record: WorkRecord): void {
  const subjectIds = new Set(record.representedSubjects.map((subject) => subject.id));
  for (const artifact of record.artifacts) {
    for (const subjectId of artifact.representedSubjectIds ?? []) {
      if (!subjectIds.has(subjectId)) {
        throw new Error(`artifact represented subject not found: ${subjectId}`);
      }
    }
  }
  for (const policy of record.usePolicies) {
    if (!subjectIds.has(policy.representedSubjectId)) {
      throw new Error(`use policy represented subject not found: ${policy.representedSubjectId}`);
    }
  }
}

/** Relations may connect any identified entity retained by the aggregate. */
function assertRelationReferences(record: WorkRecord): void {
  const entityIds = new Set<string>([
    record.id,
    ...record.members.map((member) => member.userId),
    ...record.actors.map((actor) => actor.id),
    ...record.representedSubjects.map((subject) => subject.id),
    ...record.tracks.map((track) => track.id),
    ...(record.spine.markers ?? []).map((marker) => marker.id),
    ...(record.spine.regions ?? []).map((region) => region.id),
    ...record.takeIds,
    ...record.comments.map((comment) => comment.id),
    ...record.versions.map((version) => version.id),
    ...record.usePolicySnapshots.map((policy) => policy.id),
    ...record.artifacts.map((artifact) => artifact.id),
    ...record.iterations.map((iteration) => iteration.id),
    ...record.annotations.map((annotation) => annotation.id),
    ...record.views.map((view) => view.id),
    ...record.usePolicies.map((policy) => policy.id),
    ...record.snapshots.map((snapshot) => snapshot.id),
  ]);
  for (const relation of record.relations) {
    if (!entityIds.has(relation.subjectId)) {
      throw new Error(`relation subject not found: ${relation.subjectId}`);
    }
    if (!entityIds.has(relation.objectId)) {
      throw new Error(`relation object not found: ${relation.objectId}`);
    }
  }
}

/** Reject duplicate values in an identifier array with a stable first-failure error. */
function assertUniqueValues(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

/** Reject duplicate `id` identities in an aggregate collection. */
function assertUniqueIds(items: readonly { id: string }[], label: string): void {
  assertUniqueValues(items.map((item) => item.id), `${label} id`);
}

/** Keep parsed regions aligned with the public addRegion mutation's interval rule. */
function assertValidRegions(record: WorkRecord): void {
  const regions = record.spine.regions ?? [];
  assertUniqueIds(regions, "region");
  for (const region of regions) {
    if (
      !Number.isFinite(region.startMs)
      || !Number.isFinite(region.endMs)
      || region.startMs < 0
      || region.endMs < 0
      || region.endMs <= region.startMs
    ) {
      throw new Error("region times must be finite, nonnegative, and end after start");
    }
  }
}

/** Preserve id-only takes while requiring rich takes and preferred takes to use the index. */
function assertTakeCoherence(record: WorkRecord): void {
  const takeIds = new Set(record.takeIds);
  for (const take of record.takes) {
    if (!takeIds.has(take.id)) throw new Error(`take id is missing from takeIds: ${take.id}`);
  }
  if (record.preferredTakeId !== null && !takeIds.has(record.preferredTakeId)) {
    throw new Error(`preferredTakeId not found: ${record.preferredTakeId}`);
  }
}

/** Ensure comments cannot outlive their region or optional track anchor. */
function assertCommentAnchors(record: WorkRecord): void {
  const regionIds = new Set((record.spine.regions ?? []).map((region) => region.id));
  const trackIds = new Set(record.tracks.map((track) => track.id));
  for (const comment of record.comments) {
    if (!regionIds.has(comment.regionId)) throw new Error(`comment region not found: ${comment.regionId}`);
    if (comment.trackId !== undefined && !trackIds.has(comment.trackId)) {
      throw new Error(`comment track not found: ${comment.trackId}`);
    }
  }
}

/** Iterations and snapshots are materialized from the record's artifact collection. */
function assertArtifactReferences(record: WorkRecord): void {
  const artifactIds = new Set(record.artifacts.map((artifact) => artifact.id));
  for (const iteration of record.iterations) {
    assertUniqueValues(iteration.artifactIds, `iteration ${iteration.id} artifactId`);
    for (const artifactId of iteration.artifactIds) {
      if (!artifactIds.has(artifactId)) throw new Error(`iteration artifact not found: ${artifactId}`);
    }
  }
  for (const snapshot of record.snapshots) {
    assertUniqueValues(snapshot.artifactIds, `snapshot ${snapshot.id} artifactId`);
    for (const artifactId of snapshot.artifactIds) {
      if (!artifactIds.has(artifactId)) throw new Error(`snapshot artifact not found: ${artifactId}`);
    }
  }
}

/** Versions created by submitVersion always name one snapshot in the same aggregate. */
function assertVersionSnapshotReferences(record: WorkRecord): void {
  const snapshotIds = new Set(record.snapshots.map((snapshot) => snapshot.id));
  for (const version of record.versions) {
    if (!snapshotIds.has(version.snapshotRef)) throw new Error(`version snapshot not found: ${version.snapshotRef}`);
  }
}
