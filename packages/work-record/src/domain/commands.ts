/** Typed, pure lifecycle transitions for WorkRecord aggregate mutations. */
import { resolveComment, type RecordMutation } from "./access.ts";
import { addAnalysisTrack, attachMveiMotifTrack, attachMusicNotationTrack } from "./movement.ts";
import { addComment, addMember, addRegion, addTake, addTrack, setPreferredTake, submitVersion } from "./record-mutations.ts";
import type {
  Artifact,
  Comment,
  Member,
  Region,
  RepresentedSubject,
  Snapshot,
  Track,
  WorkAnnotation,
  WorkRecord,
} from "./types.ts";
import type { UsePolicy } from "../policy/types.ts";
import {
  addAnnotation,
  addArtifact,
  addRepresentedSubject,
  addUsePolicy,
  addSnapshot,
  renameRecord,
} from "./evidence.ts";
import type { Take } from "../media/take.ts";
import { attachUsePolicySnapshot } from "../policy/use-policy.ts";
import type { UsePolicySnapshot } from "../policy/types.ts";

/** Closed set of supported aggregate lifecycle transitions. */
export type WorkRecordCommand =
  | { type: "add-track"; track: Track }
  | { type: "add-analysis-track"; track: Track }
  | { type: "attach-mvei-motif-track"; track: { id: string; ref: string; label?: string } }
  | { type: "attach-music-notation-track"; track: { id: string; ref: string; label?: string } }
  | { type: "add-take"; take: Take }
  | { type: "set-preferred-take"; takeId: string }
  | { type: "add-region"; region: Region }
  | { type: "add-comment"; comment: Omit<Comment, "id" | "createdAt"> & { id?: string; createdAt?: string } }
  | { type: "resolve-comment"; commentId: string }
  | { type: "add-member"; member: Member }
  | { type: "attach-use-policy-snapshot"; policy: UsePolicySnapshot }
  | { type: "submit-version"; name: string; createdAt?: string }
  | { type: "add-subject"; subject: RepresentedSubject }
  | { type: "add-artifact"; artifact: Artifact }
  | { type: "add-annotation"; annotation: WorkAnnotation }
  | { type: "add-use-policy"; policy: UsePolicy }
  | { type: "add-snapshot"; snapshot: Snapshot }
  | { type: "rename-record"; title: string };

/** Record mutation permission each lifecycle command requires of its actor. */
export const COMMAND_PERMISSIONS: Readonly<Record<WorkRecordCommand["type"], RecordMutation>> = {
  "add-track": "add_track", "add-analysis-track": "analysis",
  "attach-mvei-motif-track": "attach_mvei", "attach-music-notation-track": "add_track",
  "add-take": "add_take", "set-preferred-take": "set_preferred_take",
  "add-region": "add_region", "add-comment": "add_comment", "resolve-comment": "resolve_comment",
  "add-member": "edit_members", "attach-use-policy-snapshot": "attach_use_policy",
  "submit-version": "submit", "add-subject": "add_subject", "add-artifact": "add_artifact",
  "add-annotation": "add_annotation", "add-use-policy": "manage_policy", "add-snapshot": "create_snapshot",
  "rename-record": "edit_record",
};

/** Resolves the record mutation permission a lifecycle command requires. */
export function requiredPermission(command: WorkRecordCommand): RecordMutation {
  return COMMAND_PERMISSIONS[command.type];
}

/** Applies one lifecycle command without mutating the supplied record. */
export function transitionWorkRecord(record: WorkRecord, command: WorkRecordCommand): WorkRecord {
  switch (command.type) {
    case "add-track": return addTrack(record, command.track);
    case "add-analysis-track": return addAnalysisTrack(record, command.track);
    case "attach-mvei-motif-track": return attachMveiMotifTrack(record, command.track);
    case "attach-music-notation-track": return attachMusicNotationTrack(record, command.track);
    case "add-take": return addTake(record, command.take);
    case "set-preferred-take": return setPreferredTake(record, command.takeId);
    case "add-region": return addRegion(record, command.region);
    case "add-comment": return addComment(record, command.comment);
    case "resolve-comment": return resolveComment(record, command.commentId);
    case "add-member": return addMember(record, command.member);
    case "attach-use-policy-snapshot": return attachUsePolicySnapshot(record, command.policy);
    case "submit-version": return submitVersion(record, command.name, command.createdAt);
    case "add-subject": return addRepresentedSubject(record, command.subject);
    case "add-artifact": return addArtifact(record, command.artifact);
    case "add-annotation": return addAnnotation(record, command.annotation);
    case "add-use-policy": return addUsePolicy(record, command.policy);
    case "add-snapshot": return addSnapshot(record, command.snapshot);
    case "rename-record": return renameRecord(record, command.title);
    default: return assertNever(command);
  }
}

function assertNever(command: never): never {
  throw new Error(`unsupported WorkRecord command: ${JSON.stringify(command)}`);
}
