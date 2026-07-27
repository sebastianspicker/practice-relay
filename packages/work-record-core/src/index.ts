/**
 * @practice-relay/work-record-core - portable WorkRecord domain and contracts.
 *
 * Why: one product-neutral core must preserve institutional work structure,
 * authorship, representation, policy, and package portability without a UI or
 * application dependency.
 */
import {
  assertOptionalText,
  assertResourceId,
  assertRole,
  assertTrack,
} from "./validation.ts";

export * from "./access.ts";
export * from "./export.ts";
export * from "./movement.ts";
export * from "./record-store.ts";

/** Version stamped on records created by this contract. */
export const WORK_RECORD_SCHEMA_VERSION = "0.4";

/** Neutral profile identifiers supported by the v0.4 core. */
export const PROFILE_IDS = {
  core: "urn:work-record:profile:core:0.4",
  designStudio: "urn:work-record:profile:design-studio:0.1",
  fieldStudy: "urn:work-record:profile:field-study:0.1",
} as const;

/** Exact profile identifier supported by a WorkRecord. */
export type ProfileId = (typeof PROFILE_IDS)[keyof typeof PROFILE_IDS];

/** Strings prohibited at product mutation boundaries. */
export const FORBIDDEN_STRINGS = [
  "Labanotation",
  "AI coach",
  "AI feedback",
] as const;

/** Default honest label for non-symbolic movement annotation tracks. */
export function annotationTrackLabel(): string {
  return "Movement annotation";
}

/** Membership role used by record access policy. */
export type Role = "student" | "faculty" | "admin" | "guest";

/** Member allowed to participate in record mutation policy. */
export interface Member {
  userId: string;
  role: Role;
}

/** Person, group, or service acting on a work; never implies representation. */
export interface Actor {
  id: string;
  type: "Person" | "Organization" | "SoftwareApplication";
  name: string;
  roles?: string[];
}

/** Person or group represented by an artefact; distinct from an acting author. */
export interface RepresentedSubject {
  id: string;
  type: "Person" | "Group" | "Place" | "Other";
  label: string;
}

/** Multi-domain track types supported by a record. */
export type TrackType =
  | "audio"
  | "video"
  | "music_notation"
  | "movement_annotation"
  | "movement_notation"
  | "media_cues"
  | "text"
  | "assessment"
  | "analysis";

/** What movement tooling a record can host. */
export type MovementCapability = "none" | "annotation" | "mvei_view" | "mvei_edit";

/** One multi-domain track and its package or external reference. */
export interface Track {
  id: string;
  type: TrackType;
  label?: string;
  ref?: string;
}

/** Process take; preferred-take identity remains on the enclosing record. */
export interface Take {
  id: string;
  label?: string;
  mediaPath?: string;
  storageKey?: string;
  contentType?: string;
  sha256?: string;
  byteSize?: number;
}

/** Time region used as a stable annotation anchor. */
export interface Region {
  id: string;
  startMs: number;
  endMs: number;
  label?: string;
}

/** Shared absolute or hybrid time spine. */
export interface RecordSpine {
  schemaVersion: string;
  mode: "absolute" | "hybrid";
  durationMs: number;
  markers?: { id: string; tMs: number; label: string }[];
  regions?: Region[];
}

/** Region-anchored critique retained with the record. */
export interface Comment {
  id: string;
  regionId: string;
  trackId?: string;
  authorId: string;
  body: string;
  resolved: boolean;
  createdAt: string;
}

/** Immutable named version pointing to a snapshot identity. */
export interface VersionTag {
  id: string;
  name: string;
  createdAt: string;
  snapshotRef: string;
}

/** Latest-use-policy input retained for legacy-style member export gates. */
export interface UsePolicySnapshot {
  id: string;
  subjectId: string;
  purposes: string[];
  exportAllowed?: boolean;
  createdAt: string;
}

