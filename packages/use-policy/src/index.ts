/**
 * @practice-relay/use-policy - purpose-tagged consent records for performance media.
 *
 * Why: share/export must be blocked until purposes are tagged (Practice Relay residual G5).
 * Enum values match consent.schema.json; keep them in sync on schema changes.
 */

export const PACKAGE = "@practice-relay/use-policy";
export const SCHEMA_VERSION = "0.1.0";

/** Allowed purposes (JSON Schema enum). model_training_forbidden is a hard veto flag in policy, not an export purpose alone. */
export type ConsentPurpose =
  | "course_assessment"
  | "formative_feedback"
  | "research_archive"
  | "public_showcase"
  | "model_training_forbidden"
  | "plugin_analysis";

/** One subject’s consent record (student/performer). */
export interface ConsentRecord {
  schemaVersion: string;
  id: string;
  subjectId: string;
  purposes: ConsentPurpose[];
  /** Art. 9 / special-category risk signal for face/gait/mocap. */
  biometricRisk?: boolean;
  retentionUntil?: string | null;
  /** When false, export/share must refuse. Default treated as allowed if purposes set. */
  exportAllowed?: boolean;
  createdAt: string;
  notes?: string;
}

/** Input for createConsentRecord - id, subject, purposes required. */
export type CreateConsentRecordInput = Partial<ConsentRecord> &
  Pick<ConsentRecord, "id" | "subjectId" | "purposes">;

/**
 * Fill schemaVersion + createdAt defaults so API/domain callers stay consistent.
 */
export function createConsentRecord(
  partial: CreateConsentRecordInput,
): ConsentRecord {
  return {
    ...partial,
    schemaVersion: partial.schemaVersion ?? SCHEMA_VERSION,
    createdAt: partial.createdAt ?? new Date().toISOString(),
  };
}

/**
 * Gate for export/share: true if any record has purposes and is not export-denied.
 * Empty list → false (Practice Relay blocks package until a use policy is attached).
 */
export function consentAllowsExport(records: ConsentRecord[]): boolean {
  return records.some(
    (r) => r.exportAllowed !== false && r.purposes.length > 0,
  );
}
