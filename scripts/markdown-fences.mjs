/**
 * Markdown fence masking for repository documentation checks.
 * Why: link-like examples inside fenced code must not become false failures.
 */

/** Remove fenced examples while preserving source line positions. */
export function maskFencedCode(markdown) {
  const masked = [];
  let fence = null;
  for (const line of markdown.split("\n")) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/u)?.[1] ?? null;
    const closes = fence && marker && marker[0] === fence[0] && marker.length >= fence.length;
    if (closes) fence = null;
    else if (!fence && marker) fence = marker;
    masked.push(fence || marker ? "" : line);
  }
  return masked.join("\n");
}
