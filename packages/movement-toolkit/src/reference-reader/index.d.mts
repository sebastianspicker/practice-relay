/** Type declarations for the browser-safe movement reference reader helpers. */

/** Render an untrusted scalar without emitting terminal control characters. */
export function neutralizeTerminalScalar(value: unknown): string;
