/** Event-log validation that must complete before restore writes begin. */
import type { RecordEvent } from "./types.js";

function validateEventFields(value: Partial<RecordEvent> | null): void {
  if (!value || typeof value !== "object") {
    throw new Error("event object fields required");
  }
  if (typeof value.at !== "string") throw new Error("event object fields required");
  if (typeof value.kind !== "string") throw new Error("event object fields required");
  if (typeof value.recordId !== "string") throw new Error("event object fields required");
}

function validateEventLine(line: string): void {
  validateEventFields(JSON.parse(line) as Partial<RecordEvent>);
}

/** Validate every non-empty event-log line as a minimal record event. */
export function validateJsonLines(raw: string, source: string): void {
  for (const [index, line] of raw.split("\n").entries()) {
    if (!line.trim()) continue;
    try {
      validateEventLine(line);
    } catch (err) {
      throw new Error(
        `invalid event log ${source}:${index + 1}: ${err instanceof Error ? err.message : "invalid JSON"}`,
      );
    }
  }
}
