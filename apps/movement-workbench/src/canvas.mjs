/**
 * MvEI Workbench Motif canvas model: palette, glyph tiles, a11y helpers.
 */
import { appendMotifItem } from "@practice-relay/movement/browser/authoring";
import { escapeHtml } from "./html-escape.mjs";
import { MOTIF_SYMBOL_IDS } from "@practice-relay/movement/browser/vocabulary";

/** Ordered palette derived from the shared controlled Motif vocabulary. */
export const MOTIF_PALETTE = MOTIF_SYMBOL_IDS;

/**
 * @param {import("@practice-relay/movement").MotifDocument} doc
 * @param {string} symbol
 */
export function addFromPalette(doc, symbol) {
  if (!MOTIF_PALETTE.includes(symbol)) {
    throw new Error(`symbol not in palette: ${symbol}`);
  }
  const id = `i-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  return appendMotifItem(doc, id, symbol);
}

/**
 * Accessible name for a Motif canvas tile.
 * @param {{ id: string, symbol: string, order: number }} item
 */
export function tileAriaLabel(item) {
  return `Motif symbol ${item.symbol}, order ${item.order}, id ${item.id}`;
}

/**
 * Palette control HTML (keyboard-activatable button with focus styles hook).
 * @param {string} symbol
 */
export function renderPaletteButtonHtml(symbol) {
  if (!MOTIF_PALETTE.includes(symbol)) {
    throw new Error(`symbol not in palette: ${symbol}`);
  }
  return `<button type="button" class="palette-btn" data-symbol="${escapeHtml(symbol)}" aria-label="Add ${escapeHtml(symbol)} to Motif" title="${escapeHtml(symbol)}">${escapeHtml(symbol)}</button>`;
}

/**
 * Human-readable announcement for editor mode changes (aria-live).
 * @param {"motif"|"laban-subset"} mode
 * @returns {string}
 */
export function modeAnnouncement(mode) {
  if (mode === "laban-subset") {
    return "Editor mode: laban-subset staff. Pedagogical multi-column staff: not professional Labanotation density.";
  }
  return "Editor mode: Motif canvas. Sequence tiles with controlled vocabulary.";
}

/**
 * Toggle laban-subset mode flag on a session object (products stay separate).
 * Announces mode changes for full-workflow a11y (aria-live consumers).
 * @param {{ mode?: string, lastAnnouncement?: string }} session
 * @param {"motif"|"laban-subset"} mode
 * @param {{ announce?: (text: string) => void }} [opts]
 */
export function setEditorMode(session, mode, opts = {}) {
  if (mode !== "motif" && mode !== "laban-subset") {
    throw new Error(`unsupported mode: ${mode}`);
  }
  const announcement = modeAnnouncement(mode);
  const prev = session?.mode;
  if (prev !== mode && typeof opts.announce === "function") {
    opts.announce(announcement);
  }
  return { ...session, mode, lastAnnouncement: announcement };
}

/**
 * Ordered item ids for canvas navigation (by order).
 * @param {import("@practice-relay/movement").MotifDocument} doc
 * @returns {string[]}
 */
export function orderedItemIds(doc) {
  return [...doc.items].sort((a, b) => a.order - b.order).map((i) => i.id);
}

/**
 * Roving tabindex model: only selected (or first) tile is tab stop.
 * @param {import("@practice-relay/movement").MotifDocument} doc
 * @param {string | null | undefined} selectedId
 * @returns {Array<{ id: string, tabIndex: number, ariaSelected: boolean }>}
 */
export function rovingTabindexState(doc, selectedId) {
  const ids = orderedItemIds(doc);
  if (ids.length === 0) return [];
  const sel =
    selectedId && ids.includes(selectedId) ? selectedId : ids[0];
  return ids.map((id) => ({
    id,
    tabIndex: id === sel ? 0 : -1,
    ariaSelected: id === sel,
  }));
}

/**
 * Keyboard navigation between tiles (ArrowLeft/Right/Home/End).
 * @param {import("@practice-relay/movement").MotifDocument} doc
 * @param {string | null | undefined} selectedId
 * @param {{ key?: string }} event
 * @returns {{ selectedId: string | null, changed: boolean }}
 */
export function navigateTiles(doc, selectedId, event) {
  const ids = orderedItemIds(doc);
  if (ids.length === 0) return { selectedId: null, changed: false };
  const idx = selectedTileIndex(ids, selectedId);
  const next = tileNavigationIndex(ids.length, idx, event?.key ?? "");
  if (next === null) return { selectedId: ids[idx], changed: false };
  return { selectedId: ids[next], changed: next !== idx || selectedId !== ids[next] };
}

/** Resolve an existing tile selection to a safe position in the ordered id list. */
function selectedTileIndex(ids, selectedId) {
  const index = selectedId ? ids.indexOf(selectedId) : 0;
  return index < 0 ? 0 : index;
}

/** Map supported navigation keys to their bounded next tile index. */
function tileNavigationIndex(length, index, key) {
  if (key === "ArrowRight" || key === "ArrowDown") return Math.min(length - 1, index + 1);
  if (key === "ArrowLeft" || key === "ArrowUp") return Math.max(0, index - 1);
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  return null;
}

/**
 * Canvas tile HTML with aria-selected + roving tabindex.
 * @param {{ id: string, symbol: string, order: number }} item
 * @param {{ selected?: boolean, tabIndex?: number }} [opts]
 */
export function renderTileHtmlA11y(item, opts = {}) {
  const label = tileAriaLabel(item);
  const selected = opts.selected === true;
  const tabIndex = opts.tabIndex ?? (selected ? 0 : -1);
  return `<div class="motif-tile" role="option" tabindex="${tabIndex}" data-item-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(label)}" aria-selected="${selected ? "true" : "false"}"><span class="motif-tile-symbol">${escapeHtml(item.symbol)}</span></div>`;
}

/**
 * Accessible listbox canvas with roving tabindex + aria-selected.
 * @param {import("@practice-relay/movement").MotifDocument} doc
 * @param {string | null | undefined} [selectedId]
 */
export function renderCanvasTilesHtmlA11y(doc, selectedId) {
  const state = rovingTabindexState(doc, selectedId);
  const byId = new Map(state.map((s) => [s.id, s]));
  const tiles = [...doc.items]
    .sort((a, b) => a.order - b.order)
    .map((item) => {
      const st = byId.get(item.id);
      return renderTileHtmlA11y(item, {
        selected: st?.ariaSelected,
        tabIndex: st?.tabIndex,
      });
    })
    .join("\n");
  return `<div class="motif-canvas" role="listbox" aria-label="Motif sequence" aria-orientation="horizontal">${tiles}</div>`;
}
