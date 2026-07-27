/**
 * MvEI Workbench laban-subset mode: load subset JSON and render a simple column staff.
 * Not Motif-only: multi-staff pedagogical reading (not professional Laban density).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { escapeHtml } from "./html-escape.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const LABAN_SUBSET_CORPUS_PATH = join(
  __dirname,
  "../../../../packages/movement-encode/fixtures/corpus/laban-subset-04.json",
);

/**
 * @typedef {{
 *   schemaVersion: string,
 *   profile: "mvei-laban-subset",
 *   id: string,
 *   title?: string,
 *   completeness: string,
 *   staff?: { columns?: string[] },
 *   measures: Array<{ id: string, index: number, beats?: number }>,
 *   symbols: Array<{
 *     id: string,
 *     kind: string,
 *     column: string,
 *     measureId: string,
 *     direction?: string,
 *     level?: string,
 *     durationBeats?: number,
 *     beatOffset?: number,
 *     simultaneousGroup?: string,
 *     motifSymbol?: string,
 *   }>,
 * }} LabanSubsetDocument
 */

/**
 * @param {string | object} jsonStringOrObject
 * @returns {LabanSubsetDocument}
 */
export function loadLabanSubset(jsonStringOrObject) {
  const doc = parseLabanSubsetObject(jsonStringOrObject);
  validateLabanSubsetProfile(doc);
  validateLabanSubsetStructure(doc);
  return /** @type {LabanSubsetDocument} */ (doc);
}

/** Parse and reject non-object Laban subset input before inspecting its fields. */
function parseLabanSubsetObject(jsonStringOrObject) {
  const doc = typeof jsonStringOrObject === "string" ? JSON.parse(jsonStringOrObject) : jsonStringOrObject;
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) throw new TypeError("laban-subset document must be a JSON object");
  return doc;
}

/** Check the fixed profile and schema identity for the Workbench subset. */
function validateLabanSubsetProfile(doc) {
  if (doc.profile !== "mvei-laban-subset") {
    throw new Error(
      `Expected profile "mvei-laban-subset", got ${JSON.stringify(doc.profile)}`,
    );
  }
  if (doc.schemaVersion !== "0.2.0") {
    throw new Error(
      `Expected schemaVersion 0.2.0, got ${JSON.stringify(doc.schemaVersion)}`,
    );
  }
}

/** Check the subset fields that the staff renderer reads directly. */
function validateLabanSubsetStructure(doc) {
  if (typeof doc.id !== "string" || !doc.id) throw new Error("laban-subset requires non-empty id");
  if (!Array.isArray(doc.measures) || !Array.isArray(doc.symbols)) throw new Error("laban-subset requires measures and symbols arrays");
}

/**
 * Load corpus laban-subset-04 (multi-column simultaneity sample).
 * @returns {LabanSubsetDocument}
 */
export function loadCorpusLabanSubset() {
  return loadLabanSubset(readFileSync(LABAN_SUBSET_CORPUS_PATH, "utf8"));
}

/**
 * Simple HTML/SVG multi-column staff for laban-subset documents.
 * Columns = vertical staffs; measures = horizontal time cells.
 * @param {LabanSubsetDocument} doc
 * @returns {string}
 */
export function renderLabanSubsetStaffHtml(doc) {
  const columns =
    doc.staff?.columns?.length > 0
      ? doc.staff.columns
      : [...new Set(doc.symbols.map((s) => s.column))];
  const measures = [...doc.measures].sort((a, b) => a.index - b.index);
  const colW = 72;
  const rowH = 48;
  const labelW = 100;
  const width = labelW + measures.length * colW + 16;
  const height = 40 + columns.length * rowH + 8;

  const header = measures
    .map(
      (m, i) =>
        `<text x="${labelW + i * colW + colW / 2}" y="18" text-anchor="middle" font-size="10" fill="#9aa3b5">${escapeHtml(m.id)}</text>`,
    )
    .join("");

  const grid = columns
    .map((col, ri) => {
      const y = 32 + ri * rowH;
      const label = `<text x="8" y="${y + 28}" font-size="9" fill="#7eb8da">${escapeHtml(col)}</text>`;
      const cells = measures
        .map((m, ci) => {
          const x = labelW + ci * colW;
          const syms = doc.symbols.filter(
            (s) => s.column === col && s.measureId === m.id,
          );
          const cell = `<rect x="${x}" y="${y}" width="${colW - 4}" height="${rowH - 4}" rx="3" fill="#1c2030" stroke="#2e3548"/>`;
          const labels = syms
            .map((s, si) => {
              const text = s.motifSymbol ?? s.kind;
              const ty = y + 16 + si * 12;
              return `<text x="${x + (colW - 4) / 2}" y="${ty}" text-anchor="middle" font-size="9" fill="#e8eaf0" data-symbol-id="${escapeHtml(s.id)}">${escapeHtml(text)}</text>`;
            })
            .join("");
          return cell + labels;
        })
        .join("");
      return `<g data-column="${escapeHtml(col)}" role="row">${label}${cells}</g>`;
    })
    .join("\n");

  const title = doc.title ?? doc.id;
  return `<figure class="laban-subset-staff" data-profile="mvei-laban-subset" data-doc-id="${escapeHtml(doc.id)}">
  <figcaption>${escapeHtml(title)} · laban-subset multi-staff (pedagogical)</figcaption>
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" role="img" aria-label="${escapeHtml(title)} column staff">
    ${header}
    ${grid}
  </svg>
</figure>`;
}

