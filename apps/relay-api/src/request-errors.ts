/**
 * Request-operation error translation for the Practice Relay API.
 * Why: route groups must preserve the same 400/403/409 response contract, and
 * unclassified (infrastructure) failures must not leak their messages as 400s.
 */
import type { ServerResponse } from "node:http";
import { isMediaObjectExists } from "@practice-relay/media-store";
import { isRecordRevisionConflict } from "@practice-relay/record-store";
import { isWorkRecordDuplicate, isWorkRecordInvalid, isWorkRecordPolicyDenied, isWorkRecordRoleDenied } from "@practice-relay/work-record";
import { responseMetaOf, sendProblem } from "./api-http.ts";
import { logRequestLine } from "./api-observability.ts";
import { InvalidRevisionError } from "./application/mutations.ts";

/** Generic detail for every unclassified failure; the cause is logged, never sent. */
export const INTERNAL_ERROR_DETAIL = "unexpected internal error";

/** Run a synchronous request conversion and translate invalid input to 400. */
export function attemptRequestValue<T>(
  res: ServerResponse,
  operation: () => T,
): { ok: true; value: T } | { ok: false } {
  try {
    return { ok: true, value: operation() };
  } catch (err) {
    sendProblem(
      res,
      400,
      "Bad Request",
      err instanceof Error ? err.message : "invalid request value",
    );
    return { ok: false };
  }
}

/**
 * Send the stable problem for a coded domain or adapter error.
 * Returns false for unclassified errors so each caller keeps its own fallback.
 */
export function sendClassifiedError(
  res: ServerResponse,
  err: unknown,
  options: { duplicateDetail?: string } = {},
): boolean {
  if (isWorkRecordInvalid(err)) {
    sendProblem(res, 400, "Bad Request", err.message);
  } else if (isWorkRecordRoleDenied(err) || isWorkRecordPolicyDenied(err)) {
    sendProblem(res, 403, "Forbidden", err.message);
  } else if (isWorkRecordDuplicate(err) || isMediaObjectExists(err)) {
    sendProblem(res, 409, "Conflict", options.duplicateDetail ?? err.message);
  } else if (isRecordRevisionConflict(err)) {
    sendProblem(res, 409, "Conflict", err.message);
  } else {
    return false;
  }
  return true;
}

/** Log an unclassified failure server-side without request bodies or credentials. */
export function logUnclassifiedError(res: ServerResponse, err: unknown): void {
  logRequestLine({
    level: "error",
    msg: "unclassified request error",
    requestId: responseMetaOf(res)?.requestId,
    error: err instanceof Error ? { name: err.name, message: err.message } : String(err),
  });
}

/**
 * Emit the stable mutation error response, including 409 revision conflicts.
 * Unclassified failures answer a generic 500 and are logged, never echoed.
 */
export function sendOperationError(
  res: ServerResponse,
  err: unknown,
): void {
  if (sendClassifiedError(res, err)) return;
  if (err instanceof InvalidRevisionError) {
    sendProblem(res, 400, "Bad Request", err.message);
    return;
  }
  logUnclassifiedError(res, err);
  sendProblem(res, 500, "Internal Server Error", INTERNAL_ERROR_DETAIL);
}

/** Await a persistence operation and preserve classified domain and adapter errors. */
export async function attemptRequestOperation<T>(
  res: ServerResponse,
  operation: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await operation() };
  } catch (error) {
    sendOperationError(res, error);
    return { ok: false };
  }
}
