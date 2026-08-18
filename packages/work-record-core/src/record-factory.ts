/** WorkRecord construction and aggregate validation. */
import { assertResourceId } from "./validation.ts";
import {
  PROFILE_DEFINITIONS,
  PROFILE_IDS,
  WORK_RECORD_SCHEMA_VERSION,
  type ProfileDefinition,
  type ProfileId,
  type WorkRecord,
} from "./types.ts";

/** Default honest label for non-symbolic movement annotation tracks. */
export function annotationTrackLabel(): string {
  return "Movement annotation";
}

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

/** Checks the stable identity and profile-required fields of a record. */
export function validateWorkRecord(record: WorkRecord): void {
  if (!record || typeof record !== "object") throw new Error("WorkRecord must be an object");
  if (!record.id || !record.title) throw new Error("WorkRecord id and title are required");
  const profile = getProfileDefinition(record.profile);
  for (const field of profile.requiredFields) {
    if (record[field] === undefined) throw new Error(`WorkRecord profile requires ${field}`);
  }
}
