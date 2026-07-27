/**
 * MvEI Workbench browser wiring for the static alpha shell.
 *
 * Why: the alpha surface must exercise the existing Motif and session helpers
 * rather than presenting controls that do not change the local document.
 */
import {
  addFromPalette,
  renderCanvasTilesHtmlA11y,
  setEditorMode,
} from "./canvas.mjs";
import { loadSession, saveSession } from "./session-store.mjs";

/** Read the initially rendered Motif document without adding a browser-only data format. */
export function readDocumentFromShell(document) {
  const meta = [...document.querySelectorAll("#document .meta")];
  const id = meta[0]?.querySelector("code")?.textContent?.trim();
  const profile = meta[1]?.querySelector("code")?.textContent?.trim();
  const completeness = meta[1]?.querySelectorAll("code")[1]?.textContent?.trim();
  if (!id || !profile || !completeness) {
    throw new Error("Workbench shell is missing Motif document metadata");
  }
  const items = [...document.querySelectorAll(".motif-tile")].map((tile, order) => ({
    id: tile.dataset.itemId,
    symbol: tile.querySelector(".motif-tile-symbol")?.textContent?.trim(),
    order,
  }));
  if (items.some((item) => !item.id || !item.symbol)) {
    throw new Error("Workbench shell contains an invalid Motif tile");
  }
  return {
    schemaVersion: "0.2.0",
    profile,
    id,
    completeness,
    items,
    annotationLinks: [],
  };
}

/** Replace the visible item count, semantic list, and canvas with the current Motif document. */
export function renderDocumentState(document, doc) {
  const count = document.querySelector("#document p:not(.meta) strong");
  if (count?.parentElement) {
    count.parentElement.textContent = `Items (${doc.items.length})`;
    count.parentElement.prepend(count);
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
  if (canvas) canvas.outerHTML = renderCanvasTilesHtmlA11y(doc);
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
export function initializeWorkbench(document, storage = globalThis.localStorage) {
  let doc = readDocumentFromShell(document);
  let session = { mode: "motif" };
  const announce = (message) => {
    const live = document.querySelector("#mvei-workbench-live");
    if (live) live.textContent = message;
  };

  for (const button of document.querySelectorAll("[data-mode]")) {
    button.addEventListener("click", () => {
      session = renderModeState(document, session, button.dataset.mode);
    });
  }
  for (const button of document.querySelectorAll("[data-symbol]")) {
    button.addEventListener("click", () => {
      doc = addFromPalette(doc, button.dataset.symbol);
      renderDocumentState(document, doc);
      announce(`Added ${button.dataset.symbol}. Motif now has ${doc.items.length} items.`);
    });
  }
  document.querySelector("[data-action='session-save']")?.addEventListener("click", () => {
    saveSession(storage, doc);
    announce("Saved Motif session to this browser.");
  });
  document.querySelector("[data-action='session-load']")?.addEventListener("click", () => {
    const restored = loadSession(storage);
    if (!restored) {
      announce("No saved Motif session is available in this browser.");
      return;
    }
    doc = restored;
    renderDocumentState(document, doc);
    announce(`Loaded Motif session with ${doc.items.length} items.`);
  });
  return {
    getDocument: () => doc,
    getSession: () => session,
  };
}

if (typeof document !== "undefined") initializeWorkbench(document);
