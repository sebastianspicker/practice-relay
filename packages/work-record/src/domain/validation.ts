/**
 * Runtime validation shared by WorkRecord mutation modules.
 * Why: public mutations must enforce the same portable IDs and closed unions.
 */
import { ROLES, type Role, type Track, type TrackType } from "./types.ts";

const RESOURCE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const ROLE_SET: ReadonlySet<string> = new Set(ROLES);
const TRACK_TYPES: ReadonlySet<string> = new Set([
  "audio", "video", "music_notation", "movement_annotation", "movement_notation",
  "media_cues", "text", "assessment", "analysis",
]);
const ACCESSOR_VALUE = Symbol("track accessor value");

/** Rejects IDs that cannot safely act as stable record resource identifiers. */
export function assertResourceId(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !RESOURCE_ID.test(value)) {
    throw new Error(`${field} must be a valid resource id`);
  }
}

/** Rejects values outside the closed membership-role union. */
export function assertRole(value: unknown): asserts value is Role {
  if (typeof value !== "string" || !ROLE_SET.has(value)) {
    throw new Error("role must be a supported record role");
  }
}

/** Rejects values outside the closed track-type union. */
export function assertTrackType(value: unknown): asserts value is TrackType {
  if (typeof value !== "string" || !TRACK_TYPES.has(value)) throw new Error("track type must be supported");
}

/** Rejects optional text that is not a bounded string. */
export function assertOptionalText(value: unknown, field: string, maxLength: number): void {
  if (value !== undefined && (typeof value !== "string" || value.length > maxLength)) {
    throw new Error(`${field} must be a string of at most ${maxLength} characters`);
  }
}

/** Returns an own data property without consulting inherited values or accessors. */
function ownDataValue(record: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor) return undefined;
  return "value" in descriptor ? descriptor.value : ACCESSOR_VALUE;
}

/** Rejects values that are not ordinary records accepted at public mutation boundaries. */
function assertPlainObject(value: unknown): asserts value is object {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("track must be a plain object");
  }
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("track must be a plain object");
  }
}

/** Validates a complete track at every mutation boundary. */
export function assertTrack(track: unknown): asserts track is Track {
  assertPlainObject(track);
  assertResourceId(ownDataValue(track, "id"), "track id");
  assertTrackType(ownDataValue(track, "type"));
  assertOptionalText(ownDataValue(track, "label"), "track label", 500);
  assertOptionalText(ownDataValue(track, "ref"), "track ref", 4096);
}
