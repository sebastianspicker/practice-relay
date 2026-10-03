/**
 * Canonical take and media identity for WorkRecord records and handoffs.
 *
 * Why: process archive needs multiple takes plus a preferred take, separate
 * from the UI player. This is the inline WorkRecord take, validated by
 * media-take.schema.json and embedded in WorkRecord documents.
 */

export const MEDIA_SCHEMA_VERSION = "0.1.0";
export const SCHEMA_VERSION = MEDIA_SCHEMA_VERSION;

/** One media take (e.g. studio run). */
export interface Take {
  id: string;
  label?: string;
  mediaPath?: string;
  recordedAt?: string;
  storageKey?: string;
  contentType?: string;
  sha256?: string;
  byteSize?: number;
}

/**
 * Construct a take with required id; merge optional fields from opts.
 * `id` always wins over opts.id so callers cannot accidentally diverge.
 */
export function createTake(id: string, opts?: Partial<Take>): Take {
  const take = { ...opts, id };
  assertTake(take);
  return take;
}

/** Validate the inline WorkRecord take against its stable schema contract. */
export function assertTake(take: unknown): asserts take is Take {
  if (take === null || typeof take !== "object" || Array.isArray(take)) {
    throw new Error("take must be an object");
  }
  for (const key of Object.keys(take)) {
    if (!TAKE_KEYS.has(key)) throw new Error(`take contains unsupported property: ${key}`);
  }
  const values = Object.fromEntries(
    [...TAKE_KEYS].map((key) => [key, ownDataValue(take, key)]),
  ) as Partial<Take>;
  if (typeof values.id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(values.id)) {
    throw new Error("take id must be a valid resource id");
  }
  assertOptionalText(values.label, "take label", 500);
  assertOptionalText(values.mediaPath, "take mediaPath", 4096);
  assertOptionalText(values.storageKey, "take storageKey", 4096);
  assertOptionalText(values.contentType, "take contentType", 255);
  assertOptionalText(values.sha256, "take sha256", 128);
  if (values.recordedAt !== undefined && !isRfc3339DateTime(values.recordedAt)) {
    throw new Error("take recordedAt must be an RFC 3339 date-time");
  }
  if (values.byteSize !== undefined && (!Number.isFinite(values.byteSize) || values.byteSize < 0)) {
    throw new Error("take byteSize must be a finite nonnegative number");
  }
}

/** Reject optional text outside the same bounds as media-take.schema.json. */
function assertOptionalText(value: unknown, field: string, maxLength?: number): void {
  const exceedsLimit = maxLength !== undefined && typeof value === "string" && value.length > maxLength;
  if (value !== undefined && (typeof value !== "string" || exceedsLimit)) {
    const limit = maxLength === undefined ? "a string" : `a string of at most ${maxLength} characters`;
    throw new Error(`${field} must be ${limit}`);
  }
}

/** JSON Schema date-time format requires an RFC 3339 timestamp with an offset. */
function isRfc3339DateTime(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && isIsoDate(value.slice(0, 10))
    && !Number.isNaN(Date.parse(value));
}

const TAKE_KEYS: ReadonlySet<string> = new Set([
  "id", "label", "mediaPath", "recordedAt", "storageKey", "contentType", "sha256", "byteSize",
]);

/** Read only own data properties at this serialization boundary. */
function ownDataValue(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !("value" in descriptor)) return undefined;
  return descriptor.value;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year!, month! - 1, day!));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month! - 1 && parsed.getUTCDate() === day;
}
