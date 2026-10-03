/** Stable domain error codes, role vocabulary, and command permission contracts. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addMember,
  addRepresentedSubject,
  addTrack,
  assertCanMutate,
  attachUsePolicySnapshot,
  COMMAND_PERMISSIONS,
  createEmptyRecord,
  isRole,
  isWorkRecordDuplicate,
  isWorkRecordRoleDenied,
  requiredPermission,
  ROLES,
  WORK_RECORD_DUPLICATE,
  WORK_RECORD_ROLE_DENIED,
  WorkRecordDuplicateError,
  WorkRecordRoleDeniedError,
  type WorkRecordCommand,
  asWorkRecordValidation,
  assertExportApproved,
  isWorkRecordInvalid,
  isWorkRecordPolicyDenied,
  WORK_RECORD_POLICY_DENIED,
} from "../src/index.ts";

test("the role vocabulary is closed and drives role validation", () => {
  assert.deepEqual([...ROLES], ["student", "faculty", "admin", "guest"]);
  for (const role of ROLES) {
    assert.equal(isRole(role), true);
    assert.equal(addMember(createEmptyRecord(`roles-${role}`, "Roles"), { userId: "u", role }).members[0]?.role, role);
  }
  for (const malformed of ["__proto__", "constructor", "owner", "", "Admin", null, undefined, 1]) {
    assert.equal(isRole(malformed), false);
  }
  assert.throws(
    () => addMember(createEmptyRecord("roles-bad", "Roles"), { userId: "u", role: "owner" as never }),
    /role must be a supported record role/,
  );
});

test("every lifecycle command declares its required permission", () => {
  const expected: Record<WorkRecordCommand["type"], string> = {
    "add-track": "add_track", "add-analysis-track": "analysis",
    "attach-mvei-motif-track": "attach_mvei", "attach-music-notation-track": "add_track",
    "add-take": "add_take", "set-preferred-take": "set_preferred_take",
    "add-region": "add_region", "add-comment": "add_comment", "resolve-comment": "resolve_comment",
    "add-member": "edit_members", "attach-use-policy-snapshot": "attach_use_policy",
    "submit-version": "submit", "add-subject": "add_subject", "add-artifact": "add_artifact",
    "add-annotation": "add_annotation", "add-use-policy": "manage_policy", "add-snapshot": "create_snapshot",
    "rename-record": "edit_record",
  };
  assert.deepEqual({ ...COMMAND_PERMISSIONS }, expected);
  assert.equal(requiredPermission({ type: "rename-record", title: "Renamed" }), "edit_record");
  assert.equal(requiredPermission({ type: "submit-version", name: "v1" }), "submit");
});

test("role denials carry a stable code and their original message", () => {
  const record = addMember(createEmptyRecord("errors-role", "Errors"), { userId: "stu", role: "student" });
  assert.throws(() => assertCanMutate(record, "stu", "edit_members"), (err: unknown) => {
    assert.ok(err instanceof WorkRecordRoleDeniedError);
    assert.equal(err.code, WORK_RECORD_ROLE_DENIED);
    assert.equal(err.message, "role denied: edit_members requires sufficient role (student cannot admin)");
    return true;
  });
  assert.equal(isWorkRecordRoleDenied(new WorkRecordRoleDeniedError("role denied: x")), true);
  assert.equal(isWorkRecordRoleDenied(Object.assign(new Error("copied"), { code: WORK_RECORD_ROLE_DENIED })), true);
  assert.equal(isWorkRecordRoleDenied(new Error("role denied: message text alone")), false);
  assert.equal(isWorkRecordRoleDenied({ code: WORK_RECORD_ROLE_DENIED, message: "not an Error" }), false);
  assert.equal(isWorkRecordDuplicate(new WorkRecordRoleDeniedError("role denied: x")), false);
});

test("duplicate identities carry a stable code and their original message", () => {
  const record = addTrack(createEmptyRecord("errors-duplicate", "Errors"), { id: "t1", type: "video" });
  const duplicates: Array<[() => unknown, string]> = [
    [() => addTrack(record, { id: "t1", type: "video" }), "track id already exists: t1"],
    [() => {
      const subject = { id: "s1", type: "Person" as const, label: "Subject" };
      return addRepresentedSubject(addRepresentedSubject(record, subject), subject);
    }, "subject id already exists: s1"],
    [() => {
      const policy = { id: "p1", subjectId: "stu", purposes: ["teaching"], createdAt: "2026-01-01T00:00:00.000Z" };
      return attachUsePolicySnapshot(attachUsePolicySnapshot(record, policy), policy);
    }, "use policy id already exists: p1"],
  ];
  for (const [run, message] of duplicates) {
    assert.throws(run, (err: unknown) => {
      assert.ok(err instanceof WorkRecordDuplicateError);
      assert.equal(err.code, WORK_RECORD_DUPLICATE);
      assert.equal(err.message, message);
      assert.equal(isWorkRecordDuplicate(err), true);
      assert.equal(isWorkRecordRoleDenied(err), false);
      return true;
    });
  }
  assert.equal(isWorkRecordDuplicate(new Error("record x already exists")), false);
});

test("asWorkRecordValidation classifies domain rule failures and passes defects through", () => {
  for (const rule of [new Error("track type must be supported"), new RangeError("durationMs must be a finite non-negative number")]) {
    assert.throws(() => asWorkRecordValidation(() => { throw rule; }), (err: unknown) => {
      assert.ok(isWorkRecordInvalid(err));
      assert.equal(err.message, rule.message);
      assert.equal(err.cause, rule);
      return true;
    });
  }
  const defect = new TypeError("cannot read properties of undefined");
  assert.throws(() => asWorkRecordValidation(() => { throw defect; }), (err: unknown) => err === defect);
  const coded = Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" });
  assert.throws(() => asWorkRecordValidation(() => { throw coded; }), (err: unknown) => err === coded);
  assert.throws(() => asWorkRecordValidation(() => { throw "plain string"; }), (err: unknown) => err === "plain string");
  assert.equal(asWorkRecordValidation(() => 7), 7);
});

test("release denials carry the stable policy-denied code", () => {
  assert.throws(() => assertExportApproved(createEmptyRecord("unreleased", "Unreleased"), { mode: "record-release" }), (err: unknown) => {
    assert.ok(isWorkRecordPolicyDenied(err));
    assert.equal((err as { code: string }).code, WORK_RECORD_POLICY_DENIED);
    assert.match(err.message, /^export denied: /u);
    return true;
  });
});
