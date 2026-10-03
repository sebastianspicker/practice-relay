/** Dependency-free DOM regression proof for dynamic Motif canvas rendering. */
import assert from "node:assert/strict";
import {
  renderCanvasTilesDom,
  renderDocumentState,
} from "../src/workbench-client.mjs";

class FakeText {
  constructor(text) {
    this.data = String(text);
    this.parentElement = null;
  }

  get textContent() {
    return this.data;
  }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.parentElement = null;
    this.children = [];
    this.attributes = new Map();
    this.dataset = new Proxy({}, {
      set: (_target, key, value) => {
        this.setAttribute(`data-${String(key).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`, value);
        return true;
      },
    });
  }

  set textContent(value) {
    this.replaceChildren(new FakeText(value));
  }

  set innerHTML(_value) {
    throw new Error("HTML parsing is forbidden in the Workbench DOM renderer");
  }

  set outerHTML(_value) {
    throw new Error("HTML replacement is forbidden in the Workbench DOM renderer");
  }

  get textContent() {
    return this.children.map((child) => child.textContent).join("");
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  insertAdjacentHTML() {
    throw new Error("adjacent HTML parsing is forbidden in the Workbench DOM renderer");
  }

  append(...nodes) {
    this.replaceChildren(...this.children, ...nodes);
  }

  prepend(...nodes) {
    this.replaceChildren(...nodes, ...this.children);
  }

  replaceChildren(...nodes) {
    for (const child of this.children) child.parentElement = null;
    this.children = nodes.map((node) => typeof node === "string" ? new FakeText(node) : node);
    for (const child of this.children) child.parentElement = this;
  }
}

function createFakeDocument() {
  const countContainer = new FakeElement("p");
  const count = new FakeElement("strong");
  count.textContent = "Items";
  countContainer.append(count, " (0)");
  const itemList = new FakeElement("ul");
  const canvas = new FakeElement("div");
  canvas.setAttribute("class", "motif-canvas");
  return {
    canvas,
    countContainer,
    createElement(tagName) {
      return new FakeElement(tagName);
    },
    querySelector(selector) {
      if (selector === "#document p:not(.meta) strong") return count;
      if (selector === ".motif-items") return itemList;
      if (selector === ".motif-canvas") return canvas;
      return null;
    },
  };
}

function assertCanvasStructure(canvas, expectedIds, selectedId) {
  assert.equal(canvas.getAttribute("role"), "listbox");
  assert.equal(canvas.getAttribute("aria-label"), "Motif sequence");
  assert.equal(canvas.getAttribute("aria-orientation"), "horizontal");
  assert.deepEqual(canvas.children.map((tile) => tile.getAttribute("data-item-id")), expectedIds);
  assert.deepEqual(canvas.children.map((tile) => tile.tagName), ["DIV", "DIV", "DIV"]);
  assert.deepEqual(canvas.children.map((tile) => tile.getAttribute("class")), ["motif-tile", "motif-tile", "motif-tile"]);
  assert.deepEqual(canvas.children.map((tile) => tile.getAttribute("role")), ["option", "option", "option"]);
  assert.deepEqual(canvas.children.map((tile) => tile.getAttribute("aria-selected")), expectedIds.map((id) => String(id === selectedId)));
  assert.deepEqual(canvas.children.map((tile) => tile.getAttribute("tabindex")), expectedIds.map((id) => id === selectedId ? "0" : "-1"));
  assert.ok(canvas.children.every((tile) => tile.children.length === 1));
  assert.ok(canvas.children.every((tile) => tile.children[0].tagName === "SPAN"));
  assert.ok(canvas.children.every((tile) => tile.children[0].getAttribute("class") === "motif-tile-symbol"));
}

function verifyDynamicCanvasDomRendering() {
  const hostileId = '"><img src=x onerror="globalThis.compromised=true">';
  const hostileSymbol = '</span><svg onload="globalThis.compromised=true">';
  const hostileDuration = '</code><script>globalThis.compromised=true</script>';
  const doc = {
    items: [
      { id: "later", symbol: "later", order: 2 },
      { id: hostileId, symbol: hostileSymbol, order: 1, durationHint: hostileDuration },
      { id: "first", symbol: "first", order: 0 },
    ],
  };
  const fakeDocument = createFakeDocument();

  renderCanvasTilesDom(fakeDocument, fakeDocument.canvas, doc, hostileId);

  assertCanvasStructure(fakeDocument.canvas, ["first", hostileId, "later"], hostileId);
  const hostileTile = fakeDocument.canvas.children[1];
  assert.equal(hostileTile.getAttribute("data-item-id"), hostileId);
  assert.equal(hostileTile.getAttribute("aria-label"), `Motif symbol ${hostileSymbol}, order 1, id ${hostileId}`);
  assert.equal(hostileTile.children[0].textContent, hostileSymbol);
  assert.deepEqual(
    fakeDocument.canvas.children.flatMap((tile) => [tile, ...tile.children]).map((node) => node.tagName),
    ["DIV", "SPAN", "DIV", "SPAN", "DIV", "SPAN"],
  );
  assert.ok(
    fakeDocument.canvas.children.flatMap((tile) => [tile, ...tile.children])
      .every((node) => [...node.attributes.keys()].every((name) => !name.startsWith("on"))),
  );

  const integrationDocument = createFakeDocument();
  assert.equal(integrationDocument.canvas.children.length, 0);
  renderDocumentState(integrationDocument, doc);

  assert.equal(integrationDocument.countContainer.textContent, "Items (3)");
  assert.deepEqual(
    integrationDocument.querySelector(".motif-items").children.map((entry) => entry.textContent),
    ["later · later", `${hostileId} · ${hostileSymbol} · ${hostileDuration}`, "first · first"],
  );
  assertCanvasStructure(integrationDocument.canvas, ["first", hostileId, "later"], "first");
  return true;
}

export const verificationComplete = verifyDynamicCanvasDomRendering();
