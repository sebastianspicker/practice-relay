/** Focused direct-route coverage for authentication and current-user endpoints. */
import assert from "node:assert/strict";
import type { ServerResponse } from "node:http";
import { test } from "node:test";
import { AuthenticationBusyError, createAuthService } from "@practice-relay/auth";
import { createMemoryRecordStore } from "@practice-relay/record-store";
import { createRequestContext } from "./request-context.ts";
import { handleAuthRoutes } from "./routes-auth.ts";
import { createApiRuntime, type ApiRuntime } from "./runtime.ts";
import { mockReq, mockRes } from "./test-support/http-mocks.ts";

type SocketShape = { socket?: { remoteAddress?: string } };
type RequestOptions = {
  body?: unknown;
  headers?: Record<string, string>;
  socket?: { remoteAddress?: string } | null;
};

function authRuntime(): ApiRuntime {
  return createApiRuntime({
    auth: createAuthService("routes-auth-test-secret"),
    recordStore: createMemoryRecordStore(),
  });
}

function emptyActorRuntime(): ApiRuntime {
  const auth = createAuthService("routes-auth-empty-actor-test-secret");
  return createApiRuntime({
    auth: {
      ...auth,
      verify: () => ({
        token: "empty-actor-token",
        userId: "",
        displayName: "Empty Actor",
        defaultRole: "student",
        expiresAt: "2099-01-01T00:00:00.000Z",
      }),
    },
    recordStore: createMemoryRecordStore(),
  });
}

async function request(
  runtime: ApiRuntime,
  pathname: string,
  method: string,
  options: RequestOptions = {},
) {
  const req = mockReq(pathname, method, options.body, options.headers);
  if (options.socket !== null) {
    (req as unknown as SocketShape).socket = options.socket;
  }
  const response = mockRes();
  const result = await handleAuthRoutes(createRequestContext(
    runtime,
    req,
    response as unknown as ServerResponse,
  ));
  return { response, result };
}

function detail(response: Awaited<ReturnType<typeof mockRes>>): string {
  return (JSON.parse(response.body) as { detail: string }).detail;
}

async function bearer(runtime: ApiRuntime, userId: string, password: string): Promise<string> {
  const session = (await runtime.auth.login(userId, password));
  assert.ok(session);
  return `Bearer ${session.token}`;
}

test("login source preserves missing, undefined, empty, and populated addresses", async () => {
  for (const [socket, source] of [
    [null, "unknown"],
    [{ remoteAddress: undefined }, "unknown"],
    [{ remoteAddress: "" }, ""],
    [{ remoteAddress: "198.51.100.42" }, "198.51.100.42"],
  ] as const) {
    const runtime = authRuntime();
    const { response, result } = await request(
      runtime,
      "/auth/login",
      "POST",
      { body: { userId: "missing-user", password: "incorrect" }, socket },
    );
    assert.equal(result, "handled");
    assert.equal(response.statusCode, 401);
    const attempt = await runtime.coordination.beginLogin({ account: "different-user", source, sourceLimit: 1 });
    assert.equal(attempt, undefined);
  }
});

test("login rejects invalid credentials, returns sessions, and clears account limits", async () => {
  const runtime = authRuntime();
  const source = { remoteAddress: "cleanup-source" };
  const invalid = await request(
    runtime,
    "/auth/login",
    "POST",
    { body: { userId: "teacher-1", password: "incorrect" }, socket: source },
  );
  assert.equal(invalid.response.statusCode, 401);
  assert.equal(detail(invalid.response), "invalid credentials");

  const valid = await request(
    runtime,
    "/auth/login",
    "POST",
    { body: { userId: "teacher-1", password: "teach" }, socket: source },
  );
  assert.equal(valid.response.statusCode, 200);
  assert.equal((JSON.parse(valid.response.body) as { userId: string }).userId, "teacher-1");
  assert.equal(await runtime.coordination.beginLogin({ account: "different-user", source: "cleanup-source", sourceLimit: 1 }), undefined);

  for (let index = 0; index < 5; index += 1) {
    const failed = await request(
      runtime,
      "/auth/login",
      "POST",
      { body: { userId: "teacher-1", password: "incorrect" }, socket: source },
    );
    assert.equal(failed.response.statusCode, 401);
  }
});

test("login applies account and source rate limits independently", async () => {
  const accountRuntime = authRuntime();
  for (let index = 0; index < 5; index += 1) {
    assert.equal((await request(
      accountRuntime,
      "/auth/login",
      "POST",
      { body: { userId: "account-limit", password: "incorrect" } },
    )).response.statusCode, 401);
  }
  const accountLimited = await request(
    accountRuntime,
    "/auth/login",
    "POST",
    { body: { userId: "account-limit", password: "incorrect" } },
  );
  assert.equal(accountLimited.response.statusCode, 429);
  assert.equal(detail(accountLimited.response), "login temporarily rate limited");

  const sourceRuntime = authRuntime();
  const source = { remoteAddress: "source-limit" };
  for (let index = 0; index < 100; index += 1) {
    assert.equal((await request(
      sourceRuntime,
      "/auth/login",
      "POST",
      {
        body: { userId: `source-user-${index}`, password: "incorrect" },
        socket: source,
      },
    )).response.statusCode, 401);
  }
  const sourceLimited = await request(
    sourceRuntime,
    "/auth/login",
    "POST",
    {
      body: { userId: "source-user-next", password: "incorrect" },
      socket: source,
    },
  );
  assert.equal(sourceLimited.response.statusCode, 429);
  assert.equal(detail(sourceLimited.response), "login temporarily rate limited");
});

