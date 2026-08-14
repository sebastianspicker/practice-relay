/**
 * WorkRecord role permissions and comment-resolution mutations.
 * Why: access policy stays pure and portable across application boundaries.
 */
import type { Role, WorkRecord } from "./types.ts";

/** Mutations that can be gated by record membership role. */
export type RecordMutation =
  | "edit_record" | "edit_members" | "add_track" | "add_take"
  | "set_preferred_take" | "add_region" | "add_comment" | "resolve_comment"
  | "attach_use_policy" | "submit" | "export" | "import" | "lti" | "share"
  | "analysis" | "attach_mvei" | "admin";

const ALL_MUTATIONS: RecordMutation[] = [
  "edit_record", "edit_members", "add_track", "add_take", "set_preferred_take",
  "add_region", "add_comment", "resolve_comment", "attach_use_policy", "submit",
  "export", "import", "lti", "share", "analysis", "attach_mvei", "admin",
];

/** Role-to-mutation policy shared by every WorkRecord boundary. */
export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<RecordMutation>> = {
  admin: new Set(ALL_MUTATIONS),
  faculty: new Set(ALL_MUTATIONS.filter((mutation) => mutation !== "admin")),
  student: new Set<RecordMutation>(["add_take", "set_preferred_take", "add_comment", "resolve_comment", "attach_use_policy", "export", "share", "attach_mvei"]),
  guest: new Set<RecordMutation>(),
};

/** Resolves a record member's role. */
export function roleOf(record: WorkRecord, userId: string): Role | undefined {
  return record.members.find((member) => member.userId === userId)?.role;
}

/** Determines whether an actor may perform a record mutation. */
export function canMutate(record: WorkRecord, actorUserId: string | undefined | null, mutation: RecordMutation): boolean {
  if (!record.members.length) return true;
  if (!actorUserId) return false;
  const role = roleOf(record, actorUserId);
  return role ? ROLE_PERMISSIONS[role].has(mutation) : false;
}

/** Throws when an actor lacks permission for a record mutation. */
export function assertCanMutate(record: WorkRecord, actorUserId: string | undefined | null, mutation: RecordMutation): void {
  if (!canMutate(record, actorUserId, mutation)) {
    throw new Error(`role denied: ${mutation} requires sufficient role (student cannot admin)`);
  }
}

/** Marks one region comment resolved without mutating the source record. */
export function resolveComment(record: WorkRecord, commentId: string): WorkRecord {
  if (!record.comments.some((comment) => comment.id === commentId)) {
    throw new Error(`comment not found: ${commentId}`);
  }
  return { ...record, comments: record.comments.map((comment) => comment.id === commentId ? { ...comment, resolved: true } : comment) };
}
