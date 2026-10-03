/**
 * @practice-relay/movement-toolkit reference-reader - third MvEI implementation (read-only).
 *
 * Proves multi-implementation: validator + engraver + this reader all consume
 * the same Motif JSON. Does not edit, engrave, or implement Laban subset.
 */

/**
 * @typedef {{
 *   schemaVersion: string,
 *   profile: string,
 *   id: string,
 *   title?: string,
 *   completeness?: string,
 *   items?: Array<{ id: string, symbol: string, order: number, timeAnchor?: object }>,
 *   musicCoTimeline?: { anchors?: unknown[], musicxmlRef?: string | null, meiRef?: string | null },
 *   annotationLinks?: unknown[],
 * }} MotifLike
 */

/**
 * @typedef {{
 *   id: string,
 *   title: string | null,
 *   profile: string,
 *   schemaVersion: string,
 *   completeness: string | null,
 *   itemCount: number,
 *   symbols: Record<string, number>,
 *   anchorCount: number,
 *   musicxmlRef: string | null,
 *   meiRef: string | null,
 *   annotationLinkCount: number,
 * }} MotifSummary
 */

/**
 * Load Motif document from JSON string or object.
 * @param {string | object} jsonStringOrObject
 * @returns {MotifLike}
 */
export function loadMotifDocument(jsonStringOrObject) {
  const doc =
    typeof jsonStringOrObject === "string"
      ? JSON.parse(jsonStringOrObject)
      : jsonStringOrObject;
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    throw new TypeError("Motif document must be a JSON object");
  }
  if (doc.profile !== "mvei-motif") {
    throw new Error(
      `reference-reader supports mvei-motif only, got ${JSON.stringify(doc.profile)}`,
    );
  }
  if (typeof doc.id !== "string" || !doc.id) {
    throw new Error("Motif requires non-empty id");
  }
  if (!Array.isArray(doc.items)) {
    throw new Error("Motif requires items array");
  }
  return /** @type {MotifLike} */ (doc);
}

/**
 * Build a structured summary of a Motif document.
 * @param {MotifLike} doc
 * @returns {MotifSummary}
 */
export function summarizeMotif(doc) {
  const symbols = summarizeSymbols(doc.items);
  const annex = doc.musicCoTimeline;
  return {
    id: doc.id,
    title: doc.title ?? null,
    profile: doc.profile,
    schemaVersion: String(doc.schemaVersion ?? ""),
    completeness: doc.completeness ?? null,
    itemCount: (doc.items ?? []).length,
    symbols,
    anchorCount: Array.isArray(annex?.anchors) ? annex.anchors.length : 0,
    musicxmlRef: annex?.musicxmlRef ?? null,
    meiRef: annex?.meiRef ?? null,
    annotationLinkCount: Array.isArray(doc.annotationLinks)
      ? doc.annotationLinks.length
      : 0,
  };
}

/** Count the controlled-vocabulary symbols while preserving unknown-item fallback. */
function summarizeSymbols(items) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const item of items ?? []) {
    const symbol = String(item.symbol ?? "?");
    counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
  }
  return Object.fromEntries(counts);
}

/**
 * Make an untrusted scalar safe to include in terminal and log output.
 *
 * Printable Unicode, including valid surrogate pairs, is retained verbatim.
 * Terminal controls, line separators, and malformed UTF-16 code units become
 * visible ASCII escapes so they cannot change terminal state or forge lines.
 * @param {unknown} value
 * @returns {string}
 */
export function neutralizeTerminalScalar(value) {
  const text = String(value);
  let result = "";
  for (const character of text) {
    const codeUnit = character.charCodeAt(0);
    if (
      codeUnit <= 0x1f ||
      (codeUnit >= 0x7f && codeUnit <= 0x9f) ||
      codeUnit === 0x2028 ||
      codeUnit === 0x2029
    ) {
      result += `\\u${codeUnit.toString(16).toUpperCase().padStart(4, "0")}`;
      continue;
    }
    if (
      character.length === 1 &&
      codeUnit >= 0xd800 &&
      codeUnit <= 0xdfff
    ) {
      result += `\\u${codeUnit.toString(16).toUpperCase()}`;
      continue;
    }
    result += character;
  }
  return result;
}

/**
 * Format summary as plain text for CLI / logs.
 * @param {MotifSummary} summary
 * @returns {string}
 */
export function formatMotifSummary(summary) {
  const hist = Object.entries(summary.symbols)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(
      ([key, value]) =>
        `  ${neutralizeTerminalScalar(key)}: ${neutralizeTerminalScalar(value)}`,
    )
    .join("\n");
  return [
    `MvEI Motif summary (reference-reader · read-only · not engraver · not Workbench)`,
    `id:            ${neutralizeTerminalScalar(summary.id)}`,
    `title:         ${neutralizeTerminalScalar(summary.title ?? "-")}`,
    `profile:       ${neutralizeTerminalScalar(summary.profile)}`,
    `schemaVersion: ${neutralizeTerminalScalar(summary.schemaVersion)}`,
    `completeness:  ${neutralizeTerminalScalar(summary.completeness ?? "-")}`,
    `items:         ${neutralizeTerminalScalar(summary.itemCount)}`,
    `symbols:`,
    hist || "  (none)",
    `co-timeline anchors: ${neutralizeTerminalScalar(summary.anchorCount)}`,
    `musicxmlRef:   ${neutralizeTerminalScalar(summary.musicxmlRef ?? "-")}`,
    `meiRef:        ${neutralizeTerminalScalar(summary.meiRef ?? "-")}`,
    `annotationLinks: ${neutralizeTerminalScalar(summary.annotationLinkCount)}`,
  ].join("\n");
}

/**
 * One-shot: parse + summarize + format.
 * @param {string | object} jsonStringOrObject
 * @returns {string}
 */
export function readMotifSummaryText(jsonStringOrObject) {
  return formatMotifSummary(summarizeMotif(loadMotifDocument(jsonStringOrObject)));
}
