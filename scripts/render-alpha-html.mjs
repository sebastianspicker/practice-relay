/**
 * Regenerate 0.4 application HTML and reviewable source snapshots.
 * Why: runtime captures and repository-portable HTML must originate from the same modules.
 */
import { Buffer } from "node:buffer";
import { log } from "node:console";
import { dirname, join, resolve } from "node:path";
import { argv } from "node:process";
import { fileURLToPath } from "node:url";
import { buildPageHtml } from "../apps/movement-schema-site/src/content.mjs";
import {
  loadDemoMotif,
  renderShellHtml as renderMveiWorkbench,
} from "../apps/movement-workbench/src/shell.mjs";
import { writeContainedText } from "./contained-output.mjs";
import {
  readRepositoryText,
  resolveExistingRepositoryPath,
} from "./repository-files.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const alphaDir = join(root, "docs/images/0.4.0-alpha.1");
const MAX_CSS_IMPORT_DEPTH = 16;
const MAX_CSS_BYTES = 1024 * 1024;

function isCssWhitespace(character) {
  return character === " " || character === "\n" || character === "\r" || character === "\t";
}

function skipCssWhitespace(css, start) {
  let index = start;
  while (index < css.length && isCssWhitespace(css.at(index))) index += 1;
  return index;
}

function readQuotedImportPath(css, start) {
  const quote = css.at(start);
  if (quote !== '"' && quote !== "'") return null;
  let index = start + 1;
  while (index < css.length && css.at(index) !== quote) index += 1;
  if (index === css.length) return { incomplete: true, end: css.length };
  return { importPath: css.slice(start + 1, index), end: index + 1 };
}

/** Parse one supported quoted CSS import without rescanning malformed suffixes. */
function parseCssImport(css, start) {
  if (!css.startsWith("@import", start)) return null;
  let index = start + "@import".length;
  if (!isCssWhitespace(css.at(index))) return null;
  index = skipCssWhitespace(css, index);

  let wrapped = false;
  if (css.startsWith("url", index)) {
    index = skipCssWhitespace(css, index + 3);
    if (css.at(index) !== "(") return null;
    wrapped = true;
    index = skipCssWhitespace(css, index + 1);
  }

  const quoted = readQuotedImportPath(css, index);
  if (!quoted) return null;
  if (quoted.incomplete) return quoted;
  index = skipCssWhitespace(css, quoted.end);
  if (wrapped) {
    if (css.at(index) !== ")") return null;
    index = skipCssWhitespace(css, index + 1);
  }
  while (index < css.length && css.at(index) !== ";") index += 1;
  if (index === css.length) return { incomplete: true, end: css.length };
  return { importPath: quoted.importPath, end: index + 1 };
}

function isRemoteCssImport(importPath) {
  if (importPath.startsWith("//")) return true;
  const first = importPath.codePointAt(0);
  if (!first || !((first >= 65 && first <= 90) || (first >= 97 && first <= 122))) {
    return false;
  }
  for (let index = 1; index < importPath.length; index += 1) {
    const code = importPath.codePointAt(index);
    if (code === 58) return true;
    const allowed =
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      (code >= 48 && code <= 57) ||
      code === 43 ||
      code === 45 ||
      code === 46;
    if (!allowed) return false;
  }
  return false;
}

function expandCssText(css, currentPath, state, depth) {
  let output = "";
  let copiedThrough = 0;
  let index = 0;
  while (index < css.length) {
    if (css.at(index) !== "@") {
      index += 1;
      continue;
    }
    const parsed = parseCssImport(css, index);
    if (!parsed) {
      index += 1;
      continue;
    }
    if (parsed.incomplete) break;
    const original = css.slice(index, parsed.end);
    let replacement = original;
    if (!isRemoteCssImport(parsed.importPath)) {
      if (depth >= state.maxDepth) {
        throw new Error(`CSS import depth exceeds ${String(state.maxDepth)}`);
      }
      const candidate = resolve(dirname(currentPath), parsed.importPath);
      const resolved = resolveExistingRepositoryPath(state.repositoryRoot, candidate);
      if (!resolved.info.isFile()) throw new Error("CSS import is not a regular file");
      if (state.seen.has(resolved.absolute)) {
        replacement = `/* skipped circular @import ${parsed.importPath} */`;
      } else {
        const imported = readRepositoryText(state.repositoryRoot, resolved.absolute);
        state.totalBytes += Buffer.byteLength(imported, "utf8");
        if (state.totalBytes > state.maxBytes) {
          throw new Error(`CSS imports exceed ${String(state.maxBytes)} bytes`);
        }
        state.seen.add(resolved.absolute);
        replacement = expandCssText(imported, resolved.absolute, state, depth + 1);
      }
    }
    output += css.slice(copiedThrough, index) + replacement;
    copiedThrough = parsed.end;
    index = parsed.end;
  }
  return output + css.slice(copiedThrough);
}

