/** Characterization tests for the shared API HTTP boundary. */
import assert from "node:assert/strict";
import type {
  IncomingHttpHeaders,
  IncomingMessage,
  ServerResponse,
} from "node:http";
import { test } from "node:test";
import { Readable } from "node:stream";
import {
  InvalidJsonError,
  PayloadTooLargeError,
  corsHeaders,
  drainRequest,
  initializeResponseMeta,
  normalizedMediaContentType,
  pathnameOf,
  queryOf,
  readBody,
  readJson,
  requestIdOf,
  responseMetaOf,
  sendBinary,
  sendJson,
  sendMethodNotAllowed,
  sendProblem,
  validMediaStorageKey,
  validResourceId,
} from "./api-http.ts";
import { mockReq, mockRes } from "./test-support/http-mocks.ts";

function rawRequest(
  chunks: readonly Buffer[],
  headers: IncomingHttpHeaders = {},
): { req: IncomingMessage; resumeCount: () => number } {
  const req = Readable.from(chunks) as unknown as IncomingMessage;
  let resumes = 0;
  const resume = req.resume.bind(req);
  req.resume = () => {
    resumes += 1;
    return resume();
  };
  req.headers = headers;
  req.method = "POST";
  req.url = "/body";
  return { req, resumeCount: () => resumes };
}

function initializedResponse(requestId = "request-42", corsOrigin?: string) {
  const res = mockRes();
  initializeResponseMeta(res as unknown as ServerResponse, requestId, corsOrigin);
  return res;
}

