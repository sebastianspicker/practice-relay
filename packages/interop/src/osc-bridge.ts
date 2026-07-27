/**
 * Thin OSC adapters for Practice Relay federation with ossia / Max / QLab.
 *
 * WorkRecord projection only. This module is not a show-control runtime.
 * See practice-relay/docs/osc-federation.md.
 */

/** Duck-typed WorkRecord slice that avoids a circular import with index.ts. */
export interface OscScoreLike {
  id: string;
  title?: string;
  tracks?: Array<{ id: string; type: string; label?: string; ref?: string }>;
  takes?: Array<{ id: string; label?: string; mediaPath?: string }>;
  preferredTakeId?: string | null;
  regions?: Array<{ id: string; startMs: number; endMs: number; label?: string }>;
  spine?: {
    durationMs?: number;
    regions?: Array<{ id: string; startMs: number; endMs: number; label?: string }>;
  };
}

/** One projected OSC message (address + args + timeline offset). */
export interface OscMessage {
  address: string;
  args: Array<string | number | boolean>;
  tMs: number;
}

/** Human + machine description of a UDP-oriented payload for external tools. */
export interface OscUdpPayload {
  /** How to consume these messages outside Practice Relay. */
  description: string;
  /** NDJSON: one OscMessage per line (easy for Max/js, Node, Python). */
  jsonLines: string;
  messages: OscMessage[];
}

/**
 * ossia score receive-address hint (JSON patch doc - not a binary .ossia score).
 * Documents how to wire inbound OSC without Practice Relay owning the runtime.
 */
export interface OssianHint {
  kind: "practice-relay-ossia-hint";
  schemaVersion: "0.4.0";
  workRecordId: string;
  title: string;
  note: string;
  /** Suggested ossia scenario duration (ms). */
  durationMs: number;
  /** Receive addresses and how to map them onto ossia nodes. */
  receiveAddresses: Array<{
    address: string;
    args: string[];
    ossiaNodeHint: string;
    description: string;
  }>;
  /** Timed cues projected from the WorkRecord spine. */
  cues: OscMessage[];
}

/**
 * Max dict-style patch describing [udpreceive] / [route] wiring (JSON, not .maxpat binary).
 */
export interface MaxDictPatch {
  kind: "practice-relay-max-dict";
  schemaVersion: "0.4.0";
  workRecordId: string;
  title: string;
  note: string;
  /** Suggested Max patch objects (textual, hand-rebuildable). */
  patchObjects: Array<{
    box: string;
    role: string;
    detail: string;
  }>;
  /** route prefixes for [route] after [udpreceive]. */
  routeTree: Array<{
    pattern: string;
    outletHint: string;
  }>;
  /** dict-ready cue list keyed for [dict] / [coll]. */
  dict: {
    recordId: string;
    cues: OscMessage[];
    preferredTakeId: string | null;
  };
}

function regionsOf(score: OscScoreLike) {
  return score.regions ?? score.spine?.regions ?? [];
}

/**
 * Project a WorkRecord-like document into multi-asset OSC messages.
 *
 * Address scheme:
 * - `/practice-relay/{recordId}/region` - region markers
 * - `/practice-relay/{recordId}/track` - track presence (all track types)
 * - `/practice-relay/{recordId}/preferred_take` - preferred take for critique
 */
export function projectOscBundle(score: OscScoreLike): OscMessage[] {
  const base = `/practice-relay/${score.id}`;
  const messages = [...regionMessages(score, base), ...trackMessages(score, base), ...preferredTakeMessages(score, base)];
  messages.sort((a, b) => a.tMs - b.tMs || a.address.localeCompare(b.address));
  return messages;
}

/** Project spine regions into timestamped region notifications. */
function regionMessages(score: OscScoreLike, base: string): OscMessage[] {
  return regionsOf(score).map((region) => ({ tMs: region.startMs, address: `${base}/region`, args: [region.id, region.label ?? "", region.endMs] }));
}

/** Project declared tracks into start-of-document presence notifications. */
function trackMessages(score: OscScoreLike, base: string): OscMessage[] {
  return (score.tracks ?? []).map((track) => ({ tMs: 0, address: `${base}/track`, args: [track.id, track.type, track.ref ?? "", track.label ?? ""] }));
}

