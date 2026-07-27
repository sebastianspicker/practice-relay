/**
 * Tests - auth.test.ts
 *
 * Why: guard shipped behaviour for technical reviewers; drive real modules,
 * not a re-implementation of domain/export/validate logic.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createAuthService,
  loadConfiguredAuthUsers,
  SEED_USERS,
} from "./index.ts";

describe("hub-auth", () => {
  it("login + verify round-trip", () => {
    const auth = createAuthService("test-secret");
    const session = auth.login("teacher-1", "teach");
    assert.ok(session);
    assert.equal(session!.userId, "teacher-1");
    const v = auth.verify(session!.token);
    assert.ok(v);
    assert.equal(v!.userId, "teacher-1");
    assert.equal(auth.verify("Bearer " + session!.token)?.userId, "teacher-1");
  });

  it("rejects bad password and bad token", () => {
    const auth = createAuthService("test-secret");
    assert.equal(auth.login("teacher-1", "wrong"), null);
    assert.equal(auth.verify("not.a.token"), null);
    const valid = auth.login("teacher-1", "teach")!.token;
    assert.equal(auth.verify(`${valid}.extra`), null);
    assert.equal(auth.verify(null), null);
  });

  it("loads validated users from JSON and createAuthService uses them by default", () => {
    const users = loadConfiguredAuthUsers({
      env: {
        PRACTICE_RELAY_AUTH_USERS_JSON: JSON.stringify([
          {
            userId: "faculty-ada",
            displayName: "Ada Faculty",
            defaultRole: "faculty",
            password: "configured-password",
          },
        ]),
      } as NodeJS.ProcessEnv,
    });
    assert.equal(users.length, 1);
    assert.equal(users[0]!.userId, "faculty-ada");

    const original = process.env.PRACTICE_RELAY_AUTH_USERS_JSON;
    process.env.PRACTICE_RELAY_AUTH_USERS_JSON = JSON.stringify(users);
    try {
      const auth = createAuthService("test-secret");
      assert.equal(auth.login("faculty-ada", "configured-password")?.userId, "faculty-ada");
      assert.equal(auth.login("teacher-1", "teach"), null);
    } finally {
      if (original === undefined) delete process.env.PRACTICE_RELAY_AUTH_USERS_JSON;
      else process.env.PRACTICE_RELAY_AUTH_USERS_JSON = original;
    }
  });

  it("file configuration takes precedence and validates without exposing passwords", () => {
    const root = mkdtempSync(path.join(tmpdir(), "practice-relay-auth-users-"));
    const file = path.join(root, "users.json");
    writeFileSync(
      file,
      JSON.stringify([
        {
          userId: "student-grace",
          displayName: "Grace Student",
          defaultRole: "student",
          password: "file-configured-password",
        },
      ]),
    );
    try {
      const users = loadConfiguredAuthUsers({
        env: {
          PRACTICE_RELAY_AUTH_USERS_FILE: file,
          PRACTICE_RELAY_AUTH_USERS_JSON: "not valid json",
        } as NodeJS.ProcessEnv,
        requireConfigured: true,
      });
      assert.equal(users[0]!.userId, "student-grace");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("uses seed users only outside strict configured-user mode", () => {
    assert.equal(
      loadConfiguredAuthUsers({ env: {} as NodeJS.ProcessEnv }),
      SEED_USERS,
    );
    assert.equal(createAuthService("test-secret").login("ops-1", "ops")?.defaultRole, "admin");
    assert.throws(
      () => loadConfiguredAuthUsers({ env: {} as NodeJS.ProcessEnv, requireConfigured: true }),
      /required/i,
    );
  });

  it("rejects malformed, duplicate, and placeholder configured users in strict mode", () => {
    const strict = (value: unknown) =>
      () =>
        loadConfiguredAuthUsers({
          env: { PRACTICE_RELAY_AUTH_USERS_JSON: JSON.stringify(value) } as NodeJS.ProcessEnv,
          requireConfigured: true,
        });
    assert.throws(strict({ users: [] }), /rejected/i);
    assert.throws(strict([]), /rejected/i);
    assert.throws(
      strict([
        {
          userId: "duplicate",
          displayName: "First",
          defaultRole: "faculty",
          password: "valid-password-one",
        },
        {
          userId: "duplicate",
          displayName: "Second",
          defaultRole: "student",
          password: "valid-password-two",
        },
      ]),
      /unique/i,
    );
    assert.throws(
      strict([
        {
          userId: "placeholder",
          displayName: "Placeholder",
          defaultRole: "faculty",
          password: "placeholder",
        },
      ]),
      /password/i,
    );
  });
});
