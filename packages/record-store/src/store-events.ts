/** Event-log validation that must complete before restore writes begin. */
import path from "node:path";
import type { RecordEvent } from "./types.js";

function validateEventFields(value: Partial<RecordEvent> | null): void {
  if (!value || typeof value !== "object") {
    throw new Error("event object fields required");
  }
  const allowed = new Set(["at", "kind", "recordId", "detail", "actorId", "operationId"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new Error("unsupported event field");
  const operationId = (value as { operationId?: unknown }).operationId;
  if (operationId !== undefined && (typeof operationId !== "string" || !operationId)) throw new Error("invalid event operationId");
  if (typeof value.at !== "string" || !Number.isFinite(Date.parse(value.at))) throw new Error("event object fields required");
  if (typeof value.kind !== "string" || !value.kind.trim()) throw new Error("event object fields required");
  if (typeof value.recordId !== "string" || !/^[a-zA-Z0-9_][a-zA-Z0-9._-]{0,127}$/u.test(value.recordId)) throw new Error("event object fields required");
  if (value.detail !== undefined && typeof value.detail !== "string") throw new Error("event detail must be a string");
  if (value.actorId !== undefined && typeof value.actorId !== "string") throw new Error("event actorId must be a string");
}

function validateEventLine(line: string, source: string): void {
  const event = JSON.parse(line) as Partial<RecordEvent>;
  validateEventFields(event);
  if (path.basename(path.dirname(source)) === "events" && event.recordId !== path.basename(source, ".jsonl")) {
    throw new Error("event recordId does not match its log filename");
  }
}

/** Validate every non-empty event-log line as a record event bound to its per-record filename. */
export function validateJsonLines(raw: string, source: string): void {
  for (const [index, line] of raw.split("\n").entries()) {
    if (!line.trim()) continue;
    try {
      validateEventLine(line, source);
    } catch (err) {
      throw new Error(
        `invalid event log ${source}:${index + 1}: ${err instanceof Error ? err.message : "invalid JSON"}`,
      );
    }
  }
}
