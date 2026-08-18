/** Package and ZIP export assembly over validated manifest and RO-Crate data. */

import { createHash } from "node:crypto";
import { RO_CRATE_METADATA_PATH } from "./package-constants.ts";
import { buildWorkRecordPackageManifest } from "./manifest.ts";
import { validateWorkRecordPackageManifest } from "./manifest-validation.ts";
import type {
  BuildWorkRecordPackageOptions,
  PackageFileEntry,
  WorkRecordPackageExport,
  WorkRecordPackageManifest,
} from "./package-types.ts";
import { buildRoCrateMetadata, validateRoCrateMetadata } from "./ro-crate.ts";
import {
  buildStoreZip,
  normalizeStoreZipEntries,
  type NormalizedStoreZipEntry,
} from "./zip.ts";
import type { WorkRecord } from "@practice-relay/work-record-core";

/**
 * Build and validate the convenience manifest together with RO-Crate 1.3.
 * Throws if consent missing or either structure fails validation.
 * Primary Practice Relay export entry for API and acceptance tests.
 */
export function exportWorkRecordPackage(
  record: WorkRecord,
  opts: BuildWorkRecordPackageOptions = {},
): WorkRecordPackageExport {
  const manifest = buildWorkRecordPackageManifest(record, opts);
  const workRecordPackageResult = validateWorkRecordPackageManifest(manifest);
  if (!workRecordPackageResult.ok) {
    throw new Error(`work-record package manifest invalid: ${workRecordPackageResult.errors}`);
  }

  const roCrateMetadata = buildRoCrateMetadata(manifest);
  const crateResult = validateRoCrateMetadata(roCrateMetadata);
  if (!crateResult.ok) {
    throw new Error(`RO-Crate metadata invalid: ${crateResult.errors}`);
  }

  return { manifest, roCrateMetadata, validated: true };
}

/**
 * Export work-record package as ZIP: canonical manifest.json + RO-Crate metadata + extras.
 */
export function exportWorkRecordPackageZip(
  record: WorkRecord,
  opts: BuildWorkRecordPackageOptions & { extraFiles?: PackageFileEntry[] } = {},
): WorkRecordPackageExport & { zipBytes: Buffer } {
  const extras = normalizePackageExtras(opts.extraFiles ?? []);
  assertPackagePathsAreUnique(extras);
  const manifest = buildWorkRecordPackageManifest(record, opts);
  manifest.files.push(...inventoryEntries(extras));
  const workRecordPackageResult = validateWorkRecordPackageManifest(manifest);
  if (!workRecordPackageResult.ok) {
    throw new Error(`work-record package manifest invalid: ${workRecordPackageResult.errors}`);
  }
  const roCrateMetadata = buildRoCrateMetadata(manifest);
  const crateResult = validateRoCrateMetadata(roCrateMetadata);
  if (!crateResult.ok) {
    throw new Error(`RO-Crate metadata invalid: ${crateResult.errors}`);
  }
  const files: { path: string; bytes: Buffer | string }[] = [
    { path: "manifest.json", bytes: JSON.stringify(manifest, null, 2) },
    {
      path: RO_CRATE_METADATA_PATH,
      bytes: JSON.stringify(roCrateMetadata, null, 2),
    },
  ];
  for (const extra of extras) {
    files.push({ path: extra.path, bytes: extra.data });
  }
  const zipBytes = buildStoreZip(files);
  return { manifest, roCrateMetadata, validated: true, zipBytes };
}

/** Normalize extras once so the manifest inventory matches the emitted ZIP paths. */
function normalizePackageExtras(
  extras: PackageFileEntry[],
): NormalizedStoreZipEntry[] {
  return normalizeStoreZipEntries(extras);
}

/** Reject extras that collide with the canonical package metadata paths. */
function assertPackagePathsAreUnique(extras: NormalizedStoreZipEntry[]): void {
  normalizeStoreZipEntries([
    { path: "manifest.json", bytes: Buffer.alloc(0) },
    { path: RO_CRATE_METADATA_PATH, bytes: Buffer.alloc(0) },
    ...extras.map((extra) => ({ path: extra.path, bytes: extra.data })),
  ]);
}

/** Convert normalized extras into SHA-256-addressable work-record package inventory records. */
function inventoryEntries(
  extras: NormalizedStoreZipEntry[],
): WorkRecordPackageManifest["files"] {
  return extras.map((extra) => ({
    path: extra.path,
    role: "supplementary-file",
    sha256: createHash("sha256").update(extra.data).digest("hex"),
  }));
}
