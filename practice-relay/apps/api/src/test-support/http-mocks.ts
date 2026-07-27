/**
 * Shared in-process HTTP mocks for Practice Relay API and acceptance tests.
 * Why: route suites need one behaviorally stable request/response boundary.
 */
import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";

/** Mutable response state captured by the API test harness. */
export type MockRes = {
  statusCode: number;
  headers: Record<string, string | number | string[] | undefined>;
  body: string;
  writeHead: (code: number, headers?: MockRes["headers"]) => MockRes;
  end: (chunk?: string | Buffer) => MockRes;
};

/** Build a readable request whose optional body is JSON encoded once. */
export function mockReq(
  url: string,
  method = "GET",
  body?: unknown,
  headers?: Record<string, string>,
): IncomingMessage {
  const data = body !== undefined ? JSON.stringify(body) : "";
  const stream = new Readable({
    read() {
      if (data) this.push(data);
      this.push(null);
    },
  });
  const req = stream as IncomingMessage;
  req.url = url;
  req.method = method;
  req.headers = { ...(headers ?? {}) };
  return req;
}

/** Capture status, headers, and body written by an in-process route handler. */
export function mockRes(): MockRes {
  const state: MockRes = {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(code, headers) {
      state.statusCode = code;
      if (headers) state.headers = { ...headers };
      return state;
    },
    end(chunk) {
      if (chunk != null) state.body = String(chunk);
      return state;
    },
  };
  return state;
}
