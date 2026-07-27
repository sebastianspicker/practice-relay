/**
 * Fail-closed WorkRecord export policy and RO-Crate 1.3 serialization.
 *
 * Why: export authorization and portable serialization form one boundary that
 * can be reviewed independently from record mutation behavior.
 */
import {
  type WorkRecord,
  validateWorkRecord,
} from "./index.ts";

/** Requested export purpose and destination. */
export interface ExportRequest {
  purpose: string;
  destination: string;
}

/** Fail-closed result of evaluating an explicit export request. */
export interface ExportDecision {
  allowed: boolean;
  purpose: string;
  destination: string;
  reasons: string[];
  includedArtifactIds: string[];
}

/** Evaluates artifact policy without inferring purpose, destination, or permission. */
export function evaluateExport(record: WorkRecord, request: ExportRequest): ExportDecision {
  const reasons: string[] = [];
  validateExportRequest(request, reasons);
  record.artifacts.forEach((artifact) => {
    evaluateArtifactExport(record, request, artifact, reasons);
  });
  return {
    allowed: reasons.length === 0,
    purpose: request.purpose,
    destination: request.destination,
    reasons,
    includedArtifactIds: reasons.length === 0 ? record.artifacts.map((artifact) => artifact.id) : [],
  };
}

/** Validate request fields that may never be inferred by an export operation. */
function validateExportRequest(request: ExportRequest, reasons: string[]): void {
  if (!request.purpose.trim()) reasons.push("purpose is required and may not be invented");
  if (!request.destination.trim()) reasons.push("destination is required");
}

/** Collect policy and preservation reasons for one artifact. */
function evaluateArtifactExport(
  record: WorkRecord,
  request: ExportRequest,
  artifact: WorkRecord["artifacts"][number],
  reasons: string[],
): void {
  if (artifact.preservationRequired && (!artifact.contentUrl || !artifact.sha256)) {
    reasons.push(`preservation artifact ${artifact.id} has an unresolved or unhashed reference`);
  }
  if (record.usePolicies.length > 0 && (artifact.representedSubjectIds?.length ?? 0) === 0) {
    reasons.push(`artifact ${artifact.id} has no represented-subject policy linkage`);
  }
  (artifact.representedSubjectIds ?? []).forEach((subjectId) => {
    evaluateSubjectPolicy(record, request, subjectId, reasons);
  });
}

/** Apply the fail-closed decision rules for one represented subject. */
function evaluateSubjectPolicy(
  record: WorkRecord,
  request: ExportRequest,
  subjectId: string,
  reasons: string[],
): void {
  const policies = record.usePolicies.filter(
    (policy) =>
      policy.representedSubjectId === subjectId &&
      policy.purpose === request.purpose &&
      policy.destination === request.destination,
  );
  if (policies.some((policy) => policy.state === "denied" || policy.state === "withdrawn")) {
    reasons.push(`subject ${subjectId} denies or withdrew purpose ${request.purpose} for ${request.destination}`);
  } else if (!policies.some((policy) => policy.state === "granted")) {
    reasons.push(`subject ${subjectId} has no explicit grant for purpose ${request.purpose} at ${request.destination}`);
  }
}

/** File-like RO-Crate package representation; persistence is delegated to callers. */
export interface RoCratePackage {
  files: Record<string, string>;
}

/** Writes a minimal RO-Crate 1.3 package for a record. */
export function writeRoCrate13(record: WorkRecord): RoCratePackage {
  const descriptor = { "@id": "ro-crate-metadata.json", "@type": "CreativeWork", conformsTo: "https://w3id.org/ro/crate/1.3", about: { "@id": "./" } };
  const root = { "@id": "./", "@type": "Dataset", name: record.title, conformsTo: "https://w3id.org/ro/crate/1.3", mainEntity: { "@id": "work-record.json" } };
  return { files: { "work-record.json": JSON.stringify(record, null, 2), "ro-crate-metadata.json": JSON.stringify({ "@context": "https://w3id.org/ro/crate/1.3/context", "@graph": [descriptor, root] }, null, 2) } };
}

/** Reads and structurally validates a record from a RO-Crate 1.3 package. */
export function readRoCrate13(pkg: RoCratePackage): WorkRecord {
  const metadata = parseJson(pkg.files["ro-crate-metadata.json"], "ro-crate-metadata.json") as { "@graph"?: Array<Record<string, unknown>> };
  const graph = metadata["@graph"];
  const hasDescriptor = Array.isArray(graph) && graph.some((node) => node["@id"] === "ro-crate-metadata.json" && node.conformsTo === "https://w3id.org/ro/crate/1.3");
  const hasRoot = Array.isArray(graph) && graph.some((node) => node["@id"] === "./" && node.conformsTo === "https://w3id.org/ro/crate/1.3" && (node.mainEntity as { "@id"?: unknown } | undefined)?.["@id"] === "work-record.json");
  if (!hasDescriptor || !hasRoot) throw new Error("RO-Crate 1.3 metadata descriptor is missing");
  const record = parseJson(pkg.files["work-record.json"], "work-record.json") as WorkRecord;
  validateWorkRecord(record);
  return record;
}

function parseJson(value: string | undefined, path: string): unknown {
  if (typeof value !== "string") throw new Error(`${path} is missing`);
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${path} is not valid JSON`);
  }
}
