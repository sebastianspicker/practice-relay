/** WorkRecord-to-convenience-manifest projection for package exports. */

import {
  assertExportApproved,
  hasExportableUsePolicy,
  parseWorkRecord,
  type WorkRecord,
} from "@practice-relay/work-record";
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
  const canonical = parseWorkRecord(record);
  assertPackageExportAllowed(canonical, opts);
  const consentSummary = packageConsentSummary(canonical, opts);

  return {
    schemaVersion: "0.4",
    profile: WORK_RECORD_PACKAGE_PROFILE_URI,
    workRecordId: canonical.id,
    title: canonical.title,
    createdAt: new Date().toISOString(),
    preferredTakeId: opts.preferredTakeId ?? canonical.preferredTakeId,
    tracks: canonical.tracks.map((t) => ({
      id: t.id,
      type: t.type,
      label: t.label,
      ref: t.ref,
    })),
    takes: packageTakes(canonical),
    consentSummary,
    musicxmlRef:
      canonical.tracks.find((t) => t.type === "music_notation")?.ref ?? null,
    mveiRef:
      canonical.tracks.find((t) => t.type === "movement_notation")?.ref ?? null,
    files: [
      { path: "manifest.json", role: "manifest" },
      { path: RO_CRATE_METADATA_PATH, role: "ro-crate-metadata" },
    ],
  };
}

/** Apply the package export consent gate unless a caller explicitly disables it. */
function assertPackageExportAllowed(record: WorkRecord, opts: BuildWorkRecordPackageOptions): void {
  if (opts.requireConsent !== false) {
    assertExportApproved(record, { mode: "record-release" });
  }
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
