/** RO-Crate metadata construction and structural validation. */

import {
  RO_CRATE_CONFORMS_TO,
  RO_CRATE_CONTEXT,
  RO_CRATE_METADATA_PATH,
} from "./package-constants.ts";
import type { RoCrateMetadata, WorkRecordPackageManifest } from "./package-types.ts";

/**
 * Build a RO-Crate 1.3-shaped JSON-LD graph from an work-record package manifest.
 * Same work identity: workRecordId, tracks, preferred take, consent, refs.
 * Pure: record/manifest in -> JSON out (same builder the export path uses).
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
