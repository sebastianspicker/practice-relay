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

const configuredUser = {
  userId: "faculty-ada",
  displayName: "Ada Faculty",
  defaultRole: "faculty" as const,
  password: "configured-password",
};

function configuredUsersJson(users = [configuredUser]): string {
  return JSON.stringify(users);
}

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
        PRACTICE_RELAY_AUTH_USERS_JSON: configuredUsersJson(),
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

  it("preserves seed fallback identity and strict blank rejection", () => {
    for (const raw of [undefined, "", " \t\n "]) {
      const env = { PRACTICE_RELAY_AUTH_USERS_JSON: raw } as NodeJS.ProcessEnv;
      assert.equal(loadConfiguredAuthUsers({ env }), SEED_USERS);
      assert.throws(
        () => loadConfiguredAuthUsers({ env, requireConfigured: true }),
        { message: "configured auth users are required" },
      );
    }
  });

  it("uses file precedence while eagerly reading both trimmed source getters", () => {
    const root = mkdtempSync(path.join(tmpdir(), "practice-relay-auth-users-"));
    const file = path.join(root, "users.json");
    const trace: string[] = [];
    writeFileSync(file, configuredUsersJson([{ ...configuredUser, userId: "file-user" }]));
    const env = {} as NodeJS.ProcessEnv;
    Object.defineProperties(env, {
      PRACTICE_RELAY_AUTH_USERS_FILE: {
        get: () => {
          trace.push("file");
          return ` ${file} `;
        },
      },
      PRACTICE_RELAY_AUTH_USERS_JSON: {
        get: () => {
          trace.push("json");
          return "not valid json";
        },
      },
    });
    try {
      assert.equal(loadConfiguredAuthUsers({ env }).at(0)?.userId, "file-user");
      assert.deepEqual(trace, ["file", "json"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reads configured files freshly on every load", () => {
    const root = mkdtempSync(path.join(tmpdir(), "practice-relay-auth-users-"));
    const file = path.join(root, "users.json");
    const env = { PRACTICE_RELAY_AUTH_USERS_FILE: file } as NodeJS.ProcessEnv;
    try {
      writeFileSync(file, configuredUsersJson([{ ...configuredUser, userId: "first-file-user" }]));
      assert.equal(loadConfiguredAuthUsers({ env }).at(0)?.userId, "first-file-user");
      writeFileSync(file, configuredUsersJson([{ ...configuredUser, userId: "second-file-user" }]));
      assert.equal(loadConfiguredAuthUsers({ env }).at(0)?.userId, "second-file-user");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reads options and strict configuration in the required eager order", () => {
    const trace: string[] = [];
    let strictValue = "0";
    const env = {} as NodeJS.ProcessEnv;
    Object.defineProperties(env, {
      PRACTICE_RELAY_REQUIRE_CONFIGURED_AUTH_USERS: {
        get: () => {
          trace.push("strict");
          return strictValue;
        },
      },
      PRACTICE_RELAY_AUTH_USERS_FILE: {
        get: () => {
          trace.push("file");
          return undefined;
        },
      },
      PRACTICE_RELAY_AUTH_USERS_JSON: {
        get: () => {
          trace.push("json");
          return undefined;
        },
      },
    });
    const options = {
      get env() {
        trace.push("env");
        return env;
      },
      get requireConfigured() {
        trace.push("option");
        return undefined;
      },
    };
    assert.equal(loadConfiguredAuthUsers(options), SEED_USERS);
    assert.deepEqual(trace, ["env", "option", "strict", "file", "json"]);

    trace.length = 0;
    assert.equal(loadConfiguredAuthUsers({ env, requireConfigured: false }), SEED_USERS);
    assert.deepEqual(trace, ["file", "json"]);

    trace.length = 0;
    strictValue = "1";
    assert.throws(
      () => loadConfiguredAuthUsers({ env, requireConfigured: null as never }),
      { message: "configured auth users are required" },
    );
    assert.deepEqual(trace, ["strict", "file", "json"]);
  });

  it("propagates hostile environment getters unchanged", () => {
    const hostile = new RangeError("hostile getter");
    const env = {} as NodeJS.ProcessEnv;
    Object.defineProperty(env, "PRACTICE_RELAY_AUTH_USERS_JSON", {
      get: () => {
        throw hostile;
      },
    });
    assert.throws(
      () => loadConfiguredAuthUsers({ env }),
      (error: unknown) => error === hostile,
    );
  });

  it("propagates strict and option getter failures unchanged", () => {
    const strictFailure = new RangeError("hostile strict getter");
    const strictEnv = {} as NodeJS.ProcessEnv;
    Object.defineProperty(strictEnv, "PRACTICE_RELAY_REQUIRE_CONFIGURED_AUTH_USERS", {
      get: () => {
        throw strictFailure;
      },
    });
    assert.throws(
      () => loadConfiguredAuthUsers({ env: strictEnv }),
      (error: unknown) => error === strictFailure,
    );

    const optionFailure = new RangeError("hostile option getter");
    const options = {
      env: {} as NodeJS.ProcessEnv,
      get requireConfigured(): boolean | undefined {
        throw optionFailure;
      },
    };
    assert.throws(
      () => loadConfiguredAuthUsers(options),
      (error: unknown) => error === optionFailure,
    );
  });

  it("maps only file read failures to the exact file error in both modes", () => {
    const env = {
      PRACTICE_RELAY_AUTH_USERS_FILE: "/definitely/not/a/practice-relay-auth-file.json",
    } as NodeJS.ProcessEnv;
    for (const requireConfigured of [false, true]) {
      assert.throws(
        () => loadConfiguredAuthUsers({ env, requireConfigured }),
        { message: "configured auth users file could not be read" },
      );
    }
  });

  it("preserves non-strict parse errors and wraps strict parse errors", () => {
    const malformed = {
      PRACTICE_RELAY_AUTH_USERS_JSON: "{",
    } as NodeJS.ProcessEnv;
    assert.throws(() => loadConfiguredAuthUsers({ env: malformed }), SyntaxError);

    const original = new RangeError("configured parse failure");
    const parse = JSON.parse;
    JSON.parse = () => {
      throw original;
    };
    try {
      assert.throws(
        () => loadConfiguredAuthUsers({ env: malformed }),
        (error: unknown) => error === original,
      );
      assert.throws(
        () => loadConfiguredAuthUsers({ env: malformed, requireConfigured: true }),
        { message: "configured auth users rejected: configured parse failure" },
      );
    } finally {
      JSON.parse = parse;
    }

    JSON.parse = () => {
      throw "non-error configured parse failure";
    };
    try {
      assert.throws(
        () => loadConfiguredAuthUsers({ env: malformed, requireConfigured: true }),
        { message: "configured auth users rejected" },
      );
    } finally {
      JSON.parse = parse;
    }
  });

  it("validates configured user faults in ordered classes and keeps two-fault precedence", () => {
    const rejection = (users: unknown) =>
      () =>
        loadConfiguredAuthUsers({
          env: { PRACTICE_RELAY_AUTH_USERS_JSON: JSON.stringify(users) } as NodeJS.ProcessEnv,
          requireConfigured: true,
        });
    const valid = { ...configuredUser };
    const cases: Array<[unknown, string]> = [
      [
        { ...valid, userId: "!bad", displayName: "", defaultRole: "other", password: "short" },
        "configured auth userId must be a safe unique identifier",
      ],
      [
        { ...valid, displayName: "", defaultRole: "other", password: "short" },
        "configured auth displayName must be non-empty",
      ],
      [
        { ...valid, defaultRole: "other", password: "short" },
        "configured auth defaultRole is not supported",
      ],
      [
        { ...valid, password: "short" },
        "configured auth password must be at least 12 characters and non-placeholder",
      ],
    ];
    for (const [users, message] of cases) {
      assert.throws(rejection([users]), { message: `configured auth users rejected: ${message}` });
    }
    assert.throws(
      rejection([valid, { ...valid, displayName: "Different" }]),
      { message: "configured auth users rejected: configured auth userIds must be unique" },
    );
    assert.throws(
      rejection([{ ...valid, userId: "!bad" }, { ...valid, displayName: "" }]),
      { message: "configured auth users rejected: configured auth userId must be a safe unique identifier" },
    );
  });

  it("uses explicit users, including an empty list, without loading configured users", () => {
    const original = process.env.PRACTICE_RELAY_AUTH_USERS_JSON;
    const originalStrict = process.env.PRACTICE_RELAY_REQUIRE_CONFIGURED_AUTH_USERS;
    process.env.PRACTICE_RELAY_AUTH_USERS_JSON = "{";
    process.env.PRACTICE_RELAY_REQUIRE_CONFIGURED_AUTH_USERS = "1";
    try {
      const auth = createAuthService("test-secret", [configuredUser]);
      assert.equal(auth.login("faculty-ada", "configured-password")?.userId, "faculty-ada");
      assert.deepEqual(createAuthService("test-secret", []).listUsers(), []);
    } finally {
      if (original === undefined) delete process.env.PRACTICE_RELAY_AUTH_USERS_JSON;
      else process.env.PRACTICE_RELAY_AUTH_USERS_JSON = original;
      if (originalStrict === undefined) delete process.env.PRACTICE_RELAY_REQUIRE_CONFIGURED_AUTH_USERS;
      else process.env.PRACTICE_RELAY_REQUIRE_CONFIGURED_AUTH_USERS = originalStrict;
    }
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
