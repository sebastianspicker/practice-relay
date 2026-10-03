/** Schema-validated pedagogical staff rendering without bundled corpus imports. */
import { parseMovementDocument } from "@practice-relay/movement/browser/parser";
import { escapeHtml } from "./html-escape.mjs";

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

