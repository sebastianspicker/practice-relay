/** Shared internal types for the E2E demo facade and its scenario runners. */
import type { Role, TrackType } from "@practice-relay/work-record-core";

/** One evidence-bearing step emitted by the shipped-entry-point demo. */
export type DemoStep = {
  id: string;
  ok: boolean;
  detail: string;
  /** Optional structured payload for tests (never a fake "PASS" alone). */
  data?: Record<string, unknown>;
};

/** Aggregate result and human-readable log for the end-to-end demo. */
export type DemoResult = {
  ok: boolean;
  steps: DemoStep[];
  logText: string;
};

/** Fixture shape used to construct the deterministic demo WorkRecord. */
export type Seed = {
  id: string;
  title: string;
  members: { userId: string; role: Role }[];
  tracks: { id: string; type: TrackType; label?: string; ref?: string }[];
  takes: { id: string; label?: string; mediaPath?: string }[];
  preferredTakeId: string;
  region: { id: string; label?: string; startMs: number; endMs: number };
  comment: {
    id: string;
    regionId: string;
    trackId?: string;
    authorId: string;
    body: string;
    resolved?: boolean;
  };
  consent: {
    id: string;
    subjectId: string;
    purposes: string[];
    exportAllowed?: boolean;
  };
  motif: { trackId: string; label?: string; ref: string };
  submitTag: string;
};
