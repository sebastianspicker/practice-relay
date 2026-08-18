/** Byte-exact characterization tests for the Quiet Dossier readiness renderer. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const originalStaticDemo = globalThis.PRACTICE_RELAY_STATIC_DEMO;
globalThis.PRACTICE_RELAY_STATIC_DEMO = true;
const { renderReadiness } = await import("./render/readiness.mjs?readiness-render-test");
globalThis.PRACTICE_RELAY_STATIC_DEMO = originalStaticDemo;

const EXTERNAL_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3h7v7M10 14 21 3M19 13v7H4V5h7"/></svg>';
const EMPTY_READINESS = `<h2 id="readiness-heading">Handoff check</h2><p class="empty">Select a record to inspect its handoff state.</p>
      <button type="button" data-action="export">Prepare export</button>`;
const COMPLETE_READINESS = `<div class="decision-inner">
      <h2 id="readiness-heading" class="visually-hidden">Handoff check</h2>
      <ul class="status-list"><li class="ok">Intended version selected</li><li class="ok">Evidence set reviewed</li><li class="ok">Responsible roles named</li><li class="ok">Assessment use permitted</li><li class="ok">Repository reuse permitted</li></ul>
      
      <button class="primary" type="button" data-action="export">Prepare export</button>
      <section class="package-summary" id="package-summary">
      <button class="quiet-link" type="button" data-action="manifest">Package preview</button>
    </section>
      
      <p class="alpha-note">Snapshot, export, and review controls remain local-only in this alpha.</p>
    </div>`;
const INCOMPLETE_READINESS = `<div class="decision-inner">
      <h2 id="readiness-heading" class="visually-hidden">Handoff check</h2>
      <ul class="status-list"><li class="block">Intended version selected</li><li class="block">Evidence set reviewed</li><li class="block">Responsible roles named</li><li class="block">Assessment use permitted</li><li class="block">Repository reuse needs review</li></ul>
      <div class="hold-card">
      <p>One condition before seal</p>
      <p class="detail">Intended version selected. No silent grant.</p>
      <button class="primary" type="button" data-action="resolve">Review condition</button>
    </div>
      <button type="button" class="quiet-link" data-action="export">Prepare export</button>
      <section class="package-summary" id="package-summary">
      <button class="quiet-link" type="button" data-action="manifest">Package preview</button>
    </section>
      
      <p class="alpha-note">Snapshot, export, and review controls remain local-only in this alpha.</p>
    </div>`;

function completeRecord(overrides = {}) {
  return {
    versions: [{ id: "version-1" }],
    artifacts: [{ id: "score" }],
    snapshots: [{ id: "snapshot-1" }],
    members: [{ id: "member-1" }],
    policies: [
      { purpose: "assessment", state: "granted" },
      { purpose: "archive", state: "granted" },
    ],
    ...overrides,
  };
}

test("renders the null handoff state with its exact heading, empty copy, and export control", () => {
  assert.equal(renderReadiness(null), EMPTY_READINESS);
});

test("keeps complete and incomplete readiness classes, first hold card, and no-motion layout byte-stable", () => {
  assert.equal(renderReadiness(completeRecord()), COMPLETE_READINESS);
  assert.equal(renderReadiness({}), INCOMPLETE_READINESS);
});

test("continues to escape every status label at the renderer boundary", () => {
  const source = readFileSync(fileURLToPath(new URL("./render/readiness.mjs", import.meta.url)), "utf8");
  assert.ok(source.includes('return `<li class="${cls}">${escapeHtml(check.label)}</li>`;'));
  assert.match(source, /\$\{escapeHtml\(incomplete\.label\)\}\. No silent grant\./);
});

test("renders simulated resolve, export, package, and motion controls as static actions", () => {
  const html = renderReadiness({ motion: true }, { staticDemo: true });
  assert.equal(
    html,
    `<div class="decision-inner">
      <h2 id="readiness-heading" class="visually-hidden">Handoff check</h2>
      <ul class="status-list"><li class="block">Intended version selected</li><li class="block">Evidence set reviewed</li><li class="block">Responsible roles named</li><li class="block">Assessment use permitted</li><li class="block">Repository reuse needs review</li></ul>
      <div class="hold-card">
      <p>One condition before seal</p>
      <p class="detail">Intended version selected. No silent grant.</p>
      <button class="primary" type="button" data-action="resolve">Simulate: Review condition</button>
    </div>
      <button type="button" class="quiet-link" data-action="export">Simulate: Prepare export</button>
      <section class="package-summary" id="package-summary">
      <button class="quiet-link" type="button" data-action="manifest">Simulate: Package preview</button>
    </section>
      <p><button class="quiet-link" type="button" data-action="open-workbench">Simulate: Open in MvEI Workbench ${EXTERNAL_ICON}</button></p>
      <p class="alpha-note">Snapshot, export, and review controls remain local-only in this alpha.</p>
    </div>`,
  );
});

test("renders a safe live motion link and omits motion controls when motion is false", () => {
  const withMotion = renderReadiness(completeRecord({ motion: true }));
  assert.match(
    withMotion,
    new RegExp(`<p><a class="quiet-link" href="http://127\\.0\\.0\\.1:5175/" target="_blank" rel="noopener">Open in MvEI Workbench ${EXTERNAL_ICON}</a></p>`),
  );
  assert.doesNotMatch(withMotion, /data-action="open-workbench"/);

  const withoutMotion = renderReadiness(completeRecord({ motion: false }));
  assert.equal(withoutMotion, COMPLETE_READINESS);
  assert.doesNotMatch(withoutMotion, /open-workbench/);
});
