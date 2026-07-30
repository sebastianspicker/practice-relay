/**
 * Surface tests for the Practice Relay Quiet Dossier web application.
 * Why: maturity gates scan the modular shell (HTML, modules, CSS), not only the thin entry.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { escapeHtml } from "./html-escape.mjs";
import {
  BRAND,
  FORBIDDEN_UI_STRINGS,
  TAGLINE,
  assertNoForbiddenCopy,
  practiceRelayMark,
} from "./shell.mjs";

const root = dirname(fileURLToPath(import.meta.url));

/**
 * Recursively collect text from .mjs / .css / .html under src.
 * @param {string} dir Directory to walk.
 * @param {{ skipNames?: Set<string> }} [options] Optional basename exclusions.
 * @returns {string[]} File contents.
 */
function readTree(dir, options = {}) {
  const skipNames = options.skipNames ?? new Set();
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...readTree(path, options));
      continue;
    }
    if (entry.name.endsWith(".test.mjs")) continue;
    if (skipNames.has(entry.name)) continue;
    if (/\.(mjs|css|html)$/.test(entry.name)) {
      out.push(readFileSync(path, "utf8"));
    }
  }
  return out;
}

const surface = readTree(root).join("\n");
/** Product/render surface - shell.mjs only defines the forbidden list, so exclude it. */
const productSurface = readTree(root, { skipNames: new Set(["shell.mjs"]) }).join("\n");
const entry = readFileSync(join(root, "practice-relay-app.mjs"), "utf8");
const html = readFileSync(join(root, "index.html"), "utf8");

/** Assert every token appears as a literal substring of text. */
function assertIncludes(text, tokens, label) {
  for (const token of tokens) {
    assert.ok(
      text.includes(token),
      `${label} must include ${JSON.stringify(token)}`,
    );
  }
}

test("the app carries the Practice Relay identity and exact tagline", () => {
  assert.ok(surface.includes(BRAND), "surface carries brand");
  assert.equal(
    TAGLINE,
    "Carry the work, its evidence, and its permitted uses across institutional handoffs.",
  );
  const mark = practiceRelayMark();
  assert.match(mark, /viewBox="0 0 32 32"/);
  assert.match(mark, /circle cx="8" cy="8"/);
  assert.match(mark, /circle cx="24" cy="25"/);
  assert.match(mark, /circle cx="20" cy="12\.5"/);
});

test("the application exposes loading, empty, error, landmarks, focus and responsive rules", () => {
  assertIncludes(
    surface,
    [
      "Loading work records",
      "No work records",
      'role="status"',
      'aria-live="polite"',
      "<main",
    ],
    "a11y surface",
  );
  assert.ok(
    surface.includes(":focus-visible") || surface.includes("focus-visible"),
    "focus-visible rules present",
  );
  assert.ok(
    /@media\s*\(\s*max-width:\s*700px\s*\)/.test(surface),
    "700px responsive breakpoint present",
  );
  assert.ok(
    surface.includes("Showing an explicit local example") ||
      surface.includes("LOCAL_EXAMPLE"),
    "local example status path present",
  );
  assert.ok(
    surface.includes('data-kind="error"') || entry.includes('"error"'),
    "error status kind is wired",
  );
});

test("the UI adapts WorkRecord evidence, people, policies, snapshots, and uses the explicit API base", () => {
  assertIncludes(
    surface,
    [
      "toWorkspaceRecord",
      "artifacts",
      "members",
      "snapshots",
      "versions",
      "comments",
      "PRACTICE_RELAY_API_BASE",
      "/work-records",
    ],
    "WorkRecord surface",
  );
  assert.ok(
    surface.includes("representedSubjects") || surface.includes("subjects"),
    "subjects / representedSubjects present",
  );
  assert.ok(
    surface.includes("usePolicies") || surface.includes("policies"),
    "usePolicies / policies present",
  );
});

test("the Quiet Dossier handoff shell retains evidence, export, path, and local package controls", () => {
  assert.ok(
    surface.includes("Evidence") || surface.includes("evidence-panel"),
    "evidence panel / heading present",
  );
  assertIncludes(
    surface,
    [
      "Prepare export",
      'data-action="export"',
      "package-dialog",
    ],
    "export / package shell",
  );
  assert.ok(
    surface.includes("handoffChecks") || surface.includes("renderReadiness"),
    "readiness / handoffChecks wiring present",
  );
  assert.ok(
    surface.includes("path") ||
      surface.includes("renderPathHtml") ||
      surface.includes("pathStages"),
    "handoff path present",
  );
  assert.ok(
    surface.includes("rehearsal-duet.png"),
    "rehearsal-duet.png still referenced for photo thumbs",
  );
  assert.ok(
    surface.includes("no remote record changed") ||
      surface.includes("Local example") ||
      surface.includes("Showing an explicit local example"),
    "local-only / no remote change copy present",
  );
});

test("the hosted static demo uses fixtures and visibly labels command-capable actions", () => {
  assertIncludes(
    surface,
    [
      "STATIC_DEMO",
      "sanitized fixture data",
      "Simulate:",
      "Simulated",
      'data-action="toggle-evidence"',
      'data-action="resolve"',
      'data-action="export"',
      'data-action="manifest"',
      'data-action="open-workbench"',
    ],
    "static demo boundary",
  );
});

test("maturity gate literals remain in the entry module", () => {
  assertIncludes(
    entry,
    [
      "Prepare export",
      "No work records",
      "Showing an explicit local example",
    ],
    "entry maturity gates",
  );
});

test("rendering escapes untrusted text and retired tokens are rejected", () => {
  assert.equal(escapeHtml("<script>"), "&lt;script&gt;");
  assert.ok(surface.includes("escapeHtml"), "escapeHtml is used on the surface");
  for (const forbidden of FORBIDDEN_UI_STRINGS) {
    assert.throws(() => assertNoForbiddenCopy(`before ${forbidden} after`));
  }
  const active = productSurface.toLowerCase();
  for (const forbidden of FORBIDDEN_UI_STRINGS) {
    assert.ok(
      !active.includes(forbidden.toLowerCase()),
      `product surface must not contain forbidden string: ${forbidden}`,
    );
  }
});

test("removed dense chrome is not required on the Quiet Dossier surface", () => {
  // Pre-Quiet-Dossier requirements (Templates, data-collapse, nav-collapsed,
  // People & conditions, Selected evidence, Review package as primary CTA,
  // Work records heading) are intentionally not asserted.
  assert.ok(html.includes('id="workspace"') || html.includes("<main"), "main workspace landmark");
  assert.ok(html.includes("package-dialog"), "package dialog shell");
  assert.ok(html.includes('id="readiness"'), "readiness column mount");
});
