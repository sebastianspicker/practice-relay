/**
 * @practice-relay/work-record-package - build and validate work-record package manifests + RO-Crate.
 *
 * Why: residual export-first packaging. Manifests are validated against the
 * real on-disk schema in this package (not a re-implemented
 * golden schema). Consent is required by default (Q6/Q7).
 *
 * work-record package is a *domain profile* on RO-Crate 1.3: every export emits both the
 * convenience work-record package manifest and a RO-Crate-shaped `ro-crate-metadata.json`
 * covering the same work identity (not a proprietary packaging invention).
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import AjvModule from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  assertCanExport,
  hasExportableUsePolicy,
  type WorkRecord,
} from "@practice-relay/work-record-core";
import {
  buildStoreZip,
  normalizeStoreZipEntries,
  type NormalizedStoreZipEntry,
} from "./zip.ts";

export { buildStoreZip } from "./zip.ts";

/** Options for buildWorkRecordPackageManifest / exportWorkRecordPackage. */
export type BuildWorkRecordPackageOptions = {
  preferredTakeId?: string | null;
  consentAllTagged?: boolean;
  purposes?: string[];
  /**
   * When true (default), refuse export without exportable consent.
   * Demo routes may pass false only if consent is still stamped on the manifest.
   */
  requireConsent?: boolean;
};

/** work-record-package convenience manifest produced for teaching/archive packages. */
export type WorkRecordPackageManifest = {
  schemaVersion: string;
  profile: string;
  workRecordId: string;
  title: string;
  createdAt: string;
  preferredTakeId: string | null;
  tracks: {
    id: string;
    type: string;
    label?: string;
    ref?: string;
  }[];
  takes: { id: string; label?: string; mediaPath?: string }[];
  consentSummary: {
    allTagged: boolean;
    purposes: string[];
    exportFiltered: boolean;
  };
  musicxmlRef: string | null;
  mveiRef: string | null;
  files: { path: string; role: string; sha256?: string }[];
};

/**
 * RO-Crate 1.3 JSON-LD graph covering the same work identity as the work-record package
 * convenience manifest (profile, tracks, takes, consent, mvei/music refs).
 */
export type RoCrateMetadata = {
  "@context": string;
  "@graph": Record<string, unknown>[];
};

/** Optional binary file to embed in the package zip. */
export type PackageFileEntry = {
  path: string;
  bytes: Buffer;
};

/** Full package produced by exportWorkRecordPackage. */
export type WorkRecordPackageExport = {
  manifest: WorkRecordPackageManifest;
  /** RO-Crate 1.3 metadata file body (`ro-crate-metadata.json`). */
  roCrateMetadata: RoCrateMetadata;
  validated: true;
  /** ZIP bytes when requested via exportWorkRecordPackageZip / includeZip. */
  zipBytes?: Buffer;
};

/** Profile URI must match work-record-package.schema.json const (Q14). */
export const WORK_RECORD_PACKAGE_PROFILE_URI =
  "urn:practice-relay:profile:work-record-package:0.4";

/** Canonical RO-Crate 1.3 context / conformsTo URIs. */
export const RO_CRATE_CONTEXT = "https://w3id.org/ro/crate/1.3/context";
export const RO_CRATE_CONFORMS_TO = "https://w3id.org/ro/crate/1.3";
export const RO_CRATE_METADATA_PATH = "ro-crate-metadata.json";

/**
 * Locate work-record-package.schema.json from package path or monorepo cwd.
 * Multiple candidates so tests work when run from package or repo root.
 */
function resolveSchemaPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "../schemas/work-record-package.schema.json"),
    join(
      here,
      "../../../../packages/work-record-package/schemas/work-record-package.schema.json",
    ),
    join(
      process.cwd(),
      "packages/work-record-package/schemas/work-record-package.schema.json",
    ),
    join(
      process.cwd(),
      "../../../packages/work-record-package/schemas/work-record-package.schema.json",
    ),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(`work-record package schema not found (tried: ${candidates.join(", ")})`);
}