/** Recursively inline contained local CSS imports with bounded work. */
export function expandCssImports(
  css,
  {
    repositoryRoot,
    stylesheetPath,
    maxDepth = MAX_CSS_IMPORT_DEPTH,
    maxBytes = MAX_CSS_BYTES,
  },
) {
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 0) {
    throw new Error("CSS import depth limit must be a non-negative integer");
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new Error("CSS import byte limit must be a non-negative integer");
  }
  const entry = resolveExistingRepositoryPath(repositoryRoot, stylesheetPath);
  if (!entry.info.isFile()) throw new Error("CSS entry is not a regular file");
  const totalBytes = Buffer.byteLength(css, "utf8");
  if (totalBytes > maxBytes) throw new Error(`CSS imports exceed ${String(maxBytes)} bytes`);
  return expandCssText(
    css,
    entry.absolute,
    {
      repositoryRoot,
      maxDepth,
      maxBytes,
      seen: new Set([entry.absolute]),
      totalBytes,
    },
    0,
  );
}

/** Rewrite runtime asset URLs so a snapshot resolves canonical repository files. */
export function makeSnapshotHtml(html, rewrites) {
  return rewrites.reduce(
    (snapshot, [runtimeUrl, snapshotUrl]) => snapshot.replaceAll(runtimeUrl, snapshotUrl),
    html,
  );
}

/** Build generated HTML from current shipped modules without writing files. */
function buildAlphaArtifacts() {
  const practiceRelayCssPath = join(root, "apps/relay-web/src/app.css");
  const practiceRelayHtml = readRepositoryText(
    root,
    "apps/relay-web/src/index.html",
  );
  const practiceRelayCss = expandCssImports(
    readRepositoryText(root, practiceRelayCssPath),
    { repositoryRoot: root, stylesheetPath: practiceRelayCssPath },
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

  return [
    {
      name: "practice-relay-web",
      html: practiceRelaySnapshotHtml,
      runtimePath: null,
      snapshotRewrites: [
        [
          "./practice-relay-app.mjs",
          "../../../apps/relay-web/src/practice-relay-app.mjs",
        ],
        [
          'url("../assets/fonts/',
          'url("../../../apps/relay-web/src/assets/fonts/',
        ],
      ],
    },
    {
      name: "mvei-schema-site",
      html: schemaHtml,
      runtimePath: join(root, "apps/movement-schema-site/index.html"),
      snapshotRewrites: [
        [
          "/packages/movement/fixtures/corpus/index.json",
          "../../../packages/movement/fixtures/corpus/index.json",
        ],
      ],
    },
    {
      name: "mvei-workbench",
      html: mveiWorkbenchHtml,
      runtimePath: join(root, "apps/movement-workbench/src/index.html"),
      snapshotRewrites: [
        ["./workbench.css", "../../../apps/movement-workbench/src/workbench.css"],
        [
          "./workbench-client.mjs",
          "../../../apps/movement-workbench/src/workbench-client.mjs",
        ],
      ],
    },
  ];
}

/** Write runtime HTML and matching reviewable snapshots from shipped modules. */
export function renderAlphaHtml() {
  for (const target of buildAlphaArtifacts()) {
    const sourcePath = join(alphaDir, `${target.name}.source.html`);
    writeContainedText(
      root,
      sourcePath,
      makeSnapshotHtml(target.html, target.snapshotRewrites),
    );
    if (target.runtimePath) writeContainedText(root, target.runtimePath, target.html);
    log(`OK  ${target.name}: ${sourcePath} (${target.html.length} bytes)`);
  }
  log("All 0.4 application HTML and source snapshots regenerated.");
}

const isMain = argv[1] && resolve(argv[1]) === fileURLToPath(import.meta.url);
if (isMain) renderAlphaHtml();