test("users rejects invalid actors and permits only faculty or admin", async () => {
  const runtime = authRuntime();
  for (const authorization of [undefined, "invalid", ""] as const) {
    const response = await request(
      runtime,
      "/auth/users",
      "GET",
      authorization === undefined ? {} : { headers: { authorization } },
    );
    assert.equal(response.response.statusCode, 401);
    assert.equal(detail(response.response), "valid bearer session required");
  }
  const emptyActor = await request(emptyActorRuntime(), "/auth/users", "GET", {
    headers: { authorization: "injected-empty-actor" },
  });
  assert.equal(emptyActor.response.statusCode, 401);
  assert.equal(detail(emptyActor.response), "valid bearer session required");
  for (const [userId, password] of [
    ["student-1", "learn"],
    ["examiner-1", "jury"],
  ] as const) {
    const response = await request(runtime, "/auth/users", "GET", {
      headers: { authorization: (await bearer(runtime, userId, password)) },
    });
    assert.equal(response.response.statusCode, 403);
    assert.equal(detail(response.response), "faculty or operations role required");
  }
  for (const [userId, password] of [
    ["teacher-1", "teach"],
    ["ops-1", "ops"],
  ] as const) {
    const response = await request(runtime, "/auth/users", "GET", {
      headers: { authorization: (await bearer(runtime, userId, password)) },
    });
    assert.equal(response.response.statusCode, 200);
    assert.equal(JSON.parse(response.response.body).length, 4);
  }
});

test("current user rejects invalid actors and projects a valid identity", async () => {
  const runtime = authRuntime();
  for (const authorization of [undefined, "invalid", ""] as const) {
    const response = await request(
      runtime,
      "/me",
      "GET",
      authorization === undefined ? {} : { headers: { authorization } },
    );
    assert.equal(response.response.statusCode, 401);
    assert.equal(detail(response.response), "login required");
  }
  const emptyActor = await request(emptyActorRuntime(), "/me", "GET", {
    headers: { authorization: "injected-empty-actor" },
  });
  assert.equal(emptyActor.response.statusCode, 401);
  assert.equal(detail(emptyActor.response), "login required");
  const response = await request(runtime, "/me", "GET", {
    headers: { authorization: (await bearer(runtime, "teacher-1", "teach")) },
  });
  assert.equal(response.response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.response.body), {
    userId: "teacher-1",
    displayName: "Faculty Demo",
    defaultRole: "faculty",
  });
});

test("auth route leaves unrecognized method and path combinations unmatched", async () => {
  const runtime = authRuntime();
  for (const [pathname, method] of [
    ["/auth/login", "GET"],
    ["/auth/users", "POST"],
    ["/me", "POST"],
    ["/unknown", "GET"],
  ] as const) {
    const response = await request(runtime, pathname, method);
    assert.equal(response.result, "unmatched");
    assert.equal(response.response.statusCode, 0);
    assert.equal(response.response.body, "");
  }
});

test("parallel login requests include in-flight attempts in the account limit", async () => {
  const runtime = authRuntime();
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  let started = 0;
  runtime.auth.login = async () => { started += 1; await blocked; return null; };
  const pending = Array.from({ length: 20 }, (_, index) => request(runtime, "/auth/login", "POST", {
    body: { userId: "shared-account", password: "incorrect" }, socket: { remoteAddress: `source-${index}` },
  }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(started, 5);
  release();
  const results = await Promise.all(pending);
  assert.equal(results.filter((result) => result.response.statusCode === 401).length, 5);
  assert.equal(results.filter((result) => result.response.statusCode === 429).length, 15);
});


test("authentication backpressure releases admission without charging a failure", async () => {
  const runtime = authRuntime();
  runtime.auth.login = async () => { throw new AuthenticationBusyError(); };
  for (let index = 0; index < 7; index += 1) {
    const result = await request(runtime, "/auth/login", "POST", { body: { userId: "busy-user", password: "anything" } });
    assert.equal(result.response.statusCode, 429);
    assert.equal(detail(result.response), "authentication capacity exhausted");
  }
  runtime.auth.login = async () => null;
  assert.equal((await request(runtime, "/auth/login", "POST", { body: { userId: "busy-user", password: "wrong" } })).response.statusCode, 401);
});

test("malformed and overlong login IDs do not alias valid account admission", async () => {
  const runtime = authRuntime();
  const supplied: string[] = [];
  runtime.auth.login = async (userId) => { supplied.push(userId); return null; };
  const valid = "a".repeat(128);
  for (const userId of [valid + "suffix", "control\u0000id", "Ｆａｃｕｌｔｙ"]) {
    for (let index = 0; index < 5; index += 1) {
      assert.equal((await request(runtime, "/auth/login", "POST", { body: { userId, password: "wrong" } })).response.statusCode, 401);
    }
  }
  assert.ok(supplied.includes(valid + "suffix"), "full identifier reaches equivalent unknown-user verification");
  assert.equal((await request(runtime, "/auth/login", "POST", { body: { userId: valid, password: "wrong" } })).response.statusCode, 401);
});
