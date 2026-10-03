/**
 * MvEI Workbench laban-subset mode: load subset JSON and render a simple column staff.
 * Not Motif-only: multi-staff pedagogical reading (not professional Laban density).
 */
import { MOVEMENT_CORPUS } from "@practice-relay/movement/browser/examples";
import { parseMovementDocument } from "@practice-relay/movement/browser/parser";

/** @typedef {import("@practice-relay/movement").LabanSubsetDocument} LabanSubsetDocument */

/**
 * @param {string | object} jsonStringOrObject
 * @returns {LabanSubsetDocument}
 */
export function loadLabanSubset(jsonStringOrObject) {
  const doc = parseMovementDocument(jsonStringOrObject);
  if (doc.profile !== "mvei-laban-subset") {
    throw new Error(`Expected laban-subset document, got ${JSON.stringify(doc.profile)}`);
  }
  return /** @type {LabanSubsetDocument} */ (doc);
}

/**
 * Load corpus laban-subset-04 (multi-column simultaneity sample).
 * @returns {LabanSubsetDocument}
 */
export function loadCorpusLabanSubset() {
  return loadLabanSubset(JSON.stringify(MOVEMENT_CORPUS.labanSubset04));
}

export { renderLabanSubsetStaffHtml } from "./laban-render.mjs";

/**
 * Immutable add of a symbol for undo-history integration.
 * @param {LabanSubsetDocument} doc
 * @param {LabanSubsetDocument["symbols"][number]} symbol
 * @returns {LabanSubsetDocument}
 */
export function addLabanSymbol(doc, symbol) {
  if (!symbol?.id) throw new Error("symbol.id required");
  return loadLabanSubset({
    ...doc,
    symbols: [...doc.symbols, symbol],
  });
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
  return loadLabanSubset({
    ...doc,
    symbols: doc.symbols.filter((s) => s.id !== symbolId),
  });
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
  return loadLabanSubset(next);
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
  return loadLabanSubset({ ...doc, symbols });
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
