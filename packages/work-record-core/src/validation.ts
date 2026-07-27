/**
 * Runtime validation shared by WorkRecord mutation modules.
 * Why: public mutations must enforce the same portable IDs and closed unions.
 */
import type { Role, Track, TrackType } from "./index.ts";

const RESOURCE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const ROLES: ReadonlySet<Role> = new Set<Role>(["student", "faculty", "admin", "guest"]);
const TRACK_TYPES: ReadonlySet<TrackType> = new Set<TrackType>([
  "audio", "video", "music_notation", "movement_annotation", "movement_notation",
  "media_cues", "text", "assessment", "analysis",
]);

/** Rejects IDs that cannot safely act as stable record resource identifiers. */
export function assertResourceId(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !RESOURCE_ID.test(value)) {
    throw new Error(`${field} must be a valid resource id`);
  }
}

/** Rejects values outside the closed membership-role union. */
export function assertRole(value: unknown): asserts value is Role {
  if (typeof value !== "string" || !ROLES.has(value as Role)) {
    throw new Error("role must be a supported record role");
  }
}

/** Rejects values outside the closed track-type union. */
export function assertTrackType(value: unknown): asserts value is TrackType {
  if (typeof value !== "string" || !TRACK_TYPES.has(value as TrackType)) throw new Error("track type must be supported");
}

/** Rejects optional text that is not a bounded string. */
export function assertOptionalText(value: unknown, field: string, maxLength: number): void {
  if (value !== undefined && (typeof value !== "string" || value.length > maxLength)) {
    throw new Error(`${field} must be a string of at most ${maxLength} characters`);
  }
}

/** Validates a complete track at every mutation boundary. */
export function assertTrack(track: Track): void {
  assertResourceId(track.id, "track id");
  assertTrackType(track.type);
  assertOptionalText(track.label, "track label", 500);
  assertOptionalText(track.ref, "track ref", 4096);
}
