/** Deterministic verification for Markdown-link extraction and repository coverage. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ensureContainedOutputDirectory,
  writeContainedText,
} from "./contained-output.mjs";
import { extractMarkdownLinks, validateDocLinks } from "./validate-doc-links.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function requireEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function requireLinks(markdown, expected, label) {
  requireEqual(
    JSON.stringify(extractMarkdownLinks(markdown)),
    JSON.stringify(expected),
    label,
  );
}

function verifyInlineForms() {
  requireLinks(
    [
      "[reference]: zeta.md [inline](alpha.md)",
      "![image](image.png)",
      "[angle](<a document.md>)",
      '[double](double.md "title")',
      "[single](single.md 'title')",
      "[parenthesized](parenthesized.md (title))",
    ].join("\n"),
    [
      { target: "alpha.md", line: 1 },
      { target: "zeta.md", line: 1 },
      { target: "image.png", line: 2 },
      { target: "a document.md", line: 3 },
      { target: "double.md", line: 4 },
      { target: "single.md", line: 5 },
      { target: "parenthesized.md", line: 6 },
    ],
    "ordinary, image, title, angle, order, and line handling",
  );
}

function verifyReferenceDefinitions() {
  requireLinks(
    [
      "[zero]: zero.md",
      " [one]: one.md",
      "  [two]: <two document.md> \"title\"",
      "   [three]: three.md (title)",
    ].join("\n"),
    [
      { target: "zero.md", line: 1 },
      { target: "one.md", line: 2 },
      { target: "two document.md", line: 3 },
      { target: "three.md", line: 4 },
    ],
    "reference definitions with up to three leading spaces",
  );
}

function verifyNonMatchesAndMasking() {
  requireLinks(
    [
      "```md",
      "[masked](masked.md)",
      "```",
      "[active](active.md)",
      "[multiline](",
      "target.md)",
      "[missing](target.md",
      "[missing] target.md)",
      "[empty]()",
    ].join("\n"),
    [
      { target: "active.md", line: 4 },
    ],
    "fenced code, multiline, malformed, and empty inline destinations",
  );
  requireLinks("[empty-reference]: ", [], "empty reference destination");
  requireLinks(
    "[empty-angle-reference]: <>",
    [{ target: "", line: 1 }],
    "empty angle reference destination",
  );
}

function verifyBracketCompatibility() {
  requireLinks(
    [
      "[one]extra](extra.md)",
      "[one]](two.md)",
      "[[inner]](nested.md)",
      "[one]]extra](not-a-link.md)",
    ].join("\n"),
    [
      { target: "extra.md", line: 1 },
      { target: "two.md", line: 2 },
      { target: "nested.md", line: 3 },
    ],
    "existing one-extra-closing-bracket behavior",
  );
}

function verifyLongMalformedInput() {
  requireLinks("[".repeat(250_000), [], "long malformed opening-bracket input");
}

function writeFixture(root, relativePath, contents) {
  return writeContainedText(root, relativePath, contents);
}

function requireFailure(result, target, reason) {
  const failure = result.failures.find((candidate) => candidate.target === target);
  if (!failure) throw new Error(`missing failure for ${target}`);
  requireEqual(failure.reason, reason, `failure reason for ${target}`);
}

function verifyRepositoryBoundaries() {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "practice-relay-doc-links-"));
  try {
    writeFixture(fixtureRoot, "README.md", [
      "[file](target.md)",
      "[directory](directory)",
      "[missing](missing.md)",
      "[escape](../outside.md)",
      "[protected](secrets/hidden.md)",
    ].join("\n"));
    writeFixture(fixtureRoot, "target.md", "target");
    ensureContainedOutputDirectory(fixtureRoot, "directory");

    const result = validateDocLinks({ root: fixtureRoot });
    requireEqual(result.filesChecked, 2, "fixture Markdown file count");
    requireEqual(result.linksChecked, 5, "fixture relative link count");
    requireEqual(result.failures.length, 3, "fixture boundary failure count");
    requireFailure(result, "missing.md", "missing missing.md");
    requireFailure(result, "../outside.md", "outside repository");
    requireFailure(result, "secrets/hidden.md", "repository path is protected");
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function verifyRepositoryCorpus() {
  const result = validateDocLinks({ root: repositoryRoot });
  if (result.filesChecked < 1) throw new Error("repository Markdown corpus is empty");
  if (result.linksChecked < 1) throw new Error("repository Markdown corpus has no relative links");
  requireEqual(result.failures.length, 0, "repository broken relative links");
}

function verifyDocLinks() {
  verifyInlineForms();
  verifyReferenceDefinitions();
  verifyNonMatchesAndMasking();
  verifyBracketCompatibility();
  verifyLongMalformedInput();
  verifyRepositoryBoundaries();
  verifyRepositoryCorpus();
  return true;
}

export const verificationComplete = verifyDocLinks();
