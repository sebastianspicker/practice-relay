/**
 * WorkRecord role permissions and comment-resolution mutations.
 * Why: access policy stays pure and portable across application boundaries.
 */
import { WorkRecordRoleDeniedError } from "./errors.ts";
import { ROLES, type Role, type WorkRecord } from "./types.ts";

/** Mutations that can be gated by record membership role. */
export type RecordMutation =
  | "edit_record" | "edit_members" | "invite_faculty" | "add_track" | "add_take"
  | "set_preferred_take" | "add_region" | "add_comment" | "resolve_comment"
  | "attach_use_policy" | "submit" | "export" | "import" | "lti" | "share"
  | "analysis" | "attach_mvei" | "admin"
  | "add_subject" | "add_artifact" | "add_annotation" | "manage_policy"
  | "create_snapshot";

const ALL_MUTATIONS: RecordMutation[] = [
  "edit_record", "edit_members", "invite_faculty", "add_track", "add_take", "set_preferred_take",
  "add_region", "add_comment", "resolve_comment", "attach_use_policy", "submit",
  "export", "import", "lti", "share", "analysis", "attach_mvei", "admin",
  "add_subject", "add_artifact", "add_annotation", "manage_policy", "create_snapshot",
];

/** Role-to-mutation policy shared by every WorkRecord boundary. */
export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<RecordMutation>> = {
  admin: new Set(ALL_MUTATIONS),
  faculty: new Set(ALL_MUTATIONS.filter((mutation) => mutation !== "admin")),
  student: new Set<RecordMutation>([
    "invite_faculty", "add_take", "set_preferred_take", "add_comment", "resolve_comment",
    "attach_use_policy", "export", "share", "attach_mvei", "add_subject",
    "add_artifact", "add_annotation", "create_snapshot", "submit",
  ]),
  guest: new Set<RecordMutation>(),
};

/** Narrows a value to the closed membership-role vocabulary. */
export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Resolves a record member's role. */
export function roleOf(record: WorkRecord, userId: string): Role | undefined {
  return record.members.find((member) => member.userId === userId)?.role;
}

/** Determines whether an actor may perform a record mutation. */
export function canMutate(record: WorkRecord, actorUserId: string | undefined | null, mutation: RecordMutation): boolean {
  // Membership is the sole authorization source. Actors describe provenance only.
  if (!actorUserId || !Array.isArray(record.members) || record.members.length === 0) return false;
  const role = roleOf(record, actorUserId);
  return isRole(role) && ROLE_PERMISSIONS[role].has(mutation);
}

/** Throws when an actor lacks permission for a record mutation. */
export function assertCanMutate(record: WorkRecord, actorUserId: string | undefined | null, mutation: RecordMutation): void {
  if (!canMutate(record, actorUserId, mutation)) {
    throw new WorkRecordRoleDeniedError(`role denied: ${mutation} requires sufficient role (student cannot admin)`);
  }
}

/** Marks one region comment resolved without mutating the source record. */
export function resolveComment(record: WorkRecord, commentId: string): WorkRecord {
  if (!record.comments.some((comment) => comment.id === commentId)) {
    throw new Error(`comment not found: ${commentId}`);
  }
  return { ...record, comments: record.comments.map((comment) => comment.id === commentId ? { ...comment, resolved: true } : comment) };
}
