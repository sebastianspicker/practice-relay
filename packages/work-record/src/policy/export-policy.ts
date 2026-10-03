/** Fail-closed WorkRecord export-policy evaluation with no serialization concerns. */
import type { Artifact, WorkRecord } from "../domain/types.ts";
import { WorkRecordPolicyDeniedError } from "../domain/errors.ts";
import { hasExportableUsePolicy } from "./use-policy.ts";

/** Purpose- and destination-specific export request. */
export interface ExplicitExportRequest {
  mode?: "explicit";
  purpose: string;
  destination: string;
}

/** A whole-record handoff request uses the attached record-release decisions. */
export interface RecordReleaseExportRequest {
  mode: "record-release";
}

/** Supported evidence-specific and whole-record policy scopes. */
export type ExportPolicyRequest = ExplicitExportRequest | RecordReleaseExportRequest;

/** Result of a fail-closed policy evaluation. */
export interface ExportDecision {
  allowed: boolean;
  policySource: "explicit" | "record-release";
  purpose?: string;
  destination?: string;
  reasons: string[];
  includedArtifactIds: string[];
}

/** Compatibility name for callers that make explicit requests. */
export type ExportRequest = ExplicitExportRequest;

/** Evaluates evidence grants or whole-record release decisions without conflating their scopes. */
export function evaluateExportPolicy(record: WorkRecord, request: ExportPolicyRequest): ExportDecision {
  const reasons: string[] = [];
  const policySource = request.mode === "record-release" ? "record-release" : "explicit";
  evaluatePreservationRequirements(record.artifacts, reasons);
  if (request.mode === "record-release") evaluateRecordRelease(record, reasons);
  else evaluateExplicitRequest(record, request, reasons);
  return {
    allowed: reasons.length === 0,
    policySource,
    ...(request.mode === "record-release" ? {} : { purpose: request.purpose, destination: request.destination }),
    reasons,
    includedArtifactIds: reasons.length === 0 ? record.artifacts.map((artifact) => artifact.id) : [],
  };
}

/** Compatibility entry point for the existing explicit purpose/destination request contract. */
export function evaluateExport(record: WorkRecord, request: ExportRequest): ExportDecision {
  return evaluateExportPolicy(record, request);
}

/** Throws unless the requested export is approved for its declared policy scope. */
export function assertExportApproved(record: WorkRecord, request: ExportPolicyRequest): ExportDecision {
  const decision = evaluateExportPolicy(record, request);
  if (!decision.allowed) throw new WorkRecordPolicyDeniedError(`export denied: ${decision.reasons.join("; ")}`);
  return decision;
}

function evaluatePreservationRequirements(artifacts: Artifact[], reasons: string[]): void {
  for (const artifact of artifacts) {
    if (artifact.preservationRequired && (!artifact.contentUrl || !artifact.sha256)) {
      reasons.push(`preservation artifact ${artifact.id} has an unresolved or unhashed reference`);
    }
  }
}

/** Validate an explicit request, then require an exact non-revoked grant for every linked subject. */
function evaluateExplicitRequest(record: WorkRecord, request: ExplicitExportRequest, reasons: string[]): void {
  if (!request.purpose.trim()) reasons.push("purpose is required and may not be invented");
  if (!request.destination.trim()) reasons.push("destination is required");
  if (record.artifacts.length === 0) reasons.push("at least one policy-linked artifact is required");
  const representedSubjectIds = new Set(
    record.representedSubjects.map((subject) => subject.id),
  );
  for (const policy of record.usePolicies) {
    if (!representedSubjectIds.has(policy.representedSubjectId)) {
      reasons.push(`policy ${policy.id} names unknown represented subject ${policy.representedSubjectId}`);
    }
  }
  for (const artifact of record.artifacts) {
    if ((artifact.representedSubjectIds?.length ?? 0) === 0) {
      reasons.push(`artifact ${artifact.id} has no represented-subject policy linkage`);
    }
    for (const subjectId of artifact.representedSubjectIds ?? []) {
      if (!representedSubjectIds.has(subjectId)) {
        reasons.push(`artifact ${artifact.id} names unknown represented subject ${subjectId}`);
        continue;
      }
      const policies = record.usePolicies.filter(
        (policy) => policy.representedSubjectId === subjectId && policy.purpose === request.purpose && policy.destination === request.destination,
      );
      if (policies.some((policy) => policy.state === "denied" || policy.state === "withdrawn")) {
        reasons.push(`subject ${subjectId} denies or withdrew purpose ${request.purpose} for ${request.destination}`);
      } else if (!policies.some((policy) => policy.state === "granted")) {
        reasons.push(`subject ${subjectId} has no explicit grant for purpose ${request.purpose} at ${request.destination}`);
      }
    }
  }
}

/** Whole-record releases coexist with evidence grants but never infer them. */
function evaluateRecordRelease(record: WorkRecord, reasons: string[]): void {
  if (!hasExportableUsePolicy(record)) {
    reasons.push("use policy required before export or share");
  }
}
