/**
 * HTTP boundary primitives for the Practice Relay API.
 * Why: body limits, response metadata, CORS, and URL validation must stay uniform.
 */
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

const MAX_JSON_BODY_BYTES = 1024 * 1024;

/** Signals a request body that exceeds its route-specific buffering limit. */
export class PayloadTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`request body exceeds ${maxBytes} bytes`);
    this.name = "PayloadTooLargeError";
  }
}

/** Signals syntactically invalid JSON after a bounded body read. */
export class InvalidJsonError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "InvalidJsonError";
  }
}

/** Metadata retained until access logging completes for one response. */
export type ResponseMeta = {
  requestId: string;
  status: number;
  started: number;
  corsOrigin?: string;
};

const responseMetadata = new WeakMap<ServerResponse, ResponseMeta>();

/** Attach initial request metadata to a response. */
export function initializeResponseMeta(
  res: ServerResponse,
  requestId: string,
  corsOrigin?: string,
): void {
  responseMetadata.set(res, {
    requestId,
    status: 0,
    started: Date.now(),
    corsOrigin,
  });
}

/** Read request metadata associated with a response. */
export function responseMetaOf(res: ServerResponse): ResponseMeta | undefined {
  return responseMetadata.get(res);
}

/** Resolve a caller-supplied request id or generate a new one. */
export function requestIdOf(req: IncomingMessage): string {
  const header = req.headers?.["x-request-id"];
  if (typeof header === "string" && header.trim()) return header.trim();
  if (Array.isArray(header) && header[0]?.trim()) return header[0].trim();
  return randomUUID();
}

/** Build response headers for one accepted browser origin and request identifier. */
export function corsHeaders(
  requestId?: string,
  allowedOrigin?: string,
): Record<string, string> {
  return {
    ...(allowedOrigin
      ? {
          "access-control-allow-origin": allowedOrigin,
          "access-control-allow-headers":
            "content-type, authorization, x-request-id",
          "access-control-allow-methods": "GET,POST,PUT,PATCH,OPTIONS",
          vary: "Origin",
        }
      : {}),
    ...(requestId ? { "x-request-id": requestId } : {}),
  };
}

/** Send an indented JSON response and record its status. */
export function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  const meta = responseMetadata.get(res);
  if (meta) meta.status = status;
  res.writeHead(status, {
    "content-type": "application/json",
    ...corsHeaders(meta?.requestId, meta?.corsOrigin),
  });
  res.end(JSON.stringify(body, null, 2));
}

/** Send an RFC-7807-shaped problem response and record its status. */
export function sendProblem(
  res: ServerResponse,
  status: number,
  title: string,
  detail: string,
): void {
  const meta = responseMetadata.get(res);
  if (meta) meta.status = status;
  res.writeHead(status, {
    "content-type": "application/problem+json",
    ...corsHeaders(meta?.requestId, meta?.corsOrigin),
  });
  res.end(JSON.stringify({ title, status, detail }));
}

/** Send a 405 problem with the recognized endpoint's allowed methods. */
export function sendMethodNotAllowed(
  res: ServerResponse,
  allowedMethods: readonly string[],
): void {
  const meta = responseMetadata.get(res);
  if (meta) meta.status = 405;
  res.writeHead(405, {
    "content-type": "application/problem+json",
    allow: allowedMethods.join(", "),
    ...corsHeaders(meta?.requestId, meta?.corsOrigin),
  });
  res.end(
    JSON.stringify({
      title: "Method Not Allowed",
      status: 405,
      detail: "method not allowed for this resource",
    }),
  );
}

/** Send a buffered download with consistent metadata, CORS, and sniffing policy. */
export function sendBinary(
  res: ServerResponse,
  payload: {
    status: number;
    bytes: Buffer;
    contentType: string;
    filename?: string;
  },
): void {
  const meta = responseMetadata.get(res);
  if (meta) meta.status = payload.status;
  const headers: Record<string, string> = {
    "content-type": payload.contentType,
    "content-length": String(payload.bytes.length),
    "x-content-type-options": "nosniff",
    ...corsHeaders(meta?.requestId, meta?.corsOrigin),
  };
  if (payload.filename) {
    headers["content-disposition"] =
      `attachment; filename="${payload.filename}"`;
  }
  res.writeHead(payload.status, headers);
  res.end(payload.bytes);
}

/** Read a request body without exceeding the supplied byte ceiling. */
export async function readBody(
  req: IncomingMessage,
  maxBytes: number,
): Promise<Buffer> {
  const rawLength = req.headers?.["content-length"];
  const declaredLength = Number(
    Array.isArray(rawLength) ? rawLength[0] : rawLength,
  );
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    req.resume();
    throw new PayloadTooLargeError(maxBytes);
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    total += bytes.byteLength;
    if (total > maxBytes) {
      req.resume();
      throw new PayloadTooLargeError(maxBytes);
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

/** Drain an unread request so rejected traffic cannot pin a keep-alive socket. */
export function drainRequest(req: IncomingMessage): void {
  if (req.destroyed || req.readableEnded) return;
  req.resume();
}

/** Read one bounded JSON body, returning an empty object for no bytes. */
export async function readJson<T = unknown>(req: IncomingMessage): Promise<T> {
  const raw = await readBody(req, MAX_JSON_BODY_BYTES);
  if (!raw.length) return {} as T;
  try {
    const parsed = JSON.parse(raw.toString("utf8")) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new InvalidJsonError("JSON body must be an object");
    }
    return parsed as T;
  } catch (err) {
    if (err instanceof InvalidJsonError) throw err;
    throw new InvalidJsonError(
      err instanceof Error ? err.message : "invalid JSON request body",
    );
  }
}

/** Parse the request pathname without throwing on malformed input. */
export function pathnameOf(req: IncomingMessage): string {
  const raw = req.url ?? "/";
  try {
    return new URL(raw, "http://localhost").pathname;
  } catch {
    return raw.split("?")[0] ?? "/";
  }
}

/** Parse request query parameters without throwing on malformed input. */
export function queryOf(req: IncomingMessage): URLSearchParams {
  try {
    return new URL(req.url ?? "/", "http://localhost").searchParams;
  } catch {
    return new URLSearchParams();
  }
}

/** Validate a bounded route resource identifier. */
export function validResourceId(value: string): boolean {
  return (
    /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value) &&
    value !== "." &&
    value !== ".."
  );
}

/** Validate an object key as a relative, traversal-free media path. */
export function validMediaStorageKey(value: string): boolean {
  if (
    !value ||
    value.includes("\0") ||
    value.includes("\\") ||
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value)
  ) {
    return false;
  }
  return value
    .split("/")
    .every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

/** Permit explicit audio/video media types and neutralize everything else. */
export function normalizedMediaContentType(
  contentType: string | undefined,
): string {
  const value = contentType?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (/^(audio|video)\/[a-z0-9.+-]+$/.test(value)) return value;
  return "application/octet-stream";
}
