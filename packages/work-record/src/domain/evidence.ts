/** Immutable evidence and profile-resource mutations for a WorkRecord. */
import { WorkRecordDuplicateError } from "./errors.ts";
import { assertResourceId } from "./validation.ts";
import type {
  Artifact,
  RepresentedSubject,
  Snapshot,
  WorkAnnotation,
  WorkRecord,
} from "./types.ts";
import type { UsePolicy } from "../policy/types.ts";

const nonBlank = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
};

/** Append a unique represented subject without mutating the source aggregate. */
export function addRepresentedSubject(record: WorkRecord, subject: RepresentedSubject): WorkRecord {
  assertResourceId(subject.id, "subject id");
  nonBlank(subject.label, "subject label");
  if (!["Person", "Group", "Place", "Other"].includes(subject.type)) throw new Error("subject type is not supported");
  if (record.representedSubjects.some((item) => item.id === subject.id)) throw new WorkRecordDuplicateError(`subject id already exists: ${subject.id}`);
  return { ...record, representedSubjects: [...record.representedSubjects, { ...subject, label: subject.label.trim() }] };
}

/** Append a valid artifact whose subject links resolve within the aggregate. */
export function addArtifact(record: WorkRecord, artifact: Artifact): WorkRecord {
  assertResourceId(artifact.id, "artifact id");
  nonBlank(artifact.name, "artifact name");
  if (record.artifacts.some((item) => item.id === artifact.id)) throw new WorkRecordDuplicateError(`artifact id already exists: ${artifact.id}`);
  if (artifact.sha256 !== undefined && !/^[a-fA-F0-9]{64}$/.test(artifact.sha256)) throw new Error("sha256 must contain exactly 64 hexadecimal characters");
  if (artifact.preservationRequired && (!artifact.contentUrl || !artifact.sha256)) throw new Error("preservation evidence requires a content URL and SHA-256 hash");
  const subjectIds = artifact.representedSubjectIds ?? [];
  for (const subjectId of subjectIds) {
    assertResourceId(subjectId, "represented subject id");
    if (!record.representedSubjects.some((subject) => subject.id === subjectId)) throw new Error(`unknown represented subject ${subjectId}`);
  }
  if (new Set(subjectIds).size !== subjectIds.length) throw new Error("artifact represented subject ids must be unique");
  return { ...record, artifacts: [...record.artifacts, { ...artifact, name: artifact.name.trim(), representedSubjectIds: [...subjectIds] }] };
}

/** Append a complete W3C-shaped annotation with a unique identifier. */
export function addAnnotation(record: WorkRecord, annotation: WorkAnnotation): WorkRecord {
  assertResourceId(annotation.id, "annotation id");
  if (annotation["@context"] !== "http://www.w3.org/ns/anno.jsonld" || annotation.type !== "Annotation") throw new Error("annotation has an unsupported shape");
  if (annotation.body === undefined || annotation.target === undefined) throw new Error("annotation body and target are required");
  if (record.annotations.some((item) => item.id === annotation.id)) throw new WorkRecordDuplicateError(`annotation id already exists: ${annotation.id}`);
  return { ...record, annotations: [...record.annotations, structuredClone(annotation)] };
}

/** Append a unique explicit policy that names a known represented subject. */
export function addUsePolicy(record: WorkRecord, policy: UsePolicy): WorkRecord {
  assertResourceId(policy.id, "policy id");
  assertResourceId(policy.representedSubjectId, "represented subject id");
  nonBlank(policy.purpose, "policy purpose");
  nonBlank(policy.destination, "policy destination");
  if (!["granted", "denied", "withdrawn"].includes(policy.state)) throw new Error("policy state is not supported");
  if (!record.representedSubjects.some((subject) => subject.id === policy.representedSubjectId)) throw new Error(`unknown represented subject ${policy.representedSubjectId}`);
  if (record.usePolicies.some((item) => item.id === policy.id)) throw new WorkRecordDuplicateError(`policy id already exists: ${policy.id}`);
  return { ...record, usePolicies: [...record.usePolicies, { ...policy, purpose: policy.purpose.trim(), destination: policy.destination.trim() }] };
}

/** Append an immutable snapshot referencing only current artifacts. */
export function addSnapshot(record: WorkRecord, snapshot: Snapshot): WorkRecord {
  assertResourceId(snapshot.id, "snapshot id");
  if (record.snapshots.some((item) => item.id === snapshot.id)) throw new WorkRecordDuplicateError(`snapshot id already exists: ${snapshot.id}`);
  const known = new Set(record.artifacts.map((artifact) => artifact.id));
  for (const artifactId of snapshot.artifactIds) {
    assertResourceId(artifactId, "snapshot artifact id");
    if (!known.has(artifactId)) throw new Error(`snapshot artifact not found: ${artifactId}`);
  }
  if (new Set(snapshot.artifactIds).size !== snapshot.artifactIds.length) throw new Error("snapshot artifact ids must be unique");
  return { ...record, snapshots: [...record.snapshots, { ...snapshot, artifactIds: [...snapshot.artifactIds] }] };
}

/** Rename a WorkRecord while preserving its other aggregate state. */
export function renameRecord(record: WorkRecord, title: string): WorkRecord {
  if (typeof title !== "string" || !title.trim() || title.length > 500) throw new Error("record title must be a non-empty string of at most 500 characters");
  return { ...record, title: title.trim() };
}
