/**
 * Shared HTTP primitives for LTI mock-platform request routes.
 * Why: route modules share one bounded transport contract without owning server configuration.
 */
import { MOCK_PLATFORM_BANNER } from "./platform.mjs";

const MAX_JSON_BODY_BYTES = 1024 * 1024;
const API_FETCH_TIMEOUT_MS = 15_000;

/** Signal a client-facing request failure with its HTTP status. */
export class MockRequestError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "MockRequestError";
    this.status = status;
  }
}

/** Send a non-cacheable JSON response with the mock-platform identity header. */
export function sendJson(res, code, body) {
  const data = JSON.stringify(body, null, 2);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-mock-platform": MOCK_PLATFORM_BANNER,
  });
  res.end(data);
}

/** Send a non-cacheable HTML response with the mock-platform identity header. */
export function sendHtml(res, code, html) {
  res.writeHead(code, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-mock-platform": MOCK_PLATFORM_BANNER,
  });
  res.end(html);
}

function rejectOversizedDeclaredJsonBody(req) {
  const declared = Number(req.headers?.["content-length"]);
  if (Number.isFinite(declared) && declared > MAX_JSON_BODY_BYTES) {
    req.resume();
    throw new MockRequestError(413, "request body too large");
  }
}

async function collectJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    total += bytes.byteLength;
    if (total > MAX_JSON_BODY_BYTES) {
      req.resume();
      throw new MockRequestError(413, "request body too large");
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseJsonObject(raw) {
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new MockRequestError(400, "JSON body must be an object");
    }
    return parsed;
  } catch (err) {
    if (err instanceof MockRequestError) throw err;
    throw new MockRequestError(400, "invalid JSON");
  }
}

/** Read, size-limit, and parse an incoming JSON object request body. */
export async function readJson({ req }) {
  rejectOversizedDeclaredJsonBody(req);
  return parseJsonObject(await collectJsonBody(req));
}

/** Request the configured Practice Relay API and normalize its text response as JSON. */
export async function apiFetch({ apiBase, fetchImpl }, path, opts = {}) {
  const url = `${apiBase}${path}`;
  const requestFetch = fetchImpl ?? globalThis.fetch;
  const res = await requestFetch(url, {
    method: opts.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(opts.headers ?? {}),
    },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(API_FETCH_TIMEOUT_MS),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json, url };
}

/** Report whether a request context has the exact route path and method. */
export function matches(context, path, method) {
  return context.path === path && context.method === method;
}
