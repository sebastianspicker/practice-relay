/**
 * Product-neutral WorkRecord domain constants and contracts.
 *
 * Why: one product-neutral core must preserve institutional work structure,
 * authorship, representation, policy, and package portability without a UI or
 * application dependency.
 */
import type { Take } from "../media/take.ts";
import type { UsePolicy, UsePolicySnapshot } from "../policy/types.ts";
import type { TimeRegion, TimeSpine } from "../time/time-spine.ts";

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

/** Closed membership-role vocabulary used by record access policy. */
export const ROLES = ["student", "faculty", "admin", "guest"] as const;

/** Membership role used by record access policy. */
export type Role = (typeof ROLES)[number];

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

/** Compatibility name for the canonical time-region contract. */
export type Region = TimeRegion;

/** Compatibility name for the canonical time-spine contract. */
export type RecordSpine = TimeSpine;

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

/** Nonnegative safe integer verified at every untrusted WorkRecord boundary. */
export type WorkRecordRevision = number;

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
  revision?: WorkRecordRevision;
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
