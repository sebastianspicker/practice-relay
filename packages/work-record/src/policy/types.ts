/** Canonical WorkRecord policy contracts. */

/** Immutable record-level release decision for whole-record handoff. */
export interface UsePolicySnapshot {
  id: string;
  subjectId: string;
  purposes: string[];
  exportAllowed?: boolean;
  createdAt: string;
}

/** Explicit permission boundary for one represented subject, purpose, and destination. */
export interface UsePolicy {
  id: string;
  representedSubjectId: string;
  purpose: string;
  destination: string;
  state: "granted" | "denied" | "withdrawn";
  createdAt: string;
  evidenceRef?: string;
}
