/**
 * Derive Practice Relay handoff checks from retained WorkRecord evidence.
 * Why: readiness copy must describe the current record instead of presenting static success claims.
 */

/** Return the five visible handoff checks for a workspace record. */
export function handoffChecks(record) {
  const policies = Array.isArray(record?.policies) ? record.policies : [];
  const hasAssessmentPermission = policies.some(
    (policy) => policy?.purpose === "assessment" && policy?.state === "granted",
  );
  const hasRepositoryPermission = policies.some(
    (policy) =>
      ["archive", "repository", "deposit"].includes(policy?.purpose) &&
      policy?.state === "granted",
  );

  return [
    { label: "Intended version selected", complete: Boolean(record?.versions?.length) },
    {
      label: "Evidence set reviewed",
      complete: Boolean(record?.artifacts?.length && record?.snapshots?.length),
    },
    { label: "Responsible roles named", complete: Boolean(record?.members?.length) },
    { label: "Assessment use permitted", complete: hasAssessmentPermission },
    {
      label: hasRepositoryPermission
        ? "Repository reuse permitted"
        : "Repository reuse needs review",
      complete: hasRepositoryPermission,
    },
  ];
}
