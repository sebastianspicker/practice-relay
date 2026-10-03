/** Canonical handoff and interoperability export application services. */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { WorkRecord } from "@practice-relay/work-record";
import {
  buildWorkRecordPackageManifest,
  exportRecord,
  exportWorkRecordPackage,
  exportWorkRecordPackageZip,
  type ExportFormat,
} from "@practice-relay/handoff";

/** Transport-neutral result of a JSON or ZIP handoff package request. */
export type PackageExport =
  | { format: "json"; manifest: unknown; roCrateMetadata: unknown; validated: boolean }
  | { format: "zip"; bytes: Buffer; filename: string };

/** Produce the canonical validated Work Record package for an authorized record. */
export function packageExport(
  record: WorkRecord,
  format: string | undefined,
  repoRoot: string,
): PackageExport {
  if (format !== "zip") {
    const pkg = exportWorkRecordPackage(record, { requireConsent: true });
    return { format: "json", ...pkg };
  }
  const demoMotif = path.join(repoRoot, "fixtures/demo/motif.json");
  const extraFiles = record.tracks.some((track) => track.ref === "fixtures/demo/motif.json") && existsSync(demoMotif)
    ? [{ path: "motif.json", bytes: readFileSync(demoMotif) }]
    : [];
  const pkg = exportWorkRecordPackageZip(record, { requireConsent: true, extraFiles });
  return { format: "zip", bytes: pkg.zipBytes, filename: `${record.id}.work-record.zip` };
}

/** Verify whether sharing may emit the canonical package without serializing it. */
export function authorizeShare(record: WorkRecord): void {
  buildWorkRecordPackageManifest(record, { requireConsent: true });
}

/** Produce an explicitly lossy interoperability projection from the full stored record. */
export function interoperabilityExport(record: WorkRecord, format?: ExportFormat) {
  return exportRecord(record, format ?? "otio-json");
}

/** Produce the stable public demo package in JSON or ZIP form. */
export function demoPackageExport(record: WorkRecord, zip: boolean): PackageExport {
  if (zip) {
    const pkg = exportWorkRecordPackageZip(record, { consentAllTagged: true });
    return { format: "zip", bytes: pkg.zipBytes, filename: `${record.id}.work-record.zip` };
  }
  const pkg = exportWorkRecordPackage(record, {
    consentAllTagged: true,
    purposes: ["course_assessment"],
  });
  return { format: "json", ...pkg };
}
