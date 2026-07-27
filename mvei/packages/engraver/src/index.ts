/**
 * @practice-relay/mvei-engraver - second MvEI implementation (SVG engraver ≠ Workbench UI).
 *
 * Addresses academic kill path: schema + single UI only.
 */
import { renderGlyphSvg, getGlyph } from "@practice-relay/mvei-glyph-font";

/** A Motif token and its deterministic position in an engraving. */
export interface EngraveMotifItem {
  id: string;
  symbol: string;
  order: number;
}

/** The Motif document shape accepted by the SVG engraver. */
export interface EngraveMotifDoc {
  profile: string;
  id: string;
  title?: string;
  items: EngraveMotifItem[];
}

/** Rendering controls for staff layout and glyph styling. */
export interface EngraveOptions {
  /** Max glyph tiles per staff row before wrapping (default 8). */
  maxPerRow?: number;
  /** Cell width/height in px (default 64 - richer spacing ladder). */
  cellSize?: number;
  /** Show staff barlines between cells (default true). */
  barlines?: boolean;
  /** Show order index under symbol label (default true). */
  showOrder?: boolean;
  /** Stroke colour for glyph paths (default #1a1a1a). */
  stroke?: string;
}

/** Fully resolved SVG geometry shared by cells, guides, and the document shell. */
interface EngravingLayout {
  cell: number;
  maxPerRow: number;
  barlines: boolean;
  showOrder: boolean;
  stroke: string;
  padX: number;
  titleH: number;
  gap: number;
  tile: number;
  rows: number;
  cols: number;
  stride: number;
  width: number;
  rowH: number;
  height: number;
  title: string;
  baselineY: number;
  glyphX: number;
  glyphY: number;
  glyphInner: number;
}

type EngraveValue = { [key: string]: unknown };

/**
 * Render Motif document to a multi-row staff of SVG glyphs.
 * Longer motifs wrap to additional rows (engraving quality ladder).
 * Richer glyphs: consistent cell gap, shared baseline y, centred glyph box, order labels.
 */
export function renderMotifToSvg(
  doc: EngraveMotifDoc,
  opts: EngraveOptions = {},
): string {
  validateEngraveDocument(doc);
  validateEngraveOptions(opts);
  const items = [...doc.items].sort((a, b) => a.order - b.order);
  const layout = createEngravingLayout(doc, opts, items);
  const cells = renderEngravingCells(items, layout);
  const guides = renderEngravingGuides(layout);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" role="img" aria-label="${layout.title}">
  <title>${layout.title}</title>
  <rect width="100%" height="100%" fill="#faf8f4"/>
  <text x="${layout.padX}" y="${layout.titleH - 2}" font-size="12" fill="#222" font-family="system-ui,sans-serif" font-weight="600">${layout.title}</text>
  ${guides}
  ${cells}
</svg>`;
}

/** Resolve the validated cell option while retaining the public default and minimum. */
function resolveCellSize(opts: EngraveOptions): number {
  return Math.max(48, safePositiveNumber(opts.cellSize ?? 64, "cellSize"));
}

/** Resolve the validated wrapping option while retaining the public default. */
function resolveMaxPerRow(opts: EngraveOptions): number {
  return Math.max(1, safePositiveInteger(opts.maxPerRow ?? 8, "maxPerRow"));
}

/** Derive item-count-dependent geometry independently from rendering options. */
function resolveEngravingDimensions(cell: number, maxPerRow: number, itemCount: number) {
  const tile = cell - 8;
  const rows = Math.max(1, Math.ceil(itemCount / maxPerRow) || 1);
  const cols = Math.min(itemCount || 1, maxPerRow);
  return { tile, rows, cols };
}

/** Render positioned glyph tiles after layout metrics have been resolved. */
function renderEngravingCells(items: EngraveMotifItem[], layout: EngravingLayout): string {
  return items.map((item, index) => renderEngravingCell(item, index, layout)).join("\n");
}

/** Render one Motif glyph tile with its fixed baseline and optional order label. */
function renderEngravingCell(item: EngraveMotifItem, index: number, layout: EngravingLayout): string {
  const glyph = getGlyph(item.symbol);
  const row = Math.floor(index / layout.maxPerRow);
  const col = index % layout.maxPerRow;
  const x = layout.padX + col * layout.stride;
  const y = layout.titleH + 10 + row * layout.rowH;
  const paths = glyph.paths.map((path) => `<path d="${path}" fill="none" stroke="${layout.stroke}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
  const order = layout.showOrder ? `<text x="${layout.tile / 2}" y="${layout.tile + 18}" text-anchor="middle" font-size="8" fill="#666" data-order="${item.order}">${item.order}</text>` : "";
  return `<g transform="translate(${x},${y})" data-item-id="${escapeXml(item.id)}" data-row="${row}" data-col="${col}" data-symbol="${escapeXml(item.symbol)}"><rect width="${layout.tile}" height="${layout.tile}" rx="6" fill="${tileFill(item.symbol)}" stroke="#b8b0a0" stroke-width="1.2"/><line x1="8" y1="${layout.baselineY}" x2="${layout.tile - 8}" y2="${layout.baselineY}" stroke="#d8d0c0" stroke-width="1" data-baseline="1"/><svg x="${layout.glyphX}" y="${layout.glyphY}" width="${layout.glyphInner}" height="${layout.glyphInner}" viewBox="${glyph.viewBox}" data-glyph-box="1">${paths}</svg><text x="${layout.tile / 2}" y="${layout.tile + 8}" text-anchor="middle" font-size="9" fill="#333" font-family="system-ui,sans-serif" data-symbol-label="1">${escapeXml(item.symbol)}</text>${order}</g>`;
}

