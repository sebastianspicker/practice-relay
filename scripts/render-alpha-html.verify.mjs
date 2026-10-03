/** Deterministic adversarial verification for alpha HTML stylesheet expansion. */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execPath } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  expandCssImports,
} from "./render-alpha-html.mjs";
import {
  readRepositoryText,
  resolveExistingRepositoryPath,
} from "./repository-files.mjs";
import {
  ensureContainedOutputDirectory,
  writeContainedText,
} from "./contained-output.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const rendererPath = join(repositoryRoot, "scripts/render-alpha-html.mjs");

function requireEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function requireThrows(callback, message, label) {
  try {
    callback();
  } catch (error) {
    if (error instanceof Error && error.message.includes(message)) return;
    throw new Error(`${label}: unexpected error ${String(error)}`);
  }
  throw new Error(`${label}: expected an error containing ${message}`);
}

function writeFixture(root, relativePath, contents) {
  return writeContainedText(root, relativePath, contents);
}

function expandFixture(root, entryPath, css, limits = {}) {
  return expandCssImports(css, {
    repositoryRoot: root,
    stylesheetPath: entryPath,
    ...limits,
  });
}

function verifyImportForms(root) {
  const entry = writeFixture(root, "forms/main.css", "entry");
  writeFixture(root, "forms/quoted.css", "quoted {}");
  writeFixture(root, "forms/url.css", "url {}");
  writeFixture(root, "forms/media.css", "media {}");
  const remote = '@import url("https://example.test/font.css") layer(font);';
  const protocolRelative = '@import "//cdn.example.test/font.css";';
  const css = [
    '@import "./quoted.css";',
    "@import url( './url.css' );",
    '@import "./media.css" screen and (min-width: 20rem);',
    remote,
    protocolRelative,
  ].join("\n");
  requireEqual(
    expandFixture(root, entry, css),
    ["quoted {}", "url {}", "media {}", remote, protocolRelative].join("\n"),
    "supported and remote import forms",
  );
}

function verifyCyclesAndLimits(root) {
  const entry = writeFixture(root, "cycle/main.css", '@import "./nested.css";');
  writeFixture(root, "cycle/nested.css", 'nested { color: red; }\n@import "./main.css";');
  requireEqual(
    expandFixture(root, entry, readRepositoryText(root, entry)),
    "nested { color: red; }\n/* skipped circular @import ./main.css */",
    "circular import termination",
  );

  const depthEntry = writeFixture(root, "depth/main.css", '@import "./one.css";');
  writeFixture(root, "depth/one.css", '@import "./two.css";');
  writeFixture(root, "depth/two.css", "two {}");
  requireThrows(
    () => expandFixture(root, depthEntry, readRepositoryText(root, depthEntry), { maxDepth: 1 }),
    "depth exceeds 1",
    "depth limit",
  );

  const bytesEntry = writeFixture(root, "bytes/main.css", '@import "./large.css";');
  writeFixture(root, "bytes/large.css", "1234567890");
  requireThrows(
    () => expandFixture(root, bytesEntry, readRepositoryText(root, bytesEntry), { maxBytes: 25 }),
    "exceed 25 bytes",
    "cumulative byte limit",
  );
}

function verifyPathBoundary(root) {
  const entry = writeFixture(root, "main.css", "entry");
  ensureContainedOutputDirectory(root, "directory");
  requireThrows(
    () => expandFixture(root, entry, '@import "../outside.css";'),
    "escapes its root",
    "traversal rejection",
  );
  requireThrows(
    () => expandFixture(root, entry, '@import "/etc/passwd";'),
    "escapes its root",
    "absolute-path rejection",
  );
  requireThrows(
    () => expandFixture(root, entry, '@import ".env-secret";'),
    "is protected",
    "protected-path rejection",
  );
  requireThrows(
    () => expandFixture(root, entry, '@import "directory";'),
    "not a regular file",
    "non-regular-file rejection",
  );

}

function verifyMalformedInput(root) {
  const entry = writeFixture(root, "malformed.css", "entry");
  const unterminated = `@import "${"a".repeat(200_000)}`;
  requireEqual(
    expandFixture(root, entry, unterminated, { maxBytes: 300_000 }),
    unterminated,
    "long unterminated import",
  );
}

function verifyExistingStylesheetIdentity() {
  const entryPath = "apps/relay-web/src/app.css";
  const entry = readRepositoryText(repositoryRoot, entryPath);
  const imports = [
    "tokens",
    "base",
    "dossier",
    "decision",
    "dialog",
    "studio",
    "movement",
    "handoff",
  ];
  const expected = imports.reduce(
    (css, name) =>
      css.replace(
        `@import "./styles/${name}.css";`,
        readRepositoryText(
          repositoryRoot,
          `apps/relay-web/src/styles/${name}.css`,
        ),
      ),
    entry,
  );
  requireEqual(
    expandCssImports(entry, {
      repositoryRoot,
      stylesheetPath: entryPath,
    }),
    expected,
    "current workspace stylesheet identity",
  );
}

function generatedArtifactState() {
  const paths = [
    "docs/images/0.4.0-alpha.1/practice-relay-web.source.html",
    "docs/images/0.4.0-alpha.1/mvei-schema-site.source.html",
    "docs/images/0.4.0-alpha.1/mvei-workbench.source.html",
    "apps/movement-schema-site/index.html",
    "apps/movement-workbench/src/index.html",
  ];
  return paths.map((relativePath) => {
    const path = join(repositoryRoot, relativePath);
    return {
      path,
      modified: resolveExistingRepositoryPath(repositoryRoot, path).info.mtimeMs,
    };
  });
}

function verifyGeneratedArtifactsAndImportEffects() {
  const before = generatedArtifactState();
  const rendererUrl = pathToFileURL(rendererPath).href;
  const result = spawnSync(
    execPath,
    ["--import", "tsx", "--input-type=module", "--eval", `await import(${JSON.stringify(rendererUrl)});`],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  requireEqual(result.status, 0, `module import failed: ${result.stderr}`);
  const after = generatedArtifactState();
  requireEqual(JSON.stringify(after), JSON.stringify(before), "module import side effects");
}

function verifyRenderer() {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "practice-relay-render-"));
  try {
    verifyImportForms(fixtureRoot);
    verifyCyclesAndLimits(fixtureRoot);
    verifyPathBoundary(fixtureRoot);
    verifyMalformedInput(fixtureRoot);
    verifyExistingStylesheetIdentity();
    verifyGeneratedArtifactsAndImportEffects();
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
  return true;
}

export const verificationComplete = verifyRenderer();
