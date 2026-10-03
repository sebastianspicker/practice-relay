/** Fail-closed WorkRecord membership and capability policy tests. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addMember,
  assertCanMutate,
  canMutate,
  createEmptyRecord,
  type Member,
} from "../src/index.ts";

function withInheritedOwnerPermission(run: () => void): void {
  const ownerDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, "owner");
  Object.defineProperty(Object.prototype, "owner", {
    configurable: true,
    value: new Set(["add_comment"]),
  });
  try {
    run();
  } finally {
    if (ownerDescriptor) {
      Object.defineProperty(Object.prototype, "owner", ownerDescriptor);
    } else {
      Reflect.deleteProperty(Object.prototype, "owner");
    }
  }
}

test("record mutations derive authority only from valid membership roles", () => {
  let record = createEmptyRecord("ps-roles", "Roles");
  record = addMember(record, { userId: "stu", role: "student" });
  record = addMember(record, { userId: "fac", role: "faculty" });
  record = addMember(record, { userId: "adm", role: "admin" });
  record = addMember(record, { userId: "guest", role: "guest" });
  assert.equal(canMutate(record, "stu", "edit_members"), false);
  assert.equal(canMutate(record, "stu", "admin"), false);
  assert.equal(canMutate(record, "stu", "analysis"), false);
  assert.equal(canMutate(record, "stu", "add_comment"), true);
  assert.equal(canMutate(record, "fac", "submit"), true);
  assert.equal(canMutate(record, "adm", "admin"), true);
  assert.equal(canMutate(record, "guest", "add_comment"), false);
  assert.equal(canMutate(record, "missing", "add_comment"), false);
  assert.equal(canMutate(record, undefined, "add_comment"), false);
  assert.equal(
    canMutate(createEmptyRecord("ps-unowned", "Unowned"), undefined, "admin"),
    false,
  );
  assert.throws(
    () => assertCanMutate(record, "stu", "edit_members"),
    /role denied|student cannot admin/i,
  );

  withInheritedOwnerPermission(() => {
    for (const [index, malformedRole] of [
      "__proto__", "constructor", "owner", "", "unknown", null,
    ].entries()) {
      let malformed = createEmptyRecord(`ps-malformed-${index}`, "Roles");
      const member: Member = { userId: "member", role: "student" };
      malformed = addMember(malformed, member);
      assert.equal(Reflect.set(member, "role", malformedRole), true);
      assert.equal(canMutate(malformed, "member", "add_comment"), false);
      assert.throws(
        () => assertCanMutate(malformed, "member", "add_comment"),
        /role denied: add_comment/i,
      );
    }
  });
});

test("evidence capabilities remain membership-only and fail closed", () => {
  let record = createEmptyRecord("ps-evidence-access", "Evidence access");
  record = addMember(record, { userId: "student", role: "student" });
  record = addMember(record, { userId: "faculty", role: "faculty" });
  record = addMember(record, { userId: "admin", role: "admin" });
  record = addMember(record, { userId: "guest", role: "guest" });
  for (const mutation of [
    "add_subject", "add_artifact", "add_annotation", "create_snapshot", "export",
  ] as const) {
    assert.equal(canMutate(record, "student", mutation), true, mutation);
  }
  assert.equal(canMutate(record, "student", "manage_policy"), false);
  for (const mutation of [
    "add_subject", "add_artifact", "add_annotation", "manage_policy", "create_snapshot",
  ] as const) {
    assert.equal(canMutate(record, "faculty", mutation), true, mutation);
    assert.equal(canMutate(record, "admin", mutation), true, mutation);
    assert.equal(canMutate(record, "guest", mutation), false, mutation);
  }
  assert.equal(
    canMutate({ ...record, members: [] }, "student", "add_artifact"),
    false,
  );
});
