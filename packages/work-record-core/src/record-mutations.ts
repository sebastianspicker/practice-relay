/** Product-neutral immutable WorkRecord mutations. */
import {
  assertOptionalText,
  assertResourceId,
  assertRole,
  assertTrack,
} from "./validation.ts";
import type {
  Comment,
  Member,
  Region,
  Snapshot,
  Take,
  Track,
  VersionTag,
  WorkRecord,
} from "./types.ts";

/** Immutably appends a uniquely identified track. */
export function addTrack(record: WorkRecord, track: Track): WorkRecord {
  assertTrack(track);
  if (record.tracks.some((existing) => existing.id === track.id)) {
    throw new Error(`track id already exists: ${track.id}`);
  }
  return { ...record, tracks: [...record.tracks, track] };
}

/** Adds or merges a take while reconciling both take indexes. */
export function addTake(record: WorkRecord, take: Take): WorkRecord {
  assertResourceId(take.id, "take id");
  assertOptionalText(take.label, "take label", 500);
  assertOptionalText(take.mediaPath, "take mediaPath", 4096);
  assertOptionalText(take.storageKey, "take storageKey", 4096);
  assertOptionalText(take.contentType, "take contentType", 255);
  assertOptionalText(take.sha256, "take sha256", 128);
  if (take.byteSize !== undefined && (!Number.isFinite(take.byteSize) || take.byteSize < 0)) {
    throw new Error("take byteSize must be a finite nonnegative number");
  }
  const hasTakeId = record.takeIds.includes(take.id);
  const hasTake = record.takes.some((existing) => existing.id === take.id);
  return {
    ...record,
    takeIds: hasTakeId ? record.takeIds : [...record.takeIds, take.id],
    takes: hasTake
      ? record.takes.map((existing) => existing.id === take.id ? { ...existing, ...take } : existing)
      : [...record.takes, take],
  };
}

/** Sets the preferred take after verifying it exists. */
export function setPreferredTake(record: WorkRecord, takeId: string): WorkRecord {
  assertResourceId(takeId, "take id");
  if (!record.takeIds.includes(takeId)) throw new Error(`takeId not found: ${takeId}`);
  return { ...record, preferredTakeId: takeId };
}

/** Adds a unique, finite region to the record spine. */
export function addRegion(record: WorkRecord, region: Region): WorkRecord {
  assertResourceId(region.id, "region id");
  assertRegionTimes(region);
  if ((record.spine.regions ?? []).some((existing) => existing.id === region.id)) {
    throw new Error(`region id already exists: ${region.id}`);
  }
  return { ...record, spine: { ...record.spine, regions: [...(record.spine.regions ?? []), region] } };
}

/** Adds a uniquely identified comment anchored to an existing region and track. */
export function addComment(
  record: WorkRecord,
  comment: Omit<Comment, "id" | "createdAt"> & { id?: string; createdAt?: string },
): WorkRecord {
  assertResourceId(comment.regionId, "regionId");
  assertResourceId(comment.authorId, "comment authorId");
  validateCommentAnchor(record, comment);
  const id = comment.id ?? nextCommentId(record.comments);
  assertResourceId(id, "comment id");
  if (record.comments.some((existing) => existing.id === id)) throw new Error(`comment id already exists: ${id}`);
  const full: Comment = { ...comment, id, resolved: comment.resolved ?? false, createdAt: comment.createdAt ?? new Date().toISOString() };
  return { ...record, comments: [...record.comments, full] };
}

/** Creates one immutable version and corresponding snapshot per unique name. */
export function submitVersion(record: WorkRecord, name: string): WorkRecord {
  assertResourceId(name, "submission name");
  if (record.versions.some((version) => version.name === name)) return record;
  const snapshotRef = `snapshot-${name}-${record.versions.length}`;
  const createdAt = new Date().toISOString();
  const version: VersionTag = { id: `ver-${name}-${record.versions.length}`, name, createdAt, snapshotRef };
  const snapshot: Snapshot = { id: snapshotRef, createdAt, artifactIds: record.artifacts.map((artifact) => artifact.id), reason: name };
  return { ...record, versions: [...record.versions, version], snapshots: [...record.snapshots, snapshot] };
}

/** Looks up an immutable version tag by name. */
export function getVersionTag(record: WorkRecord, name: string): VersionTag | undefined {
  return record.versions.find((version) => version.name === name);
}

/** Adds or updates a record member by user identity. */
export function addMember(record: WorkRecord, member: Member): WorkRecord {
  assertResourceId(member.userId, "member userId");
  assertRole(member.role);
  const exists = record.members.some((existing) => existing.userId === member.userId);
  return {
    ...record,
    members: exists
      ? record.members.map((existing) => existing.userId === member.userId ? member : existing)
      : [...record.members, member],
  };
}

/** Reject region bounds that cannot represent a finite forward interval. */
function assertRegionTimes(region: Region): void {
  if (!Number.isFinite(region.startMs) || !Number.isFinite(region.endMs)) throw new Error("region times must be finite, nonnegative, and end after start");
  if (region.startMs < 0 || region.endMs < 0 || region.endMs <= region.startMs) throw new Error("region times must be finite, nonnegative, and end after start");
}

/** Verify a comment body and its optional track/region anchors. */
function validateCommentAnchor(record: WorkRecord, comment: Omit<Comment, "id" | "createdAt"> & { id?: string; createdAt?: string }): void {
  if (typeof comment.body !== "string" || !comment.body.trim() || comment.body.length > 100_000) throw new Error("comment body must be a non-empty string of at most 100000 characters");
  if (!(record.spine.regions ?? []).some((region) => region.id === comment.regionId)) throw new Error(`comment region not found: ${comment.regionId}`);
  if (comment.trackId === undefined) return;
  assertResourceId(comment.trackId, "comment trackId");
  if (!record.tracks.some((track) => track.id === comment.trackId)) throw new Error(`comment track not found: ${comment.trackId}`);
}

/** Allocate the first unused generated comment identifier. */
function nextCommentId(comments: Comment[]): string {
  let sequence = comments.length + 1;
  while (comments.some((existing) => existing.id === `cmt-${sequence}`)) sequence += 1;
  return `cmt-${sequence}`;
}
