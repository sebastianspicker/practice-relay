/** WorkRecord-to-convenience-manifest projection for package exports. */

import {
  assertCanExport,
  hasExportableUsePolicy,
  type WorkRecord,
} from "@practice-relay/work-record-core";
import { RO_CRATE_METADATA_PATH, WORK_RECORD_PACKAGE_PROFILE_URI } from "./package-constants.ts";
import type {
  BuildWorkRecordPackageOptions,
  WorkRecordPackageManifest,
} from "./package-types.ts";

/**
 * Project a WorkRecord into an work-record-package convenience manifest.
 * Consent-gated unless requireConsent is false.
 */
export function buildWorkRecordPackageManifest(
  record: WorkRecord,
  opts: BuildWorkRecordPackageOptions = {},
): WorkRecordPackageManifest {
  assertPackageExportAllowed(record, opts);
  const consentSummary = packageConsentSummary(record, opts);

  return {
    schemaVersion: "0.4",
    profile: WORK_RECORD_PACKAGE_PROFILE_URI,
    workRecordId: record.id,
    title: record.title,
    createdAt: new Date().toISOString(),
    preferredTakeId: opts.preferredTakeId ?? record.preferredTakeId,
    tracks: record.tracks.map((t) => ({
      id: t.id,
      type: t.type,
      label: t.label,
      ref: t.ref,
    })),
    takes: packageTakes(record),
    consentSummary,
    musicxmlRef:
      record.tracks.find((t) => t.type === "music_notation")?.ref ?? null,
    mveiRef:
      record.tracks.find((t) => t.type === "movement_notation")?.ref ?? null,
    files: [
      { path: "manifest.json", role: "manifest" },
      { path: RO_CRATE_METADATA_PATH, role: "ro-crate-metadata" },
    ],
  };
}

/** Apply the package export consent gate unless a caller explicitly disables it. */
function assertPackageExportAllowed(record: WorkRecord, opts: BuildWorkRecordPackageOptions): void {
  if (opts.requireConsent !== false) assertCanExport(record);
}

/** Build stable package consent metadata from explicit or record policy purposes. */
function packageConsentSummary(record: WorkRecord, opts: BuildWorkRecordPackageOptions) {
  const purposes = opts.purposes ?? (record.usePolicySnapshots ?? []).flatMap((snapshot) => snapshot.purposes).filter(Boolean);
  return { allTagged: opts.consentAllTagged ?? hasExportableUsePolicy(record), purposes: purposes.length > 0 ? purposes : ["course_assessment"], exportFiltered: true };
}

/** Prefer rich take metadata while retaining legacy take-id-only export support. */
function packageTakes(record: WorkRecord) {
  const richTakes = record.takes ?? [];
  return richTakes.length > 0 ? richTakes.map((take) => ({ id: take.id, label: take.label, mediaPath: take.mediaPath })) : (record.takeIds ?? []).map((id) => ({ id }));
}
