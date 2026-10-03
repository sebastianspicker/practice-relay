/**
 * Explicitly lossy, policy-gated WorkRecord projections to OTIO / EAF / OSC / MusicXML.
 *
 * FOSS spine (Practice Relay Q12): federate existing formats rather than invent private timelines.
 * Exports are best-effort projections for lab interop - not full NLE/ELAN feature parity.
 */

/** Target interchange formats Practice Relay may project to. */
export type ExportFormat = "otio-json" | "eaf" | "musicxml-ref" | "osc-cue-map";

/** Stable identifiers for source information a lossy export cannot represent. */
export type ExportLossCode =
  | "OTIO_WORK_RECORD_FIELD_OMISSIONS"
  | "EAF_WORK_RECORD_FIELD_OMISSIONS"
  | "OSC_CUE_MAP_WORK_RECORD_FIELD_OMISSIONS"
  | "MUSICXML_REF_WORK_RECORD_FIELD_OMISSIONS";

/** Canonical WorkRecord fields an interop format may report as omitted. */
export type ExportOmittedField =
  | "schemaVersion" | "profile" | "revision" | "title" | "members" | "actors"
  | "representedSubjects" | "spine" | "tracks" | "preferredTakeId" | "takeIds"
  | "takes" | "comments" | "versions" | "usePolicySnapshots" | "movementCapability"
  | "artifacts" | "relations" | "iterations" | "annotations" | "views"
  | "usePolicies" | "provenance" | "snapshots"
  | "spine.schemaVersion" | "spine.mode" | "spine.durationMs" | "spine.markers"
  | "spine.meter" | "spine.regions[].id" | "spine.regions[].endMs"
  | "tracks[].id" | "tracks[non-cue]" | "tracks[non-music]"
  | "comments[].id" | "comments[].trackId" | "comments[].resolved"
  | "comments[].createdAt";

/** One deterministic statement of information omitted by an interop export. */
export interface ExportLoss {
  code: ExportLossCode;
  message: string;
  omittedFields: readonly ExportOmittedField[];
}

import {
  assertExportApproved,
  parseWorkRecord,
  type WorkRecord,
} from "@practice-relay/work-record";
import {
  projectOscBundle as buildOscMessages,
  type OscMessage,
} from "./osc-bridge.js";

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
  losses: ExportLoss[];
}

const EXPORT_LOSSES: Readonly<Record<ExportFormat, ExportLoss>> = {
  "otio-json": {
    code: "OTIO_WORK_RECORD_FIELD_OMISSIONS",
    message: "OTIO omits WorkRecord governance, people, artifacts, process, and policy fields.",
    omittedFields: [
      "schemaVersion", "profile", "revision", "members", "actors",
      "representedSubjects", "takes", "comments", "versions",
      "usePolicySnapshots", "movementCapability", "artifacts", "relations",
      "iterations", "annotations", "views", "usePolicies", "provenance", "snapshots",
      "spine.schemaVersion", "spine.mode", "spine.markers", "spine.meter",
      "spine.regions[].id", "tracks[].id",
    ],
  },
  eaf: {
    code: "EAF_WORK_RECORD_FIELD_OMISSIONS",
    message: "EAF omits WorkRecord identity context, media, governance, and policy fields.",
    omittedFields: [
      "schemaVersion", "profile", "revision", "title", "members", "actors",
      "representedSubjects", "tracks", "preferredTakeId", "takeIds", "takes",
      "versions", "usePolicySnapshots", "movementCapability", "artifacts", "relations",
      "iterations", "annotations", "views", "usePolicies", "provenance", "snapshots",
      "spine.schemaVersion", "spine.mode", "spine.durationMs", "spine.markers",
      "spine.meter", "spine.regions[].id", "comments[].id", "comments[].trackId",
      "comments[].resolved", "comments[].createdAt",
    ],
  },
  "osc-cue-map": {
    code: "OSC_CUE_MAP_WORK_RECORD_FIELD_OMISSIONS",
    message: "OSC cue maps omit WorkRecord media, critique, governance, process, and policy fields.",
    omittedFields: [
      "schemaVersion", "profile", "revision", "members", "actors",
      "representedSubjects", "preferredTakeId", "takeIds", "takes", "comments",
      "versions", "usePolicySnapshots", "movementCapability", "artifacts", "relations",
      "iterations", "annotations", "views", "usePolicies", "provenance", "snapshots",
      "spine.schemaVersion", "spine.mode", "spine.durationMs", "spine.markers",
      "spine.meter", "spine.regions[].endMs", "tracks[non-cue]",
    ],
  },
  "musicxml-ref": {
    code: "MUSICXML_REF_WORK_RECORD_FIELD_OMISSIONS",
    message: "MusicXML references omit WorkRecord time, critique, governance, process, and policy fields.",
    omittedFields: [
      "schemaVersion", "profile", "revision", "members", "actors",
      "representedSubjects", "spine", "preferredTakeId", "takeIds", "takes", "comments",
      "versions", "usePolicySnapshots", "movementCapability", "artifacts", "relations",
      "iterations", "annotations", "views", "usePolicies", "provenance", "snapshots",
      "tracks[non-music]",
    ],
  },
};

