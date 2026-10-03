/** Schema-validated pedagogical staff rendering without bundled corpus imports. */
import { parseMovementDocument } from "@practice-relay/movement/browser/parser";
import { escapeHtml } from "./html-escape.mjs";

const MAX_LABAN_RENDER_CELLS = 10_000;
const MAX_LABAN_RENDER_SYMBOLS = 10_000;

function symbolsByCell(symbols) {
  const result = new Map();
  for (const symbol of symbols) {
    let measures = result.get(symbol.column);
    if (!measures) {
      measures = new Map();
      result.set(symbol.column, measures);
    }
    const cell = measures.get(symbol.measureId) ?? [];
    cell.push(symbol);
    measures.set(symbol.measureId, cell);
  }
  return result;
}

/**
 * Simple HTML/SVG multi-column staff for laban-subset documents.
 * Columns = vertical staffs; measures = horizontal time cells.
 * @param {LabanSubsetDocument} doc
 * @returns {string}
 */
export function renderLabanSubsetStaffHtml(doc) {
  doc = parseMovementDocument(doc);
  const columns =
    doc.staff?.columns?.length > 0
      ? doc.staff.columns
      : [...new Set(doc.symbols.map((s) => s.column))];
  const measures = [...doc.measures].sort((a, b) => a.index - b.index);
  if (new Set(columns).size !== columns.length) {
    throw new Error("Laban staff columns must not contain duplicates");
  }
  if (new Set(measures.map((measure) => measure.id)).size !== measures.length) {
    throw new Error("Laban staff measures must not contain duplicate IDs");
  }
  if (Math.max(1, columns.length) * measures.length > MAX_LABAN_RENDER_CELLS) {
    throw new Error(`Laban staff exceeds the ${MAX_LABAN_RENDER_CELLS} cell render limit`);
  }
  if (doc.symbols.length > MAX_LABAN_RENDER_SYMBOLS) {
    throw new Error(`Laban staff exceeds the ${MAX_LABAN_RENDER_SYMBOLS} symbol render limit`);
  }
  const indexedSymbols = symbolsByCell(doc.symbols);
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
          const syms = indexedSymbols.get(col)?.get(m.id) ?? [];
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
