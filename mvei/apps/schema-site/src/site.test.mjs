/** Static checks against shipped schema-site index.html. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PROFILES,
  CORPUS_SAMPLES,
  NEIGHBOURS,
  hasNeighbourHonesty,
  listsCorpus,
  buildPageHtml,
} from "./content.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(join(__dirname, "..", "index.html"), "utf8");

test("schema-site index is byte-identical to its renderer", () => {
  assert.equal(indexHtml, buildPageHtml());
});

test("index.html brands MvEI", () => {
  assert.match(indexHtml, /MvEI/);
  assert.match(indexHtml, /Movement Encoding Initiative/);
});

test("index.html provides landmark navigation, focus treatment, and responsive reference layout", () => {
  for (const token of [
    '<html lang="en">',
    'name="viewport"',
    'Skip to reference content',
    '<header class="site-header">',
    'aria-label="Reference sections"',
    '<main id="main" tabindex="-1">',
    '<footer class="site-footer">',
    ':focus-visible',
    '@media (max-width: 720px)',
    'prefers-reduced-motion',
  ]) {
    assert.ok(indexHtml.includes(token), `expected ${token}`);
  }
});

test("index.html lists corpus samples / fixture names", () => {
  assert.match(indexHtml, /corpus/i);
  for (const id of listsCorpus()) {
    assert.ok(
      indexHtml.includes(id),
      `index.html should list corpus sample ${id}`,
    );
  }
  assert.ok(CORPUS_SAMPLES.length >= 3);
});

test("index.html lists profiles from content module", () => {
  for (const p of PROFILES) {
    if (p.id === "mvei-laban") continue; // explicitly outside the current alpha
    assert.ok(
      indexHtml.includes(p.id),
      `index.html should list profile ${p.id}`,
    );
  }
  assert.ok(indexHtml.includes("mvei-motif"));
  assert.ok(indexHtml.includes("movement_annotation"));
});

test("index.html neighbour honesty: LabanLab and companions", () => {
  assert.match(indexHtml, /LabanLab/);
  assert.match(indexHtml, /MvEI Workbench/);
  assert.match(indexHtml, /Practice Relay/);
  assert.ok(
    indexHtml.includes("LaMoGen") || indexHtml.includes("LabanLite"),
    "expected LaMoGen or LabanLite in shipped HTML",
  );
  assert.match(indexHtml, /MARC 358/);
  assert.match(indexHtml, /LabanWriter/);
  assert.equal(hasNeighbourHonesty(), true);
  assert.ok(NEIGHBOURS.length >= 4);
});

test("index.html does not claim to be first browser Laban editor", () => {
  // Allowed: "Not first browser Laban editor" (disclaimer).
  // Forbidden: positive claim of being the first without a leading "Not".
  const withoutDisclaimer = indexHtml.replace(
    /Not\s+[“"']?first browser Laban[^.<]*/gi,
    "",
  );
  assert.ok(
    !/first\s+browser\s+laban/i.test(withoutDisclaimer),
    'shipped HTML must not claim "first browser Laban" without Not disclaimer',
  );
  assert.match(indexHtml, /Not first browser Laban/i);
});

test("index.html links schema path", () => {
  assert.match(
    indexHtml,
    /packages\/movement-encode\/schemas\//,
  );
});

test("index.html lists capture bridge labels and sketch output contract", () => {
  assert.match(indexHtml, /opencap/);
  assert.match(indexHtml, /mediapipe/);
  assert.match(indexHtml, /pose2sim/);
  assert.match(indexHtml, /source plugin_pose/);
  assert.match(indexHtml, /quality sketch/);
  assert.match(indexHtml, /Consortium|consortium/i);
  assert.match(indexHtml, /co-timeline|Music co-timeline/i);
  assert.match(indexHtml, /LabanWriter migration/i);
});
