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

/** Build stable package consent metadata from explicit or currently released purposes. */
function packageConsentSummary(record: WorkRecord, opts: BuildWorkRecordPackageOptions) {
  return { allTagged: opts.consentAllTagged ?? hasExportableUsePolicy(record), purposes: opts.purposes ?? currentReleasePurposes(record), exportFiltered: true };
}

/**
 * Purposes every subject counted by the record-release gate currently allows.
 * Same subject rule as hasExportableUsePolicy: latest snapshot per subject, all
 * student members when present, otherwise every subject with a snapshot. Withdrawn or superseded purposes never appear,
 * and no purpose is invented when the subjects share none.
 */
function currentReleasePurposes(record: WorkRecord): string[] {
  const latest = new Map<string, WorkRecord["usePolicySnapshots"][number]>();
  for (const snapshot of record.usePolicySnapshots) latest.set(snapshot.subjectId, snapshot);
  const students = [...new Set(record.members.filter((member) => member.role === "student").map((member) => member.userId))];
  const subjects = students.length > 0 ? students : [...latest.keys()];
  const releases = subjects.flatMap((subjectId) => {
    const release = latest.get(subjectId);
    return release && release.purposes.length > 0 && release.exportAllowed !== false ? [release] : [];
  });
  if (releases.length === 0 || releases.length < subjects.length) return [];
  return [...new Set(releases[0]?.purposes ?? [])].filter((purpose) => releases.every((release) => release.purposes.includes(purpose)));
}

/** Prefer rich take metadata while retaining legacy take-id-only export support. */
function packageTakes(record: WorkRecord) {
  const richTakes = record.takes ?? [];
  return richTakes.length > 0 ? richTakes.map((take) => ({ id: take.id, label: take.label, mediaPath: take.mediaPath })) : (record.takeIds ?? []).map((id) => ({ id }));
}
