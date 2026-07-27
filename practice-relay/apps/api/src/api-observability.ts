/**
 * Structured process logging for the Practice Relay API.
 * Why: router and public entrypoint share one secret-free request log shape.
 */

/** Write one structured JSON-lines request event without secret fields. */
export function logRequestLine(entry: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      ...entry,
    }),
  );
}
