/** Intent tests for the local-only LTI mock administrative surface. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createToolRegistry } from "./platform.mjs";
import { renderUi } from "./ui.mjs";

const html = renderUi({ registry:createToolRegistry(), apiBase:"http://localhost:8787", banner:"MOCK PLATFORM - not Canvas", status:"local-mock" });

test("mock admin visibly preserves its local-only and non-production boundary", () => {
  for (const phrase of ["local lab", "not production", "not a real LMS", "not IMS certified", "No production LMS is contacted"]) assert.match(html, new RegExp(phrase, "i"));
});

test("mock admin uses anchors, not nested buttons, for fixture downloads", () => {
  assert.match(html, /<a class="download-link secondary" href="\/fixtures\/canvas-tool-config\.json"/);
  assert.doesNotMatch(html, /<a[^>]*>\s*<button/i);
});

test("mock admin has responsive, focus, and request state treatment", () => {
  for (const token of [":focus-visible", "@media (max-width:760px)", "role=\"status\"", "data-state=\"error\"", "Working…", "could not complete"]) assert.match(html, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
