/**
 * Tests - router.test.ts
 *
 * Why: preserve ordered method fallback, ingress, and response metadata contracts.
 */
import assert from "node:assert/strict";
import type { ServerResponse } from "node:http";
import { describe, it } from "node:test";
import { addMember, createEmptyRecord } from "@practice-relay/work-record";
import { responseMetaOf } from "./api-http.ts";
import { PUBLIC_ROUTE_TEMPLATES } from "./public-routes.ts";
import { handleRequestWithRuntime } from "./router.ts";
import { createApiRuntime, type ApiRuntime } from "./runtime.ts";
import { mockReq, mockRes } from "./test-support/http-mocks.ts";

function routerRuntime(allowedOrigins: readonly string[] = []): ApiRuntime {
  return createApiRuntime({
    ingress: {
      allowedOrigins: new Set(allowedOrigins),
      allowedHosts: new Set(),
    },
  });
}

async function request(
  runtime: ApiRuntime,
  pathname: string,
  method: string,
  options: { headers?: Record<string, string>; body?: unknown } = {},
) {
  const response = mockRes();
  await handleRequestWithRuntime(
    runtime,
    mockReq(pathname, method, options.body, options.headers),
    response as unknown as ServerResponse,
  );
  return response;
}

function methodProblem(status: number): string {
  return JSON.stringify({
    title: "Method Not Allowed",
    status,
    detail: "method not allowed for this resource",
  });
}

function concretePublicPath(template: string): string {
  return template
    .replaceAll("{id}", "record-1")
    .replaceAll("{takeId}", "take-1")
    .replaceAll("{commentId}", "comment-1")
    .replaceAll("{storageKey}", "record-1/media.bin");
}

