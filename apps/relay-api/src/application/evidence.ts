/** Immutable evidence-resource operations for the richer WorkRecord profile. */
import {
  evaluateExport,
  type WorkRecord,
} from "@practice-relay/work-record";
import { writeEvidenceRoCrate13 } from "@practice-relay/handoff";

/** Evaluate the explicit purpose/destination policy mode before RO-Crate serialization. */
export function explicitEvidenceExport(record: WorkRecord, purpose: string, destination: string) {
  const decision = evaluateExport(record, { purpose, destination });
  return decision.allowed
    ? {
        decision,
        roCrate: writeEvidenceRoCrate13(record, decision.includedArtifactIds),
      }
    : { decision };
}