/**
 * Immutable add of a symbol for undo-history integration.
 * @param {LabanSubsetDocument} doc
 * @param {LabanSubsetDocument["symbols"][number]} symbol
 * @returns {LabanSubsetDocument}
 */
export function addLabanSymbol(doc, symbol) {
  if (!symbol?.id) throw new Error("symbol.id required");
  return {
    ...doc,
    symbols: [...doc.symbols, symbol],
  };
}

/**
 * @param {LabanSubsetDocument} doc
 * @param {string} symbolId
 * @returns {LabanSubsetDocument}
 */
export function removeLabanSymbol(doc, symbolId) {
  if (!doc.symbols.some((s) => s.id === symbolId)) {
    throw new Error(`symbol not found: ${symbolId}`);
  }
  return {
    ...doc,
    symbols: doc.symbols.filter((s) => s.id !== symbolId),
  };
}

/**
 * List symbols on a column (optionally filtered to one measure).
 * @param {LabanSubsetDocument} doc
 * @param {string} column
 * @param {string} [measureId]
 */
export function symbolsOnColumn(doc, column, measureId) {
  return doc.symbols.filter(
    (s) => s.column === column && (measureId == null || s.measureId === measureId),
  );
}

/**
 * Add a symbol to a specific staff column (multi-staff laban editing).
 * Ensures column is listed on staff.columns.
 * @param {LabanSubsetDocument} doc
 * @param {string} column
 * @param {Omit<LabanSubsetDocument["symbols"][number], "column"> & { column?: string }} symbol
 * @returns {LabanSubsetDocument}
 */
export function addSymbolOnColumn(doc, column, symbol) {
  if (!column) throw new Error("column required");
  if (!symbol?.id) throw new Error("symbol.id required");
  const columns = doc.staff?.columns?.length
    ? doc.staff.columns.includes(column)
      ? doc.staff.columns
      : [...doc.staff.columns, column]
    : [column];
  const next = {
    ...doc,
    staff: { ...(doc.staff ?? {}), columns },
    symbols: [
      ...doc.symbols,
      {
        kind: "stillness",
        measureId: doc.measures[0]?.id ?? "m0",
        ...symbol,
        column,
        id: symbol.id,
      },
    ],
  };
  return next;
}

/**
 * Remove all symbols on a column for a measure (or whole column if measure omitted).
 * @param {LabanSubsetDocument} doc
 * @param {string} column
 * @param {string} [measureId]
 * @returns {LabanSubsetDocument}
 */
export function removeSymbolsOnColumn(doc, column, measureId) {
  const symbols = doc.symbols.filter((s) => {
    if (s.column !== column) return true;
    if (measureId == null) return false;
    return s.measureId !== measureId;
  });
  return { ...doc, symbols };
}

/**
 * Remove one symbol by id on a column (throws if missing or wrong column).
 * @param {LabanSubsetDocument} doc
 * @param {string} column
 * @param {string} symbolId
 */
export function removeSymbolOnColumn(doc, column, symbolId) {
  const hit = doc.symbols.find((s) => s.id === symbolId);
  if (!hit) throw new Error(`symbol not found: ${symbolId}`);
  if (hit.column !== column) {
    throw new Error(`symbol ${symbolId} is on column ${hit.column}, not ${column}`);
  }
  return removeLabanSymbol(doc, symbolId);
}
