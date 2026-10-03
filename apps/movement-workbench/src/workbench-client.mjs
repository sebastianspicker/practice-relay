/**
 * MvEI Workbench browser wiring for the static alpha shell.
 *
 * Why: the alpha surface must exercise the existing Motif and session helpers
 * rather than presenting controls that do not change the local document.
 */
import {
  addFromPalette,
  navigateTiles,
  orderedItemIds,
  rovingTabindexState,
  setEditorMode,
  tileAriaLabel,
} from "./canvas.mjs";
import { loadMotif } from "./motif.mjs";
import { renderProjectionState } from "./projection.mjs";
import { loadSession, saveSession } from "./session-store.mjs";

/** Read the initially rendered Motif document without adding a browser-only data format. */
export function readDocumentFromShell(document) {
  const payload = document.querySelector("#motif-document");
  if (!payload) throw new Error("Workbench shell is missing its canonical Motif document");
  return loadMotif(payload.textContent);
}

/** Render the dynamic Motif canvas without parsing data-derived markup. */
export function renderCanvasTilesDom(document, canvas, doc, selectedId) {
  const stateById = new Map(
    rovingTabindexState(doc, selectedId).map((state) => [state.id, state]),
  );
  const tiles = [...doc.items]
    .sort((a, b) => a.order - b.order)
    .map((item) => {
      const state = stateById.get(item.id);
      const tile = document.createElement("div");
      const symbol = document.createElement("span");
      tile.setAttribute("class", "motif-tile");
      tile.setAttribute("role", "option");
      tile.setAttribute("tabindex", String(state?.tabIndex ?? -1));
      tile.dataset.itemId = item.id;
      tile.setAttribute("aria-label", tileAriaLabel(item));
      tile.setAttribute("aria-selected", String(state?.ariaSelected === true));
      symbol.setAttribute("class", "motif-tile-symbol");
      symbol.textContent = item.symbol;
      tile.append(symbol);
      return tile;
    });
  canvas.setAttribute("role", "listbox");
  canvas.setAttribute("aria-label", "Motif sequence");
  canvas.setAttribute("aria-orientation", "horizontal");
  canvas.replaceChildren(...tiles);
  if (tiles.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "No Motif items yet. Add a symbol from the palette.";
    canvas.append(empty);
  }
}

/** Replace the visible item count, semantic list, and canvas with the current Motif document. */
export function renderDocumentState(document, doc, selectedId) {
  for (const [id, value] of [["motif-id", doc.id], ["motif-title", doc.title ?? "Untitled"], ["motif-completeness", doc.completeness]]) {
    const field = document.querySelector(`#${id}`);
    if (field) field.textContent = value;
  }
  const count = document.querySelector("#document p:not(.meta) strong");
  const countContainer = count?.parentElement;
  if (countContainer) {
    countContainer.replaceChildren(count, ` (${doc.items.length})`);
  }
  const itemList = document.querySelector(".motif-items");
  if (itemList) {
    const items = doc.items.map((item) => {
      const entry = document.createElement("li");
      const id = document.createElement("code");
      id.textContent = item.id;
      entry.append(id, ` · ${item.symbol}${item.durationHint ? ` · ${item.durationHint}` : ""}`);
      return entry;
    });
    itemList.replaceChildren(...items);
  }
  const canvas = document.querySelector(".motif-canvas");
  if (canvas) renderCanvasTilesDom(document, canvas, doc, selectedId);
}

/** Apply an editor mode to the visible panels, buttons, and live region. */
export function renderModeState(document, session, mode) {
  const next = setEditorMode(session, mode, {
    announce: (text) => {
      const live = document.querySelector("#mvei-workbench-live");
      if (live) live.textContent = text;
    },
  });
  for (const button of document.querySelectorAll("[data-mode]")) {
    button.setAttribute("aria-pressed", String(button.dataset.mode === next.mode));
  }
  const motif = document.querySelector("#document");
  const laban = document.querySelector("#laban-subset");
  if (motif) motif.hidden = next.mode !== "motif";
  if (laban) laban.hidden = next.mode !== "laban-subset";
  return next;
}

/** Wire the shipped Workbench buttons to local Motif state and localStorage. */
export function initializeWorkbench(document, storage) {
  let doc = readDocumentFromShell(document);
  let session = {
    mode: document.querySelector('[data-mode][aria-pressed="true"]')?.dataset.mode ?? "motif",
    selectedId: orderedItemIds(doc)[0] ?? null,
  };
  const announce = (message) => {
    const live = document.querySelector("#mvei-workbench-live");
    if (live) live.textContent = message;
  };
  const refresh = () => {
    renderDocumentState(document, doc, session.selectedId);
    renderProjectionState(document, doc);
  };
  const select = (id) => {
    session = { ...session, selectedId: id };
    const canvas = document.querySelector(".motif-canvas");
    renderCanvasTilesDom(document, canvas, doc, id);
    [...canvas.children].find((tile) => tile.dataset.itemId === id)?.focus();
  };
  const canvas = document.querySelector(".motif-canvas");
  canvas?.addEventListener("click", (event) => {
    const tile = event.target.closest("[data-item-id]");
    if (tile && canvas.contains(tile)) select(tile.dataset.itemId);
  });
  canvas?.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    select(navigateTiles(doc, session.selectedId, event).selectedId);
  });
  for (const button of document.querySelectorAll("[data-mode]")) {
    button.addEventListener("click", () => {
      session = renderModeState(document, session, button.dataset.mode);
    });
  }
  for (const button of document.querySelectorAll("[data-symbol]")) {
    button.addEventListener("click", () => {
      doc = addFromPalette(doc, button.dataset.symbol);
      session = { ...session, selectedId: doc.items.at(-1).id };
      refresh();
      announce(`Added ${button.dataset.symbol}. Motif now has ${doc.items.length} items.`);
    });
  }
  const sessionAction = (action) => {
    try {
      const target = storage ?? globalThis.localStorage;
      if (action === "save") {
        saveSession(target, doc);
        announce("Saved Motif session to this browser.");
        return;
      }
      const restored = loadSession(target);
      if (!restored) {
        announce("No saved Motif session is available in this browser.");
        return;
      }
      doc = restored;
      session = { ...session, selectedId: orderedItemIds(doc)[0] ?? null };
      refresh();
      announce(`Loaded Motif session with ${doc.items.length} items.`);
    } catch (error) {
      announce(`Could not ${action} session: ${error.message}`);
    }
  };
  for (const action of ["save", "load"]) {
    document.querySelector(`[data-action='session-${action}']`)?.addEventListener("click", () => sessionAction(action));
  }
  refresh();
  session = renderModeState(document, session, session.mode);
  return { getDocument: () => doc, getSession: () => session };
}

if (typeof document !== "undefined") {
  try {
    initializeWorkbench(document);
  } catch (error) {
    const live = document.querySelector("#mvei-workbench-live");
    if (live) live.textContent = `Could not open Motif: ${error.message}`;
    for (const button of document.querySelectorAll("button")) button.disabled = true;
  }
}
