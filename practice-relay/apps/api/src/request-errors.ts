/**
 * Request-operation error translation for the Practice Relay API.
 * Why: route groups must preserve the same 400/409 response contract.
 */
import type { ServerResponse } from "node:http";
import { RecordRevisionConflictError } from "@practice-relay/record-store";
import { sendProblem } from "./api-http.ts";

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

/** Identify optimistic-concurrency errors without relying on one adapter class. */
export function revisionConflict(err: unknown): boolean {
  return (
    err instanceof RecordRevisionConflictError ||
    (err instanceof Error && /revision conflict/i.test(err.message))
  );
}

/** Emit the stable mutation error response, including 409 revision conflicts. */
export function sendOperationError(
  res: ServerResponse,
  err: unknown,
  fallback: string,
): void {
  if (revisionConflict(err)) {
    sendProblem(
      res,
      409,
      "Conflict",
      err instanceof Error ? err.message : "record revision conflict",
    );
    return;
  }
  sendProblem(
    res,
    400,
    "Bad Request",
    err instanceof Error ? err.message : fallback,
  );
}
