/**
 * @practice-relay/interop - WorkRecord → OTIO / EAF / OSC / MusicXML-ref exporters.
 *
 * FOSS spine (Practice Relay Q12): federate existing formats rather than invent private timelines.
 * Exports are best-effort projections for lab interop - not full NLE/ELAN feature parity.
 */

/** Target interchange formats Practice Relay may project to. */
export type ExportFormat = "otio-json" | "eaf" | "musicxml-ref" | "osc-cue-map";

/** Minimal record shape for exporters; duck typing avoids a hard application dependency. */
export interface InteropScoreLike {
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
  comments?: Array<{
    id: string;
    regionId: string;
    authorId: string;
    body: string;
    resolved?: boolean;
  }>;
}

/** Request to export a WorkRecord into an external format. */
export interface ExportRequest {
  workRecordId: string;
  format: ExportFormat;
}

/**
 * Human-readable description of an export request (logging / UI).
 */
export function describeExport(req: ExportRequest): string {
  return `export ${req.workRecordId} as ${req.format}`;
}

/** Serialized external-format projection returned by an exporter. */
export interface ExportResult {
  format: ExportFormat;
  contentType: string;
  body: string;
  filename: string;
}

function regionsOf(score: InteropScoreLike) {
  return (
    score.regions ??
    score.spine?.regions ??
    []
  );
}

/** OTIO-like timeline JSON (OpenTimelineIO conceptual subset, OTIO 0.17 style). */
export function exportOtioJson(score: InteropScoreLike): ExportResult {
  const duration = score.spine?.durationMs ?? 60_000;
  const tracks = (score.tracks ?? []).map((t) => ({
    OTIO_SCHEMA: "Track.1",
    name: t.label ?? t.id,
    kind: t.type,
    children: [
      {
        OTIO_SCHEMA: "Clip.1",
        name: t.ref ?? t.id,
        source_range: {
          OTIO_SCHEMA: "TimeRange.1",
          start_time: { OTIO_SCHEMA: "RationalTime.1", value: 0, rate: 1000 },
          duration: {
            OTIO_SCHEMA: "RationalTime.1",
            value: duration,
            rate: 1000,
          },
        },
        media_reference: t.ref
          ? {
              OTIO_SCHEMA: "ExternalReference.1",
              target_url: t.ref,
            }
          : null,
      },
    ],
  }));

  const markers = regionsOf(score).map((r) => ({
    OTIO_SCHEMA: "Marker.1",
    name: r.label ?? r.id,
    marked_range: {
      OTIO_SCHEMA: "TimeRange.1",
      start_time: {
        OTIO_SCHEMA: "RationalTime.1",
        value: r.startMs,
        rate: 1000,
      },
      duration: {
        OTIO_SCHEMA: "RationalTime.1",
        value: Math.max(0, r.endMs - r.startMs),
        rate: 1000,
      },
    },
  }));

  const timeline = {
    OTIO_SCHEMA: "Timeline.1",
    name: score.title ?? score.id,
    metadata: {
      workRecordId: score.id,
      preferredTakeId: score.preferredTakeId ?? null,
      exporter: "@practice-relay/interop",
    },
    tracks: {
      OTIO_SCHEMA: "Stack.1",
      children: tracks,
    },
    markers,
  };

  return {
    format: "otio-json",
    contentType: "application/json",
    body: JSON.stringify(timeline, null, 2),
    filename: `${score.id}.otio.json`,
  };
}

