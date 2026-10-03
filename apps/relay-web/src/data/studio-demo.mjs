/** Explicit fictional studio example; never used as fallback for a failed live request. */
export const studioMotif = {
  schemaVersion: "0.2.0", profile: "mvei-motif", id: "weight-study", title: "Weight & counterweight", completeness: "partial",
  items: ["walk", "turn", "stillness", "balance"].map((symbol, order) => ({ id: `movement-${order + 1}`, symbol, order, timeAnchor: { tMs: [0, 4200, 7600, 11200][order] } })),
};

/** Synthetic project matching the approved studio composition. */
export const studioRecord = {
  id: "synthetic-weight-study", title: "Weight & counterweight", profile: "Performing arts", revision: 1,
  members: [{ userId: "studio-faculty", label: "Alex Morgan", role: "faculty" }],
  representedSubjects: [{ id: "performer-01", label: "Performer 01", type: "Person" }, { id: "performer-02", label: "Performer 02", type: "Person" }],
  tracks: [{ id: "motif", type: "movement_notation", label: "Weight study", ref: "weight-study.motif.json" }],
  artifacts: [{ id: "rehearsal", name: "rehearsal-take-03.mp4", mediaType: "video/mp4" }, { id: "motif", name: "weight-study.motif.json", mediaType: "application/json" }].map(artifact => ({ ...artifact, representedSubjectIds: ["performer-01", "performer-02"], contentUrl: `https://example.invalid/synthetic/${artifact.name}`, sha256: "0".repeat(64) })),
  usePolicies: ["performer-01", "performer-02"].map(representedSubjectId => ({ id: `permission-${representedSubjectId}`, representedSubjectId, purpose: "formative_feedback", destination: "studio-review", state: "granted", createdAt: "2026-09-09T09:00:00Z" })),
  snapshots: [], versions: [{ id: "rehearsal-03", name: "Duet study / Rehearsal 03", createdAt: "2026-09-09T09:00:00Z" }],
  takes: [], comments: [], provenance: { createdAt: "2026-09-09T09:00:00Z", sourceSystem: "synthetic studio example" },
};

/** Produce a clearly labeled simulation, not an authoritative policy decision or RO-Crate. */
export function simulateEvidenceExport(record, { purpose, destination }) {
  const reasons = [];
  if (!purpose.trim() || !destination.trim()) reasons.push("Enter a purpose and destination.");
  if (!record.artifacts.length) reasons.push("Add subject-linked evidence before export.");
  for (const artifact of record.artifacts) {
    if (!artifact.representedSubjectIds?.length) reasons.push(`${artifact.name}: no represented subjects linked.`);
    for (const subjectId of artifact.representedSubjectIds ?? []) {
      const policies = record.policies.filter(p => p.representedSubjectId === subjectId && p.purpose === purpose && p.destination === destination);
      if (policies.some(p => p.state === "denied" || p.state === "withdrawn")) reasons.push(`${subjectId}: denied or withdrawn for this use.`);
      else if (!policies.some(p => p.state === "granted")) reasons.push(`${subjectId}: no matching recorded grant.`);
    }
  }
  return { simulated: true, decision: { allowed: !reasons.length, reasons: [...new Set(reasons)], includedArtifactIds: reasons.length ? [] : record.artifacts.map(a => a.id) }, roCrate: { files: { "ro-crate-metadata.json": JSON.stringify({ simulation: true, purpose, destination, artifacts: record.artifacts }, null, 2) } } };
}
