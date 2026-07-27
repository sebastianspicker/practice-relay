/**
 * Markdown fence masking for repository documentation checks.
 * Why: link-like examples inside fenced code must not become false failures.
 */

/** Remove fenced examples while preserving source line positions. */
export function maskFencedCode(markdown) {
  const masked = [];
  let fence = null;
  for (const line of markdown.split("\n")) {
    const match = line.match(/^\s*(`{3,}|~{3,})/u);
    const marker = match ? match[1] : null;
    const fenceLine = marker && (!fence || marker[0] === fence);
    if (fenceLine) fence = fence ? null : marker[0];
    masked.push(fence || marker ? "" : line);
  }
  return masked.join("\n");
}
