/**
 * Synthetic Practice Relay WorkRecord fixtures for local demo fallback.
 * Why residual: the alpha surface must stay usable when the record service is unreachable,
 * without implying live institutional data or remote write-back.
 */

/** Explicit local demo WorkRecord array shown only when the API is unavailable. */
export const fallbackRecords = [{
  id: "WR-2026-042",
  title: "Week 6 duet study",
  profile: "Performing arts",
  revision: 5,
  artifacts: [
    { id: "video", name: "Performance video", mediaType: "video/mp4", detail: "MP4 · 1080p · 02:34", preferredTake: "Studio run 2" },
    { id: "audio", name: "Reference audio", mediaType: "audio/wav", detail: "WAV · 48 kHz · 02:34", preferredTake: "Studio run 2" },
    { id: "score", name: "MusicXML score", mediaType: "application/vnd.recordare.musicxml+xml", detail: "MusicXML · 8 pages" },
    { id: "reflection", name: "Student reflection", mediaType: "text/markdown", detail: "Markdown · 1.2 KB" },
    { id: "movement", name: "Movement annotation", mediaType: "application/json", detail: "JSON · 256 KB", preferredTake: "Studio run 2" },
    { id: "cues", name: "Media cues", mediaType: "application/json", detail: "JSON · 6 cues" },
  ],
  tracks: [{ id: "movement", type: "movement_annotation", ref: "crossing-motif.json" }],
  members: [{ userId: "ada-m", label: "Ada M.", role: "student" }, { userId: "e-patel", label: "E. Patel", role: "faculty" }],
  representedSubjects: [{ id: "lee-s", label: "Lee S." }, { id: "partner-archive", label: "Partner archive" }],
  usePolicies: [
    { id: "assessment", representedSubjectId: "lee-s", purpose: "assessment", destination: "Studio Practice 2", state: "granted", createdAt: "2026-07-18" },
    { id: "archive", representedSubjectId: "partner-archive", purpose: "archive", destination: "Partner archive", state: "denied", createdAt: "2026-07-18" },
  ],
  snapshots: [{ id: "snapshot-04", createdAt: "2026-07-18", artifactIds: ["video", "audio", "score", "reflection", "movement"], reason: "assessment handoff" }],
  versions: [{ id: "revision-05", name: "Revision 05", createdAt: "2026-07-18", snapshotRef: "snapshot-04" }],
  preferredTakeId: "Studio run 2",
  comments: [{ id: "comment-1", body: "Align travel with measure 5.", authorId: "E. Patel", regionId: "phrase-a", createdAt: "2026-07-18T09:14:00Z", resolved: false }],
  provenance: { createdAt: "2026-07-18T09:20:00Z", sourceSystem: "specialist source systems" },
  spine: { durationMs: 154000, regions: [] },
}];
