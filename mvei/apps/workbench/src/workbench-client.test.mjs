/** Tests for the browser-state helpers behind the Workbench alpha controls. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createSketchMotif } from "./motif.mjs";
import { renderDocumentState, renderModeState } from "./workbench-client.mjs";

function createModeDocument() {
  const live = { textContent: "" };
  const motif = { hidden: false };
  const laban = { hidden: true };
  const buttons = [
    { dataset: { mode: "motif" }, attributes: new Map(), setAttribute(key, value) { this.attributes.set(key, value); } },
    { dataset: { mode: "laban-subset" }, attributes: new Map(), setAttribute(key, value) { this.attributes.set(key, value); } },
  ];
  return {
    querySelector(selector) {
      return {
        "#mvei-workbench-live": live,
        "#document": motif,
        "#laban-subset": laban,
      }[selector] ?? null;
    },
    querySelectorAll(selector) {
      return selector === "[data-mode]" ? buttons : [];
    },
    live,
    motif,
    laban,
    buttons,
  };
}

test("mode rendering exposes the selected panel and announces the change", () => {
  const document = createModeDocument();
  const next = renderModeState(document, { mode: "motif" }, "laban-subset");
  assert.equal(next.mode, "laban-subset");
  assert.equal(document.motif.hidden, true);
  assert.equal(document.laban.hidden, false);
  assert.equal(document.buttons[0].attributes.get("aria-pressed"), "false");
  assert.equal(document.buttons[1].attributes.get("aria-pressed"), "true");
  assert.match(document.live.textContent, /laban-subset staff/);
});

test("mode rendering does not announce a repeated mode selection", () => {
  const document = createModeDocument();
  document.live.textContent = "existing announcement";
  const next = renderModeState(document, { mode: "motif" }, "motif");
  assert.equal(next.mode, "motif");
  assert.equal(document.live.textContent, "existing announcement");
  assert.deepEqual(createSketchMotif("local-test").items, []);
});

test("document rendering keeps the semantic item list aligned with the canvas", () => {
  const list = { children: [], replaceChildren(...children) { this.children = children; } };
  const canvas = { outerHTML: "" };
  const countParent = { textContent: "", prepend() {} };
  const count = { parentElement: countParent };
  const document = {
    querySelector(selector) {
      return { ".motif-items": list, ".motif-canvas": canvas, "#document p:not(.meta) strong": count }[selector] ?? null;
    },
    createElement(tagName) {
      return { tagName, textContent: "", children: [], append(...children) { this.children.push(...children); } };
    },
  };
  renderDocumentState(document, {
    items: [{ id: "i7", symbol: "run", durationHint: "2 counts", order: 0 }],
  });
  assert.equal(countParent.textContent, "Items (1)");
  assert.equal(list.children.length, 1);
  assert.deepEqual(list.children[0].children.map((child) => child.textContent ?? child), ["i7", " · run · 2 counts"]);
  assert.match(canvas.outerHTML, /data-item-id="i7"/);
});