/** Immutable content reference retained as part of the work record. */
export interface Artifact {
  id: string;
  name: string;
  mediaType?: string;
  contentUrl?: string;
  sha256?: string;
  representedSubjectIds?: string[];
  preservationRequired?: boolean;
}

/** Typed relationship between entities in the record. */
export interface WorkRelation {
  subjectId: string;
  predicate: "hasPart" | "derivesFrom" | "references" | "documents" | "isVersionOf";
  objectId: string;
}

/** Durable process iteration, distinct from storage revision. */
export interface Iteration {
  id: string;
  createdAt: string;
  createdByActorId?: string;
  artifactIds: string[];
  note?: string;
}

/** W3C Web Annotation-shaped statement retained with a work. */
export interface WorkAnnotation {
  "@context": "http://www.w3.org/ns/anno.jsonld";
  id: string;
  type: "Annotation";
  body: unknown;
  target: string | { source: string; selector?: unknown };
  creator?: string;
  created?: string;
}

/** Portable view declaration for a work or artefact. */
export interface WorkView {
  id: string;
  type: "AnnotationCollection" | "Dataset" | "CreativeWork";
  label: string;
  items?: string[];
}

/** Explicit permission boundary for one represented subject and use. */
export interface UsePolicy {
  id: string;
  representedSubjectId: string;
  purpose: string;
  destination: string;
  state: "granted" | "denied" | "withdrawn";
  createdAt: string;
  evidenceRef?: string;
}

/** Provenance needed to audit a record projection. */
export interface Provenance {
  createdAt: string;
  createdByActorId?: string;
  sourceSystem?: string;
  sourceId?: string;
}

/** Immutable record state retained for review, submission, or preservation. */
export interface Snapshot {
  id: string;
  createdAt: string;
  artifactIds: string[];
  reason?: string;
}

/** Declares a profile's stable identity and required fields. */
export interface ProfileDefinition {
  id: ProfileId;
  label: string;
  requiredFields: (keyof WorkRecord)[];
}

/** Portable institutional multi-domain work document. */
export interface WorkRecord {
  id: string;
  schemaVersion: typeof WORK_RECORD_SCHEMA_VERSION;
  profile: ProfileId;
  revision?: number;
  title: string;
  members: Member[];
  actors: Actor[];
  representedSubjects: RepresentedSubject[];
  spine: RecordSpine;
  tracks: Track[];
  preferredTakeId: string | null;
  takeIds: string[];
  takes: Take[];
  comments: Comment[];
  versions: VersionTag[];
  usePolicySnapshots: UsePolicySnapshot[];
  movementCapability: MovementCapability;
  artifacts: Artifact[];
  relations: WorkRelation[];
  iterations: Iteration[];
  annotations: WorkAnnotation[];
  views: WorkView[];
  usePolicies: UsePolicy[];
  provenance: Provenance;
  snapshots: Snapshot[];
}

/** Built-in profile definitions with exact neutral identifiers. */
export const PROFILE_DEFINITIONS: readonly ProfileDefinition[] = [
  { id: PROFILE_IDS.core, label: "WorkRecord Core 0.4", requiredFields: ["tracks", "artifacts", "iterations", "usePolicies", "snapshots"] },
  { id: PROFILE_IDS.designStudio, label: "Design studio 0.1", requiredFields: ["artifacts", "iterations", "annotations"] },
  { id: PROFILE_IDS.fieldStudy, label: "Field study 0.1", requiredFields: ["artifacts", "representedSubjects", "usePolicies", "provenance"] },
];

/** Finds a supported profile definition. */
export function getProfileDefinition(id: ProfileId): ProfileDefinition {
  const profile = PROFILE_DEFINITIONS.find((candidate) => candidate.id === id);
  if (!profile) throw new Error(`unsupported WorkRecord profile: ${id}`);
  return profile;
}