/** Project the optional selected take as a single metadata notification. */
function preferredTakeMessages(score: OscScoreLike, base: string): OscMessage[] {
  return score.preferredTakeId ? [{ tMs: 0, address: `${base}/preferred_take`, args: [score.preferredTakeId] }] : [];
}

/**
 * Format projected OSC messages for external tools (JSON lines + description).
 * Does not open sockets or own a runtime - adapters ship the payload only.
 */
export function formatOscUdpPayload(messages: OscMessage[]): OscUdpPayload {
  return {
    description:
      "Practice Relay OSC document projection (not a runtime). " +
      "Each JSON line is {address, args, tMs}. " +
      "Map addresses into ossia score nodes, Max [udpreceive]/route, or QLab network cues. " +
      "Schedule by tMs relative to the WorkRecord spine; do not treat Practice Relay as the show controller.",
    jsonLines: messages.map((m) => JSON.stringify(m)).join("\n"),
    messages,
  };
}

/**
 * ossia receive-address JSON patch documenting how to schedule Practice Relay cues
 * inside an ossia score scenario. Not a binary .ossia file and not a runtime.
 */
export function toOssianHint(score: OscScoreLike): OssianHint {
  const cues = projectOscBundle(score);
  const base = `/practice-relay/${score.id}`;
  const durationMs =
    score.spine?.durationMs ??
    Math.max(0, ...regionsOf(score).map((r) => r.endMs), 60_000);

  return {
    kind: "practice-relay-ossia-hint",
    schemaVersion: "0.4.0",
    workRecordId: score.id,
    title: score.title ?? score.id,
    note:
      "JSON receive-address map for ossia score - federate, do not replace ossia as show runtime. " +
      "Create a scenario of durationMs; fire outbound or local OSC at each cue tMs.",
    durationMs,
    receiveAddresses: [
      {
        address: `${base}/region`,
        args: ["regionId", "label", "endMs"],
        ossiaNodeHint: "scenario/interval → trigger or state at tMs",
        description: "Spine region marker (phrase, warmup, coda)",
      },
      {
        address: `${base}/track`,
        args: ["trackId", "type", "ref", "label"],
        ossiaNodeHint: "metadata node or device parameter (presence)",
        description: "Multi-domain track presence (video, audio, media_cues, …)",
      },
      {
        address: `${base}/preferred_take`,
        args: ["takeId"],
        ossiaNodeHint: "string parameter on document metadata device",
        description: "Preferred process take for critique / assessment",
      },
    ],
    cues,
  };
}

/**
 * Max dict / route JSON patch for [udpreceive] wiring.
 * JSON documentation only - not a binary .maxpat.
 */
export function toMaxDict(score: OscScoreLike): MaxDictPatch {
  const cues = projectOscBundle(score);
  const base = `/practice-relay/${score.id}`;
  return {
    kind: "practice-relay-max-dict",
    schemaVersion: "0.4.0",
    workRecordId: score.id,
    title: score.title ?? score.id,
    note:
      "JSON Max adapter hint - rebuild with [udpreceive] [route] [dict] / [coll]. " +
      "Practice Relay does not ship or own a Max runtime; schedule transport outside Practice Relay.",
    patchObjects: maxPatchObjects(base),
    routeTree: maxRouteTree(base),
    dict: {
      recordId: score.id,
      cues,
      preferredTakeId: score.preferredTakeId ?? null,
    },
  };
}

/** Build the stable, hand-rebuildable Max object inventory. */
function maxPatchObjects(base: string) {
  return [
    { box: "udpreceive 9001", role: "ingress", detail: "Listen for OSC on lab network port (choose free port)" },
    { box: `route ${base}/region ${base}/track ${base}/preferred_take`, role: "demultiplex", detail: "Split Practice Relay address tree to three outlets" },
    { box: "dict practice-relay-cues", role: "store", detail: "Optional: load dict.cues from this patch JSON for offline transport" },
    { box: "coll practice-relay-timeline", role: "schedule", detail: "Index by tMs for metro/transport-driven fire" },
  ];
}

/** Build the documented route-outlet mapping for the Max adapter. */
function maxRouteTree(base: string) {
  return [
    { pattern: `${base}/region`, outletHint: "outlet 0 → regionId label endMs" },
    { pattern: `${base}/track`, outletHint: "outlet 1 → trackId type ref label" },
    { pattern: `${base}/preferred_take`, outletHint: "outlet 2 → takeId" },
  ];
}
