/** Policy-scoped RO-Crate metadata that never serializes the complete WorkRecord. */
import { parseWorkRecord, type WorkRecord } from "@practice-relay/work-record";
import type { RoCratePackage } from "./ro-crate-record.ts";

const subjectType = {
  Person: "Person",
  Group: "Organization",
  Place: "Place",
  Other: "Thing",
} as const;

function artifactEntityId(id: string): string {
  return `#artifact-${encodeURIComponent(id)}`;
}

function subjectEntityId(id: string): string {
  return `#subject-${encodeURIComponent(id)}`;
}

/**
 * Write metadata only for the explicitly approved artifacts and their subjects.
 * The complete WorkRecord, membership, actors, policies, and unrelated resources
 * are deliberately outside this representation boundary.
 */
export function writeEvidenceRoCrate13(
  record: WorkRecord,
  artifactIds: readonly string[],
): RoCratePackage {
  const canonical = parseWorkRecord(record);
  if (artifactIds.length === 0) throw new Error("evidence export requires approved artifacts");
  const requested = new Set(artifactIds);
  if (requested.size !== artifactIds.length) throw new Error("approved artifact ids must be unique");
  const artifacts = canonical.artifacts.filter((artifact) => requested.has(artifact.id));
  if (artifacts.length !== requested.size) throw new Error("approved artifact id is not present in the WorkRecord");

  const representedSubjectIds = new Set(
    artifacts.flatMap((artifact) => artifact.representedSubjectIds ?? []),
  );
  const subjects = canonical.representedSubjects.filter((subject) =>
    representedSubjectIds.has(subject.id),
  );
  const descriptor = {
    "@id": "ro-crate-metadata.json",
    "@type": "CreativeWork",
    conformsTo: "https://w3id.org/ro/crate/1.3",
    about: { "@id": "./" },
  };
  const root = {
    "@id": "./",
    "@type": "Dataset",
    name: `Evidence export for ${canonical.id}`,
    identifier: canonical.id,
    conformsTo: "https://w3id.org/ro/crate/1.3",
    hasPart: artifacts.map((artifact) => ({ "@id": artifactEntityId(artifact.id) })),
  };
  const subjectEntities = subjects.map((subject) => ({
    "@id": subjectEntityId(subject.id),
    "@type": subjectType[subject.type],
    name: subject.label,
  }));
  const artifactEntities = artifacts.map((artifact) => ({
    "@id": artifactEntityId(artifact.id),
    "@type": "File",
    name: artifact.name,
    ...(artifact.mediaType === undefined ? {} : { encodingFormat: artifact.mediaType }),
    ...(artifact.contentUrl === undefined ? {} : { contentUrl: artifact.contentUrl }),
    ...(artifact.sha256 === undefined ? {} : { sha256: artifact.sha256 }),
    about: (artifact.representedSubjectIds ?? []).map((id) => ({
      "@id": subjectEntityId(id),
    })),
  }));
  return {
    files: {
      "ro-crate-metadata.json": JSON.stringify(
        {
          "@context": "https://w3id.org/ro/crate/1.3/context",
          "@graph": [descriptor, root, ...subjectEntities, ...artifactEntities],
        },
        null,
        2,
      ),
    },
  };
}