/** Creates an empty v0.4 record with safe product-neutral defaults. */
export function createEmptyRecord(id: string, title: string): WorkRecord {
  assertResourceId(id, "record id");
  if (typeof title !== "string" || !title.trim() || title.length > 500) {
    throw new Error("record title must be a non-empty string of at most 500 characters");
  }
  return {
    id,
    schemaVersion: WORK_RECORD_SCHEMA_VERSION,
    profile: PROFILE_IDS.core,
    title,
    members: [],
    actors: [],
    representedSubjects: [],
    spine: { schemaVersion: WORK_RECORD_SCHEMA_VERSION, mode: "absolute", durationMs: 0, markers: [], regions: [] },
    tracks: [],
    preferredTakeId: null,
    takeIds: [],
    takes: [],
    comments: [],
    versions: [],
    usePolicySnapshots: [],
    movementCapability: "annotation",
    artifacts: [],
    relations: [],
    iterations: [],
    annotations: [],
    views: [],
    usePolicies: [],
    provenance: { createdAt: new Date().toISOString() },
    snapshots: [],
  };
}

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

/** Reject region bounds that cannot represent a finite forward interval. */
function assertRegionTimes(region: Region): void {
  if (!Number.isFinite(region.startMs) || !Number.isFinite(region.endMs)) throw new Error("region times must be finite, nonnegative, and end after start");
  if (region.startMs < 0 || region.endMs < 0 || region.endMs <= region.startMs) throw new Error("region times must be finite, nonnegative, and end after start");
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

/** Attaches a validated immutable use-policy snapshot. */
export function attachUsePolicySnapshot(record: WorkRecord, policy: UsePolicySnapshot): WorkRecord {
  assertResourceId(policy.id, "use policy id");
  assertResourceId(policy.subjectId, "use policy subjectId");
  if (!Array.isArray(policy.purposes) || policy.purposes.length === 0 || policy.purposes.length > 32 || policy.purposes.some((purpose) => typeof purpose !== "string" || !purpose.trim() || purpose.length > 256)) {
    throw new Error("use policy purposes must contain 1 to 32 bounded strings");
  }
  if (policy.exportAllowed !== undefined && typeof policy.exportAllowed !== "boolean") {
    throw new Error("use policy exportAllowed must be boolean");
  }
  if (typeof policy.createdAt !== "string" || !policy.createdAt.trim()) {
    throw new Error("use policy createdAt must be a non-empty string");
  }
  if (record.usePolicySnapshots.some((existing) => existing.id === policy.id)) {
    throw new Error(`use policy id already exists: ${policy.id}`);
  }
  return { ...record, usePolicySnapshots: [...record.usePolicySnapshots, { ...policy }] };
}

/** Checks whether all student members have a current exportable use-policy snapshot. */
export function hasExportableUsePolicy(record: WorkRecord): boolean {
  const latestBySubject = new Map<string, UsePolicySnapshot>();
  for (const policy of record.usePolicySnapshots) latestBySubject.set(policy.subjectId, policy);
  const exportable = (subjectId: string) => {
    const policy = latestBySubject.get(subjectId);
    return Boolean(policy && policy.purposes.length > 0 && policy.exportAllowed !== false);
  };
  const studentSubjects = [...new Set(record.members.filter((member) => member.role === "student").map((member) => member.userId))];
  return studentSubjects.length > 0
    ? studentSubjects.every(exportable)
    : [...latestBySubject.keys()].some(exportable);
}

/** Throws if a record lacks an exportable use-policy snapshot. */
export function assertCanExport(record: WorkRecord): void {
  if (!hasExportableUsePolicy(record)) throw new Error("use policy required before export or share");
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

/** Checks the stable identity and profile-required fields of a record. */
export function validateWorkRecord(record: WorkRecord): void {
  if (!record || typeof record !== "object") throw new Error("WorkRecord must be an object");
  if (!record.id || !record.title) throw new Error("WorkRecord id and title are required");
  const profile = getProfileDefinition(record.profile);
  for (const field of profile.requiredFields) {
    if (record[field] === undefined) throw new Error(`WorkRecord profile requires ${field}`);
  }
}
