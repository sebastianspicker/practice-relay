/** Studio role gates must mirror the authoritative WorkRecord role permissions. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { ROLE_PERMISSIONS } from "@practice-relay/work-record";
import { EXPORT_ROLES, POLICY_MANAGER_ROLES } from "../src/studio/role-gates.mjs";

const rolesGranted = (mutation) =>
  Object.entries(ROLE_PERMISSIONS).filter(([, permissions]) => permissions.has(mutation)).map(([role]) => role).sort();

test("studio export controls match roles granted export", () => {
  assert.deepEqual([...EXPORT_ROLES].sort(), rolesGranted("export"));
});

test("studio policy controls match roles granted manage_policy", () => {
  assert.deepEqual([...POLICY_MANAGER_ROLES].sort(), rolesGranted("manage_policy"));
});
