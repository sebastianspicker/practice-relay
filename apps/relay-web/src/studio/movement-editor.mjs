/** Bounded Motif phrase editor; state stays in memory until explicitly exported. */
import {
  appendMotifItem, createMotifHistory, loadMotif, moveMotifItem,
  parseTimeAnchor, removeMotifItem, updateMotifItem,
} from "@practice-relay/movement/browser/authoring";
import { MOTIF_SYMBOL_IDS } from "@practice-relay/movement/browser/vocabulary";
import { mountMovementTools } from "./movement-tools.mjs";

/** Mount a keyboard-accessible editor and return its isolated document lifecycle. */
export function mountMovementEditor(host, options) {
  const history = createMotifHistory(options.document);
  let selected = history.get().items.length > 1 ? 1 : 0;
  let invalid = null;
  let destroyed = false;
  let tools;
  host.classList.add("movement-editor");
  host.innerHTML = `<header class="motif-heading"><div><h2>Motif phrase</h2><p>An ordered sequence of movement symbols with time anchors (tMs).</p></div><span class="motif-completeness"></span></header>
    <div class="motif-sequence"><svg class="motif-arcs" viewBox="0 0 760 310" preserveAspectRatio="none" aria-hidden="true"><path d="M20 130 Q205 -90 410 140 T735 285 M75 288 Q210 282 380 123 T700 64"/><path class="dashed" d="M15 165 Q175 392 370 125 T742 78"/></svg><ol class="motif-items" aria-label="Motif phrase items"></ol></div>
    <div class="motif-properties"><section class="motif-item-properties"><h3>Selected item</h3><label><span>Symbol</span><select data-field="symbol"></select></label><label><span>Time anchor</span><span class="motif-anchor"><input data-field="time" type="text" inputmode="decimal" aria-label="Time anchor in milliseconds" placeholder="Not set"><span aria-hidden="true">ms</span></span></label><p class="motif-selection-empty" hidden>Select or add a symbol to begin.</p></section><section><h3>Document</h3><label class="motif-document-label"><span>Completeness</span><select data-field="completeness"><option value="sketch">Sketch</option><option value="partial">Partial</option><option value="complete">Complete</option></select></label><p class="motif-help">Partial documents can be valid.</p></section></div>
    <p class="motif-validation" role="status" aria-live="polite"></p><div class="motif-tools-host"></div>`;
  const query = (selector) => host.querySelector(selector);
  const symbol = query('[data-field="symbol"]');
  const time = query('[data-field="time"]');
  const completeness = query('[data-field="completeness"]');
  MOTIF_SYMBOL_IDS.forEach((id) => {
    const option = host.ownerDocument.createElement("option");
    option.value = id; option.textContent = id.replaceAll("_", " "); symbol.append(option);
  });

  function status(error) {
    invalid = error;
    const document = history.get();
    const errors = error ? [error.message] : [];
    const message = error ? error.message : `Valid ${document.completeness} document`;
    query(".motif-validation").textContent = message;
    query(".motif-validation").classList.toggle("is-error", !!error);
    time.setAttribute("aria-invalid", String(!!error));
    tools?.setValid(!error);
    options.onStatus?.({ valid: !error, errors, message });
    return { valid: !error, errors };
  }

  function publish(error = null) {
    options.onChange?.(history.get(), status(error));
  }

  function renderItems(document) {
    const list = query(".motif-items"); list.replaceChildren();
    const ordered = document.items.map((item, index) => ({ item, index }))
      .sort((a, b) => a.item.order - b.item.order);
    ordered.forEach(({ item, index }, order) => {
      const li = host.ownerDocument.createElement("li");
      const button = host.ownerDocument.createElement("button");
      button.type = "button"; button.className = "motif-tile";
      button.setAttribute("aria-pressed", String(index === selected));
      const parts = [String(order + 1).padStart(2, "0"), item.symbol.replaceAll("_", " "), item.timeAnchor?.tMs === undefined ? "No time anchor" : `${item.timeAnchor.tMs} ms`];
      parts.forEach((text) => { const span = host.ownerDocument.createElement("span"); span.textContent = text; button.append(span); });
      button.addEventListener("click", () => {
        if (invalid) { time.focus(); return; }
        selected = index; render(); options.onSelect?.(structuredClone(item));
        queryAllTiles()[order]?.focus();
      });
      li.append(button); list.append(li);
    });
    if (!ordered.length) {
      const empty = host.ownerDocument.createElement("li");
      empty.className = "motif-empty"; empty.textContent = "Your phrase is empty. Add a symbol in Document tools."; list.append(empty);
    }
  }

  function queryAllTiles() { return host.querySelectorAll(".motif-tile"); }

  function render() {
    const document = history.get();
    if (!document.items[selected]) selected = Math.max(0, document.items.length - 1);
    const item = document.items[selected];
    renderItems(document);
    query(".motif-completeness").textContent = `Completeness: ${document.completeness}`;
    symbol.disabled = !item; time.disabled = !item;
    symbol.value = item?.symbol ?? ""; time.value = item?.timeAnchor?.tMs ?? "";
    completeness.value = document.completeness;
    query(".motif-selection-empty").hidden = !!item;
    tools.refresh(document, { selected, canUndo: history.canUndo(), canRedo: history.canRedo() });
    status(null);
  }

  function commit(operation) {
    try { history.push(operation(history.get())); render(); publish(); }
    catch (error) { publish(error); }
  }

  symbol.addEventListener("change", () => {
    if (invalid) { symbol.value = history.get().items[selected]?.symbol ?? ""; time.focus(); return; }
    commit((document) => updateMotifItem(document, selected, { symbol: symbol.value }));
  });
  time.addEventListener("input", () => {
    try {
      const tMs = parseTimeAnchor(time.value);
      const document = history.get();
      const anchor = { ...document.items[selected].timeAnchor };
      if (tMs === undefined) delete anchor.tMs; else anchor.tMs = tMs;
      history.push(updateMotifItem(document, selected, { timeAnchor: anchor }));
      renderItems(history.get());
      tools.refresh(history.get(), { selected, canUndo: history.canUndo(), canRedo: history.canRedo() });
      publish();
    } catch (error) { publish(error); }
  });
  completeness.addEventListener("change", () => {
    if (invalid) { completeness.value = history.get().completeness; time.focus(); return; }
    commit((document) => loadMotif({ ...document, completeness: completeness.value }));
  });

  tools = mountMovementTools(query(".motif-tools-host"), {
    getDocument: () => history.get(),
    isValid: () => !invalid,
    onError: (error) => publish(error),
    onImport(document) { if (destroyed) return; history.push(document); selected = document.items.length > 1 ? 1 : 0; render(); publish(); },
    onAction(action) {
      if (action === "undo" || action === "redo") {
        const identity = history.get().items[selected]?.id;
        const restored = history[action]();
        const position = restored.items.findIndex((item) => item.id === identity);
        if (position >= 0) selected = position;
        render(); publish(); return;
      }
      if (invalid) { time.focus(); return; }
      if (action === "add") commit((document) => { const next = appendMotifItem(document, crypto.randomUUID()); selected = next.items.length - 1; return next; });
      if (action === "remove") commit((document) => removeMotifItem(document, selected));
      if (action === "earlier" || action === "later") commit((document) => {
        const item = document.items[selected];
        const next = moveMotifItem(document, selected, action === "earlier" ? -1 : 1);
        selected = next.items.findIndex((entry) => entry.id === item.id); return next;
      });
    },
  });
  render();
  return {
    getDocument: () => history.get(),
    setDocument(document) { history.reset(document); selected = document.items.length > 1 ? 1 : 0; render(); },
    destroy() { destroyed = true; tools.destroy(); host.replaceChildren(); host.classList.remove("movement-editor"); },
  };
}