/** Render staff baselines and any requested vertical barlines for every row. */
function renderEngravingGuides(layout: EngravingLayout): string {
  return Array.from({ length: layout.rows }, (_, row) => renderEngravingGuideRow(row, layout)).join("\n");
}

/** Render one staff baseline and its optional column dividers. */
function renderEngravingGuideRow(row: number, layout: EngravingLayout): string {
  const y0 = layout.titleH + 10 + row * layout.rowH;
  const yBase = y0 + layout.baselineY;
  const yBottom = y0 + layout.tile;
  const x2 = layout.padX + layout.cols * layout.stride - layout.gap - (layout.cell - layout.tile);
  return `<line x1="${layout.padX}" y1="${yBase}" x2="${x2}" y2="${yBase}" stroke="#e0dcd0" stroke-width="1" data-staff-row="${row}" data-staff-baseline="1"/>
${renderEngravingBarlines(row, y0, yBottom, layout)}`;
}

/** Render vertical dividers only for multi-column rows with barlines enabled. */
function renderEngravingBarlines(
  row: number,
  y0: number,
  yBottom: number,
  layout: EngravingLayout,
): string {
  if (!layout.barlines || layout.cols <= 1) return "";
  return Array.from({ length: layout.cols - 1 }, (_, column) => {
    const x = layout.padX + (column + 1) * layout.stride - layout.gap / 2;
    return `<line x1="${x}" y1="${y0 + 2}" x2="${x}" y2="${yBottom}" stroke="#cfc6b4" stroke-width="1" stroke-dasharray="2 3" data-barline="${row}-${column}"/>`;
  }).join("\n");
}

/**
 * Print path: wrap Motif SVG for print/PDF pipeline (browser print or external PDF).
 * Returns standalone HTML document suitable for window.print().
 */
export function renderMotifPrintHtml(
  doc: EngraveMotifDoc,
  opts: EngraveOptions = {},
): string {
  const svg = renderMotifToSvg(doc, opts);
  const title = escapeXml(doc.title ?? doc.id);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title} - MvEI Workbench print</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 1.5rem; color: #111; }
    h1 { font-size: 1.1rem; }
    .meta { color: #555; font-size: 0.9rem; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p class="meta">MvEI Motif engraving (MVP SVG) · not LabanWriter parity · not first-browser-Laban</p>
  ${svg}
  <p><button onclick="window.print()">Print / Save as PDF</button></p>
</body>
</html>`;
}

/** Validate the required document fields before accessing Motif items. */
function validateEngraveDocumentFields(value: EngraveValue): void {
  if (value.profile !== "mvei-motif") {
    throw new TypeError('engraver document profile must be "mvei-motif"');
  }
  if (typeof value.id !== "string" || value.id.trim().length === 0) {
    throw new TypeError("engraver document id must be a non-empty string");
  }
  if (value.title !== undefined && typeof value.title !== "string") {
    throw new TypeError("engraver document title must be a string when provided");
  }
  if (!Array.isArray(value.items)) {
    throw new TypeError("engraver document items must be an array");
  }
}

/** Validate every Motif item after the document array boundary is established. */
function validateEngraveItems(items: unknown[]): void {
  items.forEach((item, index) => validateEngraveItem(item, index));
}

/** Validate one Motif item while retaining its source position in errors. */
function validateEngraveItem(item: unknown, index: number): void {
  if (item === null || typeof item !== "object" || Array.isArray(item)) {
    throw new TypeError(`engraver item ${index} must be an object`);
  }
  const motifItem = item as EngraveValue;
  if (typeof motifItem.id !== "string" || motifItem.id.trim().length === 0) {
    throw new TypeError(`engraver item ${index} id must be a non-empty string`);
  }
  if (typeof motifItem.symbol !== "string" || motifItem.symbol.trim().length === 0) {
    throw new TypeError(`engraver item ${index} symbol must be a non-empty string`);
  }
  safeNonNegativeInteger(motifItem.order, `engraver item ${index} order`);
}

/** Validate the optional SVG stroke override. */
function validateEngraveStrokeOption(value: EngraveValue): void {
  if (value.stroke !== undefined && typeof value.stroke !== "string") {
    throw new TypeError("stroke must be a string when provided");
  }
}

/** Ensure a layout dimension cannot produce invalid SVG geometry. */
function safePositiveNumber(value: unknown, name: string): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > Number.MAX_SAFE_INTEGER
  ) {
    throw new RangeError(`${name} must be a finite positive number`);
  }
  return value;
}

/** Ensure a row count remains a safe integer for layout iteration. */
function safePositiveInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite positive integer`);
  }
  return value;
}

