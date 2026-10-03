/** Manual document tools and a read-only projection with explicit provenance. */
import { emitMotif, loadMotif, MAX_MOTIF_BYTES } from "@practice-relay/movement/browser/authoring";
import { motifToLabanSubset } from "@practice-relay/movement/browser/transforms";

/** Mount optional operations without browser persistence or background network activity. */
export function mountMovementTools(host, options) {
  let disposed = false;
  host.innerHTML = `<details class="motif-tools"><summary>Document tools</summary><div class="motif-tool-actions"><button type="button" data-action="add">Add symbol</button><button type="button" data-action="remove">Remove selected</button><button type="button" data-action="earlier">Move earlier</button><button type="button" data-action="later">Move later</button><button type="button" data-action="undo">Undo</button><button type="button" data-action="redo">Redo</button></div><div class="motif-file-actions"><label>Import Motif JSON<input type="file" accept=".json,application/json"></label><button type="button" data-export>Export Motif JSON</button></div><p class="motif-import-status" role="status"></p><p class="motif-help">Files up to 2 MiB. Changes stay in this workspace until you export or use them in a handoff.</p><details class="motif-projection"><summary>Pedagogical Laban projection · read-only</summary><p>This is a lossy teaching projection, not full professional Labanotation. Source Motif remains the editable document.</p><ul class="motif-projection-warnings"></ul><pre aria-label="Laban projection with provenance"></pre></details></details>`;
  host.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => options.onAction(button.dataset.action));
  });
  host.querySelector("[data-export]").addEventListener("click", () => {
    if (!options.isValid()) return;
    const blob = new Blob([emitMotif(options.getDocument())], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = host.ownerDocument.createElement("a");
    link.href = url; link.download = "movement.motif.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const input = host.querySelector('input[type="file"]');
  input.addEventListener("change", async () => {
    const file = input.files?.[0]; if (!file) return;
    const message = host.querySelector(".motif-import-status");
    input.disabled = true; message.textContent = "Reading Motif document…";
    try {
      if (file.size > MAX_MOTIF_BYTES) throw new Error("Motif files must be 2 MiB or smaller.");
      const document = loadMotif(await file.text());
      if (disposed) return;
      options.onImport(document); message.textContent = `Imported ${file.name}.`;
    } catch (error) {
      if (!disposed) message.textContent = `Import failed: ${error.message} Current document retained.`;
    } finally { if (!disposed) { input.disabled = false; input.value = ""; } }
  });
  return {
    setValid(valid) { host.querySelector("[data-export]").disabled = !valid; },
    refresh(document, state) {
      host.querySelector('[data-action="undo"]').disabled = !state.canUndo;
      host.querySelector('[data-action="redo"]').disabled = !state.canRedo;
      host.querySelector('[data-action="remove"]').disabled = !document.items.length;
      const ordered = document.items.map((item, index) => ({ item, index })).sort((a, b) => a.item.order - b.item.order);
      const position = ordered.findIndex(({ index }) => index === state.selected);
      host.querySelector('[data-action="earlier"]').disabled = position <= 0;
      host.querySelector('[data-action="later"]').disabled = position < 0 || position === ordered.length - 1;
      const projection = motifToLabanSubset({ ...document, items: ordered.map(({ item }) => item) });
      const warnings = host.querySelector(".motif-projection-warnings"); warnings.replaceChildren();
      for (const warning of projection.migrationProvenance?.warnings ?? []) {
        const li = host.ownerDocument.createElement("li"); li.textContent = warning; warnings.append(li);
      }
      host.querySelector("pre").textContent = JSON.stringify(projection, null, 2);
    },
    destroy() { disposed = true; },
  };
}