test("request identifiers preserve scalar and first-array values or generate UUIDs", () => {
  const scalar = mockReq("/");
  scalar.headers["x-request-id"] = "  client-request  ";
  assert.equal(requestIdOf(scalar), "client-request");

  const array = mockReq("/");
  array.headers["x-request-id"] = ["  first-request ", "second-request"];
  assert.equal(requestIdOf(array), "first-request");

  for (const header of ["   ", ["", "second-request"], undefined]) {
    const req = mockReq("/");
    if (header !== undefined) req.headers["x-request-id"] = header;
    assert.match(
      requestIdOf(req),
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  }
});

test("CORS headers are exact for allowed and unset origins", () => {
  assert.deepEqual(
    corsHeaders("request-42", "https://studio.example"),
    {
      "access-control-allow-origin": "https://studio.example",
      "access-control-allow-headers": "content-type, authorization, x-request-id",
      "access-control-allow-methods": "GET,POST,PUT,PATCH,OPTIONS",
      vary: "Origin",
      "x-request-id": "request-42",
    },
  );
  assert.deepEqual(corsHeaders("request-42"), { "x-request-id": "request-42" });
  assert.deepEqual(corsHeaders(undefined, "https://studio.example"), {
    "access-control-allow-origin": "https://studio.example",
    "access-control-allow-headers": "content-type, authorization, x-request-id",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,OPTIONS",
    vary: "Origin",
  });
});

test("response writers retain status metadata and exact wire contracts", () => {
  const cors = {
    "access-control-allow-origin": "https://studio.example",
    "access-control-allow-headers": "content-type, authorization, x-request-id",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,OPTIONS",
    vary: "Origin",
  };
  const json = initializedResponse("json-1", "https://studio.example");
  const jsonMeta = responseMetaOf(json as unknown as ServerResponse);
  assert.equal(jsonMeta?.status, 0);
  assert.equal(typeof jsonMeta?.started, "number");
  sendJson(json as unknown as ServerResponse, 201, { created: true });
  assert.equal(json.statusCode, 201);
  assert.deepEqual(json.headers, {
    "content-type": "application/json",
    ...cors,
    "x-request-id": "json-1",
  });
  assert.equal(json.body, '{\n  "created": true\n}');
  assert.equal(responseMetaOf(json as unknown as ServerResponse)?.status, 201);

  const problem = initializedResponse("problem-1", "https://studio.example");
  sendProblem(problem as unknown as ServerResponse, 400, "Bad Request", "bad body");
  assert.equal(problem.statusCode, 400);
  assert.deepEqual(problem.headers, {
    "content-type": "application/problem+json",
    ...cors,
    "x-request-id": "problem-1",
  });
  assert.equal(
    problem.body,
    '{"title":"Bad Request","status":400,"detail":"bad body"}',
  );
  assert.equal(responseMetaOf(problem as unknown as ServerResponse)?.status, 400);

  const method = initializedResponse("method-1", "https://studio.example");
  sendMethodNotAllowed(method as unknown as ServerResponse, ["GET", "PATCH"]);
  assert.equal(method.statusCode, 405);
  assert.deepEqual(method.headers, {
    "content-type": "application/problem+json",
    allow: "GET, PATCH",
    ...cors,
    "x-request-id": "method-1",
  });
  assert.equal(
    method.body,
    '{"title":"Method Not Allowed","status":405,"detail":"method not allowed for this resource"}',
  );
  assert.equal(responseMetaOf(method as unknown as ServerResponse)?.status, 405);

  const binary = initializedResponse("binary-1", "https://studio.example");
  sendBinary(binary as unknown as ServerResponse, {
    status: 206,
    bytes: Buffer.from("zip"),
    contentType: "application/zip",
    filename: "record.zip",
  });
  assert.equal(binary.statusCode, 206);
  assert.deepEqual(binary.headers, {
    "content-type": "application/zip",
    "content-length": "3",
    "x-content-type-options": "nosniff",
    ...cors,
    "x-request-id": "binary-1",
    "content-disposition": 'attachment; filename="record.zip"',
  });
  assert.equal(binary.body, "zip");
  assert.equal(responseMetaOf(binary as unknown as ServerResponse)?.status, 206);

  const unnamedBinary = initializedResponse("binary-2");
  sendBinary(unnamedBinary as unknown as ServerResponse, {
    status: 200,
    bytes: Buffer.from("ok"),
    contentType: "audio/mpeg",
  });
  assert.equal(unnamedBinary.headers["content-disposition"], undefined);
});

test("body limits enforce declared and streamed ceilings while resuming rejected traffic", async () => {
  const maxBytes = 8;
  for (const [label, size, declared] of [
    ["declared-at-limit", maxBytes, true],
    ["declared-over-limit", maxBytes + 1, true],
    ["streamed-at-limit", maxBytes, false],
    ["streamed-over-limit", maxBytes + 1, false],
  ] as const) {
    await test(label, async () => {
      const tracked = rawRequest(
        [Buffer.alloc(size, "x")],
        declared ? { "content-length": String(size) } : {},
      );
      if (size === maxBytes) {
        assert.equal((await readBody(tracked.req, maxBytes)).byteLength, maxBytes);
        assert.equal(tracked.resumeCount(), 0);
      } else {
        await assert.rejects(readBody(tracked.req, maxBytes), (error: unknown) => {
          assert.ok(error instanceof PayloadTooLargeError);
          assert.equal(error.maxBytes, maxBytes);
          assert.equal(error.message, "request body exceeds 8 bytes");
          return true;
        });
        assert.equal(tracked.resumeCount(), 1);
      }
    });
  }

  const cumulative = rawRequest([
    Buffer.alloc(maxBytes, "x"),
    Buffer.from("!"),
    Buffer.from("unread tail"),
  ]);
  await assert.rejects(readBody(cumulative.req, maxBytes), PayloadTooLargeError);
  assert.equal(cumulative.resumeCount(), 1);

  const drained = rawRequest([Buffer.from("pending")]);
  drainRequest(drained.req);
  assert.equal(drained.resumeCount(), 1);

  const destroyed = rawRequest([Buffer.from("destroyed")]);
  destroyed.req.destroy();
  drainRequest(destroyed.req);
  assert.equal(destroyed.resumeCount(), 0);

  const ended = rawRequest([Buffer.from("ended")]);
  await readBody(ended.req, maxBytes);
  drainRequest(ended.req);
  assert.equal(ended.resumeCount(), 0);
});

test("JSON and URL parsing preserve their bounded fail-closed forms", async () => {
  assert.deepEqual(await readJson(mockReq("/", "POST")), {});
  for (const value of [null, [], "text"]) {
    await assert.rejects(readJson(mockReq("/", "POST", value)), (error: unknown) => {
      assert.ok(error instanceof InvalidJsonError);
      assert.equal(error.name, "InvalidJsonError");
      assert.equal(error.message, "JSON body must be an object");
      return true;
    });
  }
  await assert.rejects(readJson(rawRequest([Buffer.from("{")]).req), (error: unknown) => {
    assert.ok(error instanceof InvalidJsonError);
    assert.equal(error.name, "InvalidJsonError");
    assert.match(error.message, /JSON|Expected/i);
    return true;
  });

  const valid = mockReq("/records/alpha?tag=one&tag=two");
  assert.equal(pathnameOf(valid), "/records/alpha");
  assert.deepEqual(queryOf(valid).getAll("tag"), ["one", "two"]);

  const malformed = mockReq("http://[");
  assert.equal(pathnameOf(malformed), "http://[");
  assert.deepEqual([...queryOf(malformed)], []);
});

test("resource IDs, media keys, and media types accept only their documented shapes", () => {
  for (const value of ["a", "record_01-v2.3", "x".repeat(128)]) {
    assert.equal(validResourceId(value), true, value);
  }
  for (const value of ["", ".", "..", "-start", "has space", "a/b", "x".repeat(129)]) {
    assert.equal(validResourceId(value), false, value);
  }

  for (const value of ["record/take.mp4", "one", "a/b_c-1.2"]) {
    assert.equal(validMediaStorageKey(value), true, value);
  }
  for (const value of ["", "\0", "a\\b", "/absolute", "C:/drive", "C:\\drive", "./a", "a/../b", "a//b", "a/"]) {
    assert.equal(validMediaStorageKey(value), false, value);
  }

  assert.equal(normalizedMediaContentType(" audio/MP4; charset=binary "), "audio/mp4");
  assert.equal(normalizedMediaContentType("video/x-msvideo"), "video/x-msvideo");
  assert.equal(normalizedMediaContentType("audio/a+b.c-1"), "audio/a+b.c-1");
  for (const value of [undefined, "text/plain", "audio/", "audio/mpeg/extra"]) {
    assert.equal(normalizedMediaContentType(value), "application/octet-stream");
  }
});