/** Ensure order labels and sort keys remain deterministic SVG-safe integers. */
function safeNonNegativeInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a finite non-negative integer`);
  }
  return value;
}

const TILE_FILL_BY_SYMBOL = new Map<string, string>([
  ["walk", "#eef4ea"], ["run", "#eef4ea"], ["travel", "#eef4ea"],
  ["turn", "#eef0f8"], ["twist", "#eef0f8"],
  ["stillness", "#f4f0e8"], ["balance", "#f4f0e8"],
  ["jump", "#f5f0e4"], ["fall", "#f5f0e4"], ["rise", "#f5f0e4"],
]);
const TILE_FILL_BY_PREFIX = [["gesture", "#f0eaf4"], ["effort", "#f8ece8"], ["phrase", "#e8eef4"]] as const;

/** Validate the public document boundary before accessing or sorting Motif items. */
const validateEngraveDocument: (doc: unknown) => asserts doc is EngraveMotifDoc = (doc) => {
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    throw new TypeError("engraver document must be a non-null object");
  }
  const value = doc as EngraveValue;
  validateEngraveDocumentFields(value);
  validateEngraveItems(value.items as unknown[]);
};

/** Validate optional numeric layout inputs against their existing constraints. */
const validateEngraveNumberOptions = (value: EngraveValue): void => {
  if (value.cellSize !== undefined) safePositiveNumber(value.cellSize, "cellSize");
  if (value.maxPerRow !== undefined) safePositiveInteger(value.maxPerRow, "maxPerRow");
};

/** Validate optional boolean rendering controls. */
const validateEngraveBooleanOptions = (value: EngraveValue): void => {
  if (value.barlines !== undefined && typeof value.barlines !== "boolean") {
    throw new TypeError("barlines must be a boolean when provided");
  }
  if (value.showOrder !== undefined && typeof value.showOrder !== "boolean") {
    throw new TypeError("showOrder must be a boolean when provided");
  }
};

/** Resolve validated options into deterministic dimensions and glyph positions. */
function createEngravingLayout(
  doc: EngraveMotifDoc,
  opts: EngraveOptions,
  items: EngraveMotifItem[],
): EngravingLayout {
  const cell = resolveCellSize(opts);
  const maxPerRow = resolveMaxPerRow(opts);
  const barlines = opts.barlines !== false;
  const showOrder = opts.showOrder !== false;
  const stroke = escapeXml(opts.stroke ?? "#1a1a1a");
  const dimensions = resolveEngravingDimensions(cell, maxPerRow, items.length);
  const padX = 12;
  const titleH = 20;
  const gap = 4; // consistent inter-cell gap for spacing quality
  const tile = dimensions.tile;
  const rows = dimensions.rows;
  const cols = dimensions.cols;
  const stride = cell + gap;
  const width = Math.max(cell + padX * 2, padX * 2 + cols * stride - gap);
  const labelBand = 22; // symbol label + order under baseline
  const rowH = tile + labelBand + 10;
  const height = titleH + 10 + rows * rowH + 10;
  const title = escapeXml(doc.title ?? doc.id);
  // Fixed glyph box: 50% of tile, vertically centred above a shared baseline
  const glyphInner = Math.round(tile * 0.5);
  const baselineY = Math.round(tile * 0.78); // shared baseline inside each tile
  const glyphX = Math.round((tile - glyphInner) / 2);
  const glyphY = Math.round(baselineY - glyphInner - 2);
  return { cell, maxPerRow, barlines, showOrder, stroke, padX, titleH, gap, tile, rows, cols, stride, width, rowH, height, title, baselineY, glyphX, glyphY, glyphInner };
}

/** Soft tile background by Motif family (engraving quality cue). */
const tileFill = (symbol: string): string => {
  return TILE_FILL_BY_SYMBOL.get(symbol)
    ?? TILE_FILL_BY_PREFIX.find(([prefix]) => symbol.startsWith(prefix))?.[1]
    ?? "#f7f5f0";
};

/** Escape untrusted text before placing it in SVG or HTML markup. */
const escapeXml = (value: unknown): string => {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

/** Validate option primitives so malformed callers cannot create invalid SVG geometry. */
const validateEngraveOptions: (opts: unknown) => asserts opts is EngraveOptions = (opts) => {
  if (opts === null || typeof opts !== "object" || Array.isArray(opts)) {
    throw new TypeError("engraver options must be an object");
  }
  const value = opts as EngraveValue;
  validateEngraveNumberOptions(value);
  validateEngraveBooleanOptions(value);
  validateEngraveStrokeOption(value);
};

export { renderGlyphSvg };
