/**
 * Derive Practice Relay handoff checks from retained WorkRecord evidence.
 * Why: readiness copy must describe the current record instead of presenting static success claims.
 */

/** Return the five visible handoff checks for a workspace record. */
export function handoffChecks(record) {
  const policies = Array.isArray(record?.policies) ? record.policies : [];
  // Same rule as the handoff permission ledger: a subject's denial or withdrawal outranks its grant.
  const permitted = (purposes) => {
    const matching = policies.filter((policy) => purposes.includes(policy?.purpose));
    const blocked = new Set(matching
      .filter((policy) => policy?.state === "denied" || policy?.state === "withdrawn")
      .map((policy) => policy?.representedSubjectId));
    return matching.some((policy) => policy?.state === "granted" && !blocked.has(policy?.representedSubjectId));
  };
  const hasAssessmentPermission = permitted(["assessment"]);
  const hasRepositoryPermission = permitted(["archive", "repository", "deposit"]);

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
