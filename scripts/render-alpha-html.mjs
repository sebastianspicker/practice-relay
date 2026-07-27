/**
 * Regenerate 0.4 application HTML and reviewable source snapshots.
 * Why: runtime captures and repository-portable HTML must originate from the same modules.
 */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPageHtml } from "../mvei/apps/schema-site/src/content.mjs";
import {
  loadDemoMotif,
  renderShellHtml as renderMveiWorkbench,
} from "../mvei/apps/workbench/src/shell.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const alphaDir = join(root, "docs/images/0.4.0-alpha.1");
mkdirSync(alphaDir, { recursive: true });

/** Match `@import "…"` / `@import url("…")` (optional media query suffix before `;`). */
const CSS_IMPORT_PATTERN =
  String.raw`@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?(?:\s[^;]*)?;`;

/**
 * Recursively expand local CSS `@import` paths into one stylesheet for snapshots.
 * Remote `@import url("https://…")` lines are left unchanged.
 * A fresh RegExp is used per call so recursive `.replace` does not share `lastIndex`.
 */
function expandCssImports(css, baseDir, seen = new Set()) {
  return css.replace(new RegExp(CSS_IMPORT_PATTERN, "g"), (match, importPath) => {
    if (/^(?:[a-z]+:)?\/\//i.test(importPath) || /^[a-z]+:/i.test(importPath)) {
      return match;
    }
    const resolved = resolve(baseDir, importPath);
    if (seen.has(resolved)) return `/* skipped circular @import ${importPath} */`;
    seen.add(resolved);
    const imported = readFileSync(resolved, "utf8");
    return expandCssImports(imported, dirname(resolved), seen);
  });
}

const practiceRelayCssPath = join(root, "practice-relay/apps/web/src/app.css");
const practiceRelayHtml = readFileSync(join(root, "practice-relay/apps/web/src/index.html"), "utf8");
const practiceRelayCss = expandCssImports(
  readFileSync(practiceRelayCssPath, "utf8"),
  dirname(practiceRelayCssPath),
);
const practiceRelayStylesheetLink = '<link rel="stylesheet" href="./app.css">';
if (!practiceRelayHtml.includes(practiceRelayStylesheetLink)) {
  throw new Error("Practice Relay HTML is missing its canonical app.css link");
}
const practiceRelaySnapshotHtml = practiceRelayHtml.replace(
  practiceRelayStylesheetLink,
  `<style>\n${practiceRelayCss}\n</style>`,
);
const schemaHtml = buildPageHtml();
const mveiWorkbenchHtml = renderMveiWorkbench(loadDemoMotif());

/** Rewrite runtime asset URLs so a snapshot resolves canonical repository files. */
export function makeSnapshotHtml(html, rewrites) {
  return rewrites.reduce(
    (snapshot, [runtimeUrl, snapshotUrl]) => snapshot.replaceAll(runtimeUrl, snapshotUrl),
    html,
  );
}

/** Write runtime HTML and matching reviewable snapshots from shipped modules. */
export function renderAlphaHtml() {
  const targets = [
    {
      name: "practice-relay-web",
      html: practiceRelaySnapshotHtml,
      runtimePath: null,
      snapshotRewrites: [
        [
          "./practice-relay-app.mjs",
          "../../../practice-relay/apps/web/src/practice-relay-app.mjs",
        ],
        [
          "./assets/rehearsal-duet.png",
          "../../../practice-relay/apps/web/src/assets/rehearsal-duet.png",
        ],
      ],
    },
    {
      name: "mvei-schema-site",
      html: schemaHtml,
      runtimePath: join(root, "mvei/apps/schema-site/index.html"),
      snapshotRewrites: [
        [
          "/packages/movement-encode/fixtures/corpus/index.json",
          "../../../packages/movement-encode/fixtures/corpus/index.json",
        ],
      ],
    },
    {
      name: "mvei-workbench",
      html: mveiWorkbenchHtml,
      runtimePath: join(root, "mvei/apps/workbench/src/index.html"),
      snapshotRewrites: [
        ["./workbench.css", "../../../mvei/apps/workbench/src/workbench.css"],
        [
          "./workbench-client.mjs",
          "../../../mvei/apps/workbench/src/workbench-client.mjs",
        ],
      ],
    },
  ];

  for (const target of targets) {
    const sourcePath = join(alphaDir, `${target.name}.source.html`);
    writeFileSync(
      sourcePath,
      makeSnapshotHtml(target.html, target.snapshotRewrites),
      "utf8",
    );
    if (target.runtimePath) writeFileSync(target.runtimePath, target.html, "utf8");
    console.log(`OK  ${target.name}: ${sourcePath} (${target.html.length} bytes)`);
  }
  console.log("All 0.4 application HTML and source snapshots regenerated.");
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) renderAlphaHtml();