/** ELAN-like EAF XML (tiers for regions + comments). */
export function exportEaf(score: InteropScoreLike): ExportResult {
  const regions = regionsOf(score);
  const comments = score.comments ?? [];
  const timeSlots: string[] = [];
  const slotId = (ms: number) => {
    const id = `ts${ms}`;
    if (!timeSlots.includes(id)) timeSlots.push(id);
    return id;
  };

  for (const r of regions) {
    slotId(r.startMs);
    slotId(r.endMs);
  }

  const slotXml = [...new Set(timeSlots)]
    .map((id) => {
      const ms = Number(id.replace(/^ts/, ""));
      return `    <TIME_SLOT TIME_SLOT_ID="${id}" TIME_VALUE="${ms}"/>`;
    })
    .join("\n");

  const regionAnns = regions
    .map((r, i) => {
      const aid = `a-reg-${i}`;
      return `    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="${aid}" TIME_SLOT_REF1="${slotId(r.startMs)}" TIME_SLOT_REF2="${slotId(r.endMs)}">
        <ANNOTATION_VALUE>${escapeXml(r.label ?? r.id)}</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>`;
    })
    .join("\n");

  const commentAnns = comments
    .map((c, i) => {
      const reg = regions.find((r) => r.id === c.regionId);
      const start = reg?.startMs ?? 0;
      const end = reg?.endMs ?? start + 1;
      return `    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a-cmt-${i}" TIME_SLOT_REF1="${slotId(start)}" TIME_SLOT_REF2="${slotId(end)}">
        <ANNOTATION_VALUE>${escapeXml(`${c.authorId}: ${c.body}`)}</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>`;
    })
    .join("\n");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT AUTHOR="practice-relay-interop" DATE="${new Date().toISOString()}" FORMAT="3.0" VERSION="3.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <HEADER MEDIA_FILE="" TIME_UNITS="milliseconds">
    <PROPERTY NAME="workRecordId">${escapeXml(score.id)}</PROPERTY>
  </HEADER>
  <TIME_ORDER>
${slotXml}
  </TIME_ORDER>
  <TIER TIER_ID="regions" LINGUISTIC_TYPE_REF="default">
${regionAnns}
  </TIER>
  <TIER TIER_ID="comments" LINGUISTIC_TYPE_REF="default" PARENT_REF="regions">
${commentAnns}
  </TIER>
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="default" TIME_ALIGNABLE="true"/>
</ANNOTATION_DOCUMENT>
`;

  return {
    format: "eaf",
    contentType: "application/xml",
    body,
    filename: `${score.id}.eaf`,
  };
}

/** OSC cue map JSON for show-control federation (not a runtime). */
export function exportOscCueMap(score: InteropScoreLike): ExportResult {
  const cues = regionsOf(score).map((r) => ({
    tMs: r.startMs,
    address: `/practice-relay/${score.id}/region`,
    args: [r.id, r.label ?? ""],
  }));

  // media_cues tracks as extra cue sources
  for (const t of score.tracks ?? []) {
    if (t.type === "media_cues" || t.type === "control") {
      cues.push({
        tMs: 0,
        address: `/practice-relay/${score.id}/track`,
        args: [t.id, t.type, t.ref ?? ""],
      });
    }
  }

  cues.sort((a, b) => a.tMs - b.tMs);

  const doc = {
    schemaVersion: "0.2.0",
    kind: "practice-relay-osc-cue-map",
    workRecordId: score.id,
    title: score.title ?? "",
    cues,
  };

  return {
    format: "osc-cue-map",
    contentType: "application/json",
    body: JSON.stringify(doc, null, 2),
    filename: `${score.id}.osc-cues.json`,
  };
}

/** MusicXML/MEI ref binding (does not re-encode notation). */
export function exportMusicxmlRef(score: InteropScoreLike): ExportResult {
  const music = (score.tracks ?? []).filter(
    (t) => t.type === "music_notation" || t.type === "musicxml" || t.type === "mei",
  );
  const doc = {
    schemaVersion: "0.2.0",
    kind: "practice-relay-music-ref",
    workRecordId: score.id,
    title: score.title ?? "",
    musicxmlRef: music.find((t) => t.ref)?.ref ?? null,
    refs: music.map((t) => ({
      trackId: t.id,
      type: t.type,
      ref: t.ref ?? null,
      label: t.label,
    })),
  };

  return {
    format: "musicxml-ref",
    contentType: "application/json",
    body: JSON.stringify(doc, null, 2),
    filename: `${score.id}.music-refs.json`,
  };
}

/**
 * Export a WorkRecord projection to a supported interchange format.
 */
export function exportRecord(
  score: InteropScoreLike,
  format: ExportFormat,
): ExportResult {
  switch (format) {
    case "otio-json":
      return exportOtioJson(score);
    case "eaf":
      return exportEaf(score);
    case "osc-cue-map":
      return exportOscCueMap(score);
    case "musicxml-ref":
      return exportMusicxmlRef(score);
    default: {
      const _x: never = format;
      throw new Error(`unsupported format: ${_x}`);
    }
  }
}

export {
  importEafToRecordParts,
  parseEafTierIds,
  type ImportRegionsResult,
} from "./eaf-import.js";
export {
  importOtioToRecordParts,
  type OtioImportResult,
} from "./otio-import.js";
export {
  formatImportWarning,
  warningCodes,
  type ImportWarning,
  type ImportWarningCode,
} from "./import-warnings.js";
// Re-export OSC thin-adapter surface (document projection, not a runtime).
export {
  projectOscBundle,
  formatOscUdpPayload,
  toOssianHint,
  toMaxDict,
  type OscMessage,
  type OscUdpPayload,
  type OssianHint,
  type MaxDictPatch,
} from "./osc-bridge.js";

/**
 * OSC deep-link projection: multi-asset document cues, not a show-control runtime.
 * Address scheme: /practice-relay/{recordId}/region | /track | /preferred_take
 */
export function buildOscDeepLinkProjection(score: InteropScoreLike): {
  kind: "practice-relay-osc-deep-link";
  schemaVersion: "0.4.0";
  note: string;
  endpoints: Array<{ address: string; description: string }>;
  cues: ReturnType<typeof exportOscCueMap> extends { body: string }
    ? unknown
    : never;
} {
  const cues = JSON.parse(exportOscCueMap(score).body);
  return {
    kind: "practice-relay-osc-deep-link",
    schemaVersion: "0.4.0",
    note:
      "WorkRecord OSC projection for federation with ossia, Max, or QLab. Practice Relay is not the runtime.",
    endpoints: [
      {
        address: `/practice-relay/${score.id}/region`,
        description: "Fire region marker by id",
      },
      {
        address: `/practice-relay/${score.id}/track`,
        description: "Announce track presence (media_cues/control)",
      },
      {
        address: `/practice-relay/${score.id}/preferred_take`,
        description: "Preferred take id for critique",
      },
    ],
    cues: cues.cues,
  };
}

/** Escape values interpolated into XML element content or attributes. */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