type AjvValidate = ((data: unknown) => boolean) & {
  errors?: { instancePath?: string; message?: string }[] | null;
};

/** Cached compiled validator - schema is stable for process lifetime. */
let cachedValidate: AjvValidate | null = null;

/** Compile Ajv 2020 validator against the real work-record package schema file. */
function getAjvValidate(): AjvValidate {
  if (cachedValidate) return cachedValidate;
  const Ajv =
    (AjvModule as unknown as { default?: typeof AjvModule }).default ??
    AjvModule;
  const ajv = new (Ajv as unknown as new (opts: object) => {
    compile: (s: object) => AjvValidate;
    errorsText: (errors?: unknown) => string;
  })({ allErrors: true, strict: false });
  const applyFormats =
    (addFormats as unknown as { default?: (instance: unknown) => void }).default ??
    (addFormats as unknown as (instance: unknown) => void);
  applyFormats(ajv);
  const schemaPath = resolveSchemaPath();
  const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as object;
  cachedValidate = ajv.compile(schema);
  return cachedValidate;
}

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

/**
 * Build a RO-Crate 1.3-shaped JSON-LD graph from an work-record package manifest.
 * Same work identity: workRecordId, tracks, preferred take, consent, refs.
 * Pure: record/manifest in → JSON out (same builder the export path uses).
 */
export function buildRoCrateMetadata(manifest: WorkRecordPackageManifest): RoCrateMetadata {
  const rootId = "./";
  const metadataId = RO_CRATE_METADATA_PATH;

  const trackParts = manifest.tracks.map((t) => ({
    "@id": `tracks/${t.id}`,
  }));

  const trackEntities = manifest.tracks.map((t) => {
    const entity: Record<string, unknown> = {
      "@id": `tracks/${t.id}`,
      "@type": "File",
      name: t.label ?? t.id,
      encodingFormat: t.type,
      "workRecord:trackType": t.type,
      "workRecord:trackId": t.id,
    };
    if (t.ref) entity.path = t.ref;
    return entity;
  });

  const takeEntities = (manifest.takes ?? []).map((take) => {
    const entity: Record<string, unknown> = {
      "@id": `takes/${take.id}`,
      "@type": "CreativeWork",
      name: take.label ?? take.id,
      "workRecord:takeId": take.id,
    };
    if (take.mediaPath) entity.path = take.mediaPath;
    return entity;
  });

  const rootDataset: Record<string, unknown> = {
    "@id": rootId,
    "@type": ["Dataset", "CreativeWork"],
    name: manifest.title,
    identifier: manifest.workRecordId,
    datePublished: manifest.createdAt,
    hasPart: [
      ...trackParts,
      ...takeEntities.map((t) => ({ "@id": t["@id"] as string })),
      ...manifest.files.map((file) => ({ "@id": file.path })),
    ],
    // work-record package domain-profile identity on the crate root (machine-actionable).
    "workRecord:profile": manifest.profile,
    "workRecord:workRecordId": manifest.workRecordId,
    "workRecord:preferredTakeId": manifest.preferredTakeId,
    "workRecord:consentSummary": {
      allTagged: manifest.consentSummary.allTagged,
      purposes: [...manifest.consentSummary.purposes],
      exportFiltered: manifest.consentSummary.exportFiltered,
    },
    "workRecord:trackTypes": manifest.tracks.map((t) => t.type),
    "workRecord:musicxmlRef": manifest.musicxmlRef,
    "workRecord:mveiRef": manifest.mveiRef,
  };

  const metadataDescriptor: Record<string, unknown> = {
    "@type": "CreativeWork",
    "@id": metadataId,
    conformsTo: { "@id": RO_CRATE_CONFORMS_TO },
    about: { "@id": rootId },
  };

  const packageFileEntities = manifest.files
    .filter((file) => file.path !== RO_CRATE_METADATA_PATH)
    .map((file) => packageFileEntity(file));

  return {
    "@context": RO_CRATE_CONTEXT,
    "@graph": [
      metadataDescriptor,
      rootDataset,
      ...packageFileEntities,
      ...trackEntities,
      ...takeEntities,
    ],
  };
}

