/**
 * @practice-relay/collaboration - bounded Yjs collab on WorkRecord document fields.
 *
 * Not a freeform canvas. Stores tracks/regions/comments as JSON arrays in a Y.Map
 * for multi-tab lab use. Enable with COLLAB=1 in the API process.
 */
import * as Y from "yjs";
import type { WorkRecord, Comment, Region, Track } from "@practice-relay/work-record-core";

export const COLLAB_STATUS = "document-yjs" as const;

/** Bounded in-process collaboration overlay for one Practice Relay record. */
export interface RecordCollabRoom {
  doc: Y.Doc;
  applyRecord: (record: WorkRecord) => void;
  toRecordOverlay: () => {
    tracks: Track[];
    regions: Region[];
    comments: Comment[];
  };
  destroy: () => void;
}

/**
 * Create an in-process Y.Doc room for a record id (no network).
 */
export function createRecordCollabRoom(recordId: string): RecordCollabRoom {
  const doc = new Y.Doc();
  const root = doc.getMap("record");
  root.set("recordId", recordId);
  root.set("tracks", [] as Track[]);
  root.set("regions", [] as Region[]);
  root.set("comments", [] as Comment[]);

  return {
    doc,
    applyRecord(record) {
      doc.transact(() => {
        root.set("recordId", record.id);
        root.set("tracks", [...(record.tracks ?? [])]);
        root.set(
          "regions",
          [...(record.spine.regions ?? [])],
        );
        root.set("comments", [...(record.comments ?? [])]);
      });
    },
    toRecordOverlay() {
      return {
        tracks: (root.get("tracks") as Track[]) ?? [],
        regions: (root.get("regions") as Region[]) ?? [],
        comments: (root.get("comments") as Comment[]) ?? [],
      };
    },
    destroy() {
      doc.destroy();
    },
  };
}

/** Feature flag helper. */
export function collabEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.COLLAB === "1" || env.COLLAB === "true";
}
