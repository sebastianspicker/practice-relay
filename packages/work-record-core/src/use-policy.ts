/** Legacy-style immutable use-policy snapshots and export gates. */
import { assertResourceId } from "./validation.ts";
import type { UsePolicySnapshot, WorkRecord } from "./types.ts";

/** Attaches a validated immutable use-policy snapshot. */
export function attachUsePolicySnapshot(record: WorkRecord, policy: UsePolicySnapshot): WorkRecord {
  assertResourceId(policy.id, "use policy id");
  assertResourceId(policy.subjectId, "use policy subjectId");
  if (!Array.isArray(policy.purposes) || policy.purposes.length === 0 || policy.purposes.length > 32 || policy.purposes.some((purpose) => typeof purpose !== "string" || !purpose.trim() || purpose.length > 256)) {
    throw new Error("use policy purposes must contain 1 to 32 bounded strings");
  }
  if (policy.exportAllowed !== undefined && typeof policy.exportAllowed !== "boolean") {
    throw new Error("use policy exportAllowed must be boolean");
  }
  if (typeof policy.createdAt !== "string" || !policy.createdAt.trim()) {
    throw new Error("use policy createdAt must be a non-empty string");
  }
  if (record.usePolicySnapshots.some((existing) => existing.id === policy.id)) {
    throw new Error(`use policy id already exists: ${policy.id}`);
  }
  return { ...record, usePolicySnapshots: [...record.usePolicySnapshots, { ...policy }] };
}

/** Checks whether all student members have a current exportable use-policy snapshot. */
export function hasExportableUsePolicy(record: WorkRecord): boolean {
  const latestBySubject = new Map<string, UsePolicySnapshot>();
  for (const policy of record.usePolicySnapshots) latestBySubject.set(policy.subjectId, policy);
  const exportable = (subjectId: string) => {
    const policy = latestBySubject.get(subjectId);
    return Boolean(policy && policy.purposes.length > 0 && policy.exportAllowed !== false);
  };
  const studentSubjects = [...new Set(record.members.filter((member) => member.role === "student").map((member) => member.userId))];
  return studentSubjects.length > 0
    ? studentSubjects.every(exportable)
    : [...latestBySubject.keys()].some(exportable);
}

/** Throws if a record lacks an exportable use-policy snapshot. */
export function assertCanExport(record: WorkRecord): void {
  if (!hasExportableUsePolicy(record)) throw new Error("use policy required before export or share");
}
