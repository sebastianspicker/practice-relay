/**
 * Shared interop test fixtures - one realistic multi-track score for export/import contracts.
 *
 * Why: exporter and field-fidelity suites exercise the same document shape, so this fixture
 * prevents their test inputs from silently diverging.
 */

/** Representative score used by interop round-trip and field-fidelity tests. */
export const interopSample = {
  id: "ps-io",
  title: "Interop sample",
  preferredTakeId: "t1",
  tracks: [
    { id: "v", type: "video", ref: "media/a.mp4" },
    { id: "m", type: "music_notation", ref: "score.musicxml" },
    { id: "c", type: "media_cues", ref: "cues.json" },
  ],
  spine: {
    durationMs: 10000,
    regions: [
      { id: "r1", startMs: 0, endMs: 2000, label: "intro" },
      { id: "r2", startMs: 2000, endMs: 5000, label: "phrase" },
    ],
  },
  comments: [{ id: "c1", regionId: "r1", authorId: "teacher-1", body: "Watch timing" }],
};