/** Return a fresh stable loss statement so callers cannot mutate later exports. */
function exportLosses(format: ExportFormat): ExportLoss[] {
  const loss = EXPORT_LOSSES[format];
  return [{ ...loss, omittedFields: [...loss.omittedFields] }];
}

function regionsOf(record: WorkRecord) {
  return record.spine.regions ?? [];
}

/** OTIO-like timeline JSON (OpenTimelineIO conceptual subset, OTIO 0.17 style). */
function projectOtioJson(record: WorkRecord): ExportResult {
  const duration = record.spine.durationMs;
  const tracks = record.tracks.map((t) => ({
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

  const markers = regionsOf(record).map((r) => ({
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
    name: record.title,
    metadata: {
      workRecordId: record.id,
      preferredTakeId: record.preferredTakeId,
      exporter: "@practice-relay/handoff/projections",
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
    filename: `${record.id}.otio.json`,
    losses: exportLosses("otio-json"),
  };
}

/** ELAN-like EAF XML (tiers for regions + comments). */
function projectEaf(record: WorkRecord): ExportResult {
  const regions = regionsOf(record);
  const comments = record.comments;
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
      <PROPERTY NAME="workRecordId">${escapeXml(record.id)}</PROPERTY>
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
    filename: `${record.id}.eaf`,
    losses: exportLosses("eaf"),
  };
}

/** OSC cue map JSON for show-control federation (not a runtime). */
function projectOscCueMap(record: WorkRecord): ExportResult {
  const doc = {
    schemaVersion: "0.2.0",
    kind: "practice-relay-osc-cue-map",
    workRecordId: record.id,
    title: record.title,
    cues: buildOscMessages(record, { mode: "legacy-cue-map" }),
  };

  return {
    format: "osc-cue-map",
    contentType: "application/json",
    body: JSON.stringify(doc, null, 2),
    filename: `${record.id}.osc-cues.json`,
    losses: exportLosses("osc-cue-map"),
  };
}

/** MusicXML/MEI ref binding (does not re-encode notation). */
function projectMusicxmlRef(record: WorkRecord): ExportResult {
  const music = record.tracks.filter((t) => t.type === "music_notation");
  const doc = {
    schemaVersion: "0.2.0",
    kind: "practice-relay-music-ref",
    workRecordId: record.id,
    title: record.title,
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
    filename: `${record.id}.music-refs.json`,
    losses: exportLosses("musicxml-ref"),
  };
}

/**
 * Export a complete canonical WorkRecord to a supported interchange format.
 *
 * The projection boundary is deliberately not a best-effort partial-record
 * serializer: the supplied document must pass canonical validation and the
 * same whole-record release policy used by handoff packages before any
 * target-format body is built.
 */
export function exportRecord(
  record: WorkRecord,
  format: ExportFormat,
): ExportResult {
  const canonical = parseWorkRecord(record);
  assertExportApproved(canonical, { mode: "record-release" });
  switch (format) {
    case "otio-json":
      return projectOtioJson(canonical);
    case "eaf":
      return projectEaf(canonical);
    case "osc-cue-map":
      return projectOscCueMap(canonical);
    case "musicxml-ref":
      return projectMusicxmlRef(canonical);
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
  type OscProjectionOptions,
  type OscUdpPayload,
  type OssianHint,
  type MaxDictPatch,
} from "./osc-bridge.js";

/**
 * OSC deep-link projection: multi-asset document cues, not a show-control runtime.
 * Address scheme: /practice-relay/{recordId}/region | /track | /preferred_take
 */
export function buildOscDeepLinkProjection(record: WorkRecord): {
  kind: "practice-relay-osc-deep-link";
  schemaVersion: "0.4.0";
  note: string;
  endpoints: Array<{ address: string; description: string }>;
  cues: OscMessage[];
} {
  const canonical = parseWorkRecord(record);
  assertExportApproved(canonical, { mode: "record-release" });
  return {
    kind: "practice-relay-osc-deep-link",
    schemaVersion: "0.4.0",
    note:
      "WorkRecord OSC projection for federation with ossia, Max, or QLab. Practice Relay is not the runtime.",
    endpoints: [
      {
        address: `/practice-relay/${canonical.id}/region`,
        description: "Fire region marker by id",
      },
      {
        address: `/practice-relay/${canonical.id}/track`,
        description: "Announce track presence (media_cues/control)",
      },
      {
        address: `/practice-relay/${canonical.id}/preferred_take`,
        description: "Preferred take id for critique",
      },
    ],
    cues: buildOscMessages(canonical),
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