describe("ordered API router", () => {
  it("dispatches every registered public operation to a handler", async () => {
    const runtime = routerRuntime();
    for (const route of PUBLIC_ROUTE_TEMPLATES) {
      for (const method of route.methods) {
        const pathname = concretePublicPath(route.path);
        const response = await request(runtime, pathname, method, { body: {} });
        assert.notEqual(
          response.body,
          '{"title":"Internal Server Error","status":500,"detail":"registered route has no handler"}',
          `${method} ${pathname} reached the public route fallback`,
        );
      }
    }
  });

  it("returns static route method fallbacks for POST and HEAD metrics requests", async () => {
    const runtime = routerRuntime();
    for (const method of ["POST", "HEAD"] as const) {
      const response = await request(runtime, "/metrics", method, {
        headers: { "x-request-id": `metrics-${method.toLowerCase()}` },
      });

      assert.equal(response.statusCode, 405);
      assert.deepEqual(response.headers, {
        "content-type": "application/problem+json",
        allow: "GET",
        "x-request-id": `metrics-${method.toLowerCase()}`,
      });
      assert.equal(response.body, methodProblem(405));
      assert.equal(
        responseMetaOf(response as unknown as ServerResponse)?.status,
        405,
      );
    }
  });

  it("returns nested route method fallbacks after ordered route dispatch", async () => {
    const runtime = routerRuntime();
    const session = (await runtime.auth.login("teacher-1", "teach"));
    assert.ok(session);
    const response = await request(
      runtime,
      "/work-records/record-1",
      "HEAD",
      { headers: {
        authorization: `Bearer ${session.token}`,
        "x-request-id": "nested-method",
      } },
    );

    assert.equal(response.statusCode, 405);
    assert.deepEqual(response.headers, {
      "content-type": "application/problem+json",
      allow: "GET, PATCH",
      "x-request-id": "nested-method",
    });
    assert.equal(response.body, methodProblem(405));
    assert.equal(
      responseMetaOf(response as unknown as ServerResponse)?.status,
      405,
    );

    const mediaResponse = await request(
      runtime,
      "/media/record-1/key",
      "HEAD",
      { headers: { "x-request-id": "nested-media-method" } },
    );
    assert.equal(mediaResponse.statusCode, 405);
    assert.deepEqual(mediaResponse.headers, {
      "content-type": "application/problem+json",
      allow: "GET",
      "x-request-id": "nested-media-method",
    });
    assert.equal(mediaResponse.body, methodProblem(405));
    assert.equal(
      responseMetaOf(mediaResponse as unknown as ServerResponse)?.status,
      405,
    );
  });

  it("leaves base PATCH to the canonical core route, including members", async () => {
    const runtime = routerRuntime();
    const record = addMember(createEmptyRecord("member-patch", "Members"), {
      userId: "teacher-1",
      role: "faculty",
    });
    (await runtime.recordStore.create(record));
    const session = (await runtime.auth.login("teacher-1", "teach"));
    assert.ok(session);
    const response = await request(runtime, "/work-records/member-patch", "PATCH", {
      headers: { authorization: `Bearer ${session.token}` },
      body: {
        members: [
          { userId: "teacher-1", role: "faculty" },
          { userId: "student-1", role: "student" },
        ],
      },
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual((await runtime.recordStore.get("member-patch"))?.members, [
      { userId: "teacher-1", role: "faculty" },
      { userId: "student-1", role: "student" },
    ]);
  });

  it("does not treat descriptive actor roles as evidence authorization", async () => {
    const runtime = routerRuntime();
    let record = addMember(createEmptyRecord("actor-owner", "Actor owner"), {
      userId: "teacher-1",
      role: "faculty",
    });
    record = {
      ...record,
      actors: [{ id: "student-1", type: "Person", name: "Spoofed owner", roles: ["owner"] }],
    };
    (await runtime.recordStore.create(record));
    const session = (await runtime.auth.login("student-1", "learn"));
    assert.ok(session);
    const response = await request(runtime, "/work-records/actor-owner/artifacts", "POST", {
      headers: { authorization: `Bearer ${session.token}` },
      body: { id: "evidence-1", name: "Forbidden actor owner evidence" },
    });
    assert.equal(response.statusCode, 403);
    assert.deepEqual((await runtime.recordStore.get("actor-owner"))?.artifacts, []);
  });

  it("returns a not-found problem for an unknown path", async () => {
    const response = await request(routerRuntime(), "/unknown-route", "GET", {
      headers: { "x-request-id": "unknown-path" },
    });

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.headers, {
      "content-type": "application/problem+json",
      "x-request-id": "unknown-path",
    });
    assert.equal(
      response.body,
      '{"title":"Not Found","status":404,"detail":"not found"}',
    );
    assert.equal(
      responseMetaOf(response as unknown as ServerResponse)?.status,
      404,
    );
  });

  it("answers accepted-origin OPTIONS before path method fallback", async () => {
    const response = await request(
      routerRuntime(["https://studio.example"]),
      "/unknown-route",
      "OPTIONS",
      { headers: {
        origin: "https://studio.example",
        "x-request-id": "options-accepted",
      } },
    );

    assert.equal(response.statusCode, 204);
    assert.equal(Object.hasOwn(response.headers, "allow"), false);
    assert.deepEqual(response.headers, {
      "access-control-allow-origin": "https://studio.example",
      "access-control-allow-headers": "content-type, authorization, x-request-id, if-match",
      "access-control-allow-methods": "GET,POST,PUT,PATCH,OPTIONS",
      vary: "Origin",
      "x-request-id": "options-accepted",
    });
    assert.equal(response.body, "");
    assert.equal(
      responseMetaOf(response as unknown as ServerResponse)?.status,
      204,
    );
  });

  it("keeps rejected-origin OPTIONS at the ingress boundary", async () => {
    const response = await request(
      routerRuntime(),
      "/unknown-route",
      "OPTIONS",
      { headers: {
        origin: "https://untrusted.example",
        "x-request-id": "options-rejected",
      } },
    );

    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.headers, {
      "content-type": "application/problem+json",
      "x-request-id": "options-rejected",
    });
    assert.equal(
      response.body,
      '{"title":"Request Rejected","status":403,"detail":"untrusted Origin header"}',
    );
    assert.equal(
      responseMetaOf(response as unknown as ServerResponse)?.status,
      403,
    );
  });
});