/**
 * Structural RO-Crate 1.3 checks for the work-record package profile export (not a full
 * RO-Crate JSON Schema reimplementation - validates shape + work identity).
 */
export function validateRoCrateMetadata(crate: unknown): {
  ok: boolean;
  errors?: string;
} {
  if (crate === null || typeof crate !== "object" || Array.isArray(crate)) {
    return { ok: false, errors: "RO-Crate must be a JSON object" };
  }
  const c = crate as Record<string, unknown>;
  const problems: string[] = [];

  if (c["@context"] !== RO_CRATE_CONTEXT) problems.push(`@context must be ${RO_CRATE_CONTEXT}`);
  problems.push(...roCrateGraphErrors(c["@graph"]));

  if (problems.length) return { ok: false, errors: problems.join("; ") };
  return { ok: true };
}

/** Validate the RO-Crate metadata descriptor identity and conformance link. */
function roCrateDescriptorErrors(descriptor: Record<string, unknown> | undefined): string[] {
  if (!descriptor) return ["missing metadata descriptor @id ro-crate-metadata.json"];
  const conformsTo = descriptor.conformsTo;
  if (conformsTo === null || typeof conformsTo !== "object" || Array.isArray(conformsTo)) {
    return [`conformsTo must be ${RO_CRATE_CONFORMS_TO}`];
  }
  return (conformsTo as Record<string, unknown>)["@id"] === RO_CRATE_CONFORMS_TO
    ? []
    : [`conformsTo must be ${RO_CRATE_CONFORMS_TO}`];
}

/** Validate the root entity's required work-record profile fields. */
function roCrateRootErrors(root: Record<string, unknown> | undefined): string[] {
  if (!root) return ['missing root Data Entity @id "./"'];
  const consent = root["workRecord:consentSummary"] as { purposes?: unknown } | undefined;
  return [typeof root["workRecord:workRecordId"] === "string" ? null : "root missing workRecord:workRecordId", typeof root["workRecord:profile"] === "string" ? null : "root missing workRecord:profile", Array.isArray(root["workRecord:trackTypes"]) ? null : "root missing workRecord:trackTypes array", consent && Array.isArray(consent.purposes) ? null : "root missing workRecord:consentSummary.purposes"].filter((error): error is string => error !== null);
}

/** Validate RO-Crate graph presence plus descriptor/root entities. */
function roCrateGraphErrors(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 2) {
    return ["@graph must be a non-empty array with descriptor + root"];
  }
  const graph = value as Record<string, unknown>[];
  const descriptor = graph.find((node) => node["@id"] === RO_CRATE_METADATA_PATH);
  const root = graph.find((node) => node["@id"] === "./");
  return [...roCrateDescriptorErrors(descriptor), ...roCrateRootErrors(root)];
}

/**
 * Validate an unknown JSON value against the on-disk work-record package schema (Ajv).
 * Used by export path and acceptance Q7 - never re-implement the schema in tests.
 */
export function validateWorkRecordPackageManifest(manifest: unknown): {
  ok: boolean;
  errors?: string;
} {
  const validate = getAjvValidate();
  const ok = validate(manifest);
  if (ok) return { ok: true };
  const errors =
    validate.errors
      ?.map((e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`)
      .join("; ") ?? "invalid work-record package manifest";
  return { ok: false, errors };
}

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

/** Describe a manifest-listed package file in the RO-Crate graph. */
function packageFileEntity(
  file: WorkRecordPackageManifest["files"][number],
): Record<string, unknown> {
  const entity: Record<string, unknown> = {
    "@id": file.path,
    "@type": "File",
    name: file.path === "manifest.json" ? "work-record package manifest" : file.path,
    "workRecord:role": file.role,
  };
  if (file.path.endsWith(".json")) entity.encodingFormat = "application/json";
  if (file.sha256) entity.sha256 = file.sha256;
  return entity;
}
