/**
 * Tests for the repository LOC and function-arity guard.
 * Why: the quality policy must fail deterministically before oversized modules return.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  MAX_FILE_LINES,
  MAX_FUNCTION_ARGS,
  MAX_FUNCTION_COMPLEXITY,
  MIN_DUPLICATE_BLOCK_LINES,
  FILE_EXEMPTIONS,
  countPhysicalLines,
  collectQualityViolations,
  extractModuleScripts,
  findExactDuplicateGroups,
  findDocumentationViolations,
  findArityViolations,
  findComplexityViolations,
  findCloneBlockGroups,
  findSyntaxViolations,
} from "./code-quality-check.mjs";

test("quality collection explicitly excludes deterministic generated HTML", () => {
  assert.match(FILE_EXEMPTIONS.get("mvei/apps/schema-site/index.html"), /content\.mjs/);
  assert.match(FILE_EXEMPTIONS.get("mvei/apps/workbench/src/index.html"), /shell\.mjs/);
});

test("quality collection skips protected source-like filenames", (context) => {
  const root = mkdtempSync(join(tmpdir(), "practice-relay-quality-boundary-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, ".env.ts"), "this is not TypeScript", "utf8");
  writeFileSync(join(root, "safe.ts"), "/** Safe source. */\nexport {};\n", "utf8");
  const result = collectQualityViolations(root);
  assert.deepEqual(result.files.map(({ relPath }) => relPath), ["safe.ts"]);
});

test("physical line counting handles trailing newlines", () => {
  assert.equal(countPhysicalLines(""), 0);
  assert.equal(countPhysicalLines("one"), 1);
  assert.equal(countPhysicalLines("one\ntwo"), 2);
  assert.equal(countPhysicalLines("one\ntwo\n"), 2);
  assert.equal(MAX_FILE_LINES, 500);
});

test("documentation scan requires module comments and direct-export JSDoc", () => {
  const missing = findDocumentationViolations(
    "export function undocumented() {}\nexport const alsoUndocumented = () => {};\nexport type Missing = string;\nexport { external };\n",
    "missing.ts",
  );
  assert.deepEqual(missing.module, [
    { filePath: "missing.ts", line: 1, kind: "module" },
  ]);
  assert.deepEqual(
    missing.exports.map(({ name, kind }) => ({ name, kind })),
    [
      { name: "undocumented", kind: "function" },
      { name: "alsoUndocumented", kind: "callable const" },
      { name: "Missing", kind: "type" },
    ],
  );
});

test("documentation scan accepts a module header, JSDoc, and re-exports", () => {
  const clean = findDocumentationViolations(
    "#!/usr/bin/env node\n/** Module header. */\n/** Runs the entrypoint. */\nexport function run() {}\n/** Builds the stable task. */\nexport const build = () => {};\n/** Stable result shape. */\nexport interface Result { ok: boolean }\nexport { external };\n",
    "clean.mjs",
  );
  assert.deepEqual(clean, { module: [], exports: [] });
});

test("documentation scan catches indirect, default, and CommonJS callable exports", () => {
  const missing = findDocumentationViolations(
    "/** Module header. */\nconst hidden = () => {};\nexport { hidden };\nexport default () => {};\nmodule.exports = function undocumented() {};\nexport { external } from './external.mjs';\n",
    "exports.mjs",
  );
  assert.deepEqual(
    missing.exports.map(({ name, kind }) => ({ name, kind })),
    [
      { name: "hidden", kind: "callable const" },
      { name: "default", kind: "callable default" },
      { name: "module.exports", kind: "commonjs callable" },
    ],
  );
});

test("documentation scan enforces HTML, CSS, and shell source headers", () => {
  for (const [filePath, source] of [
    ["page.html", "<!DOCTYPE html>\n<html></html>"],
    ["theme.css", ":root { color: black; }"],
    ["entry.sh", "#!/bin/sh\nset -eu"],
  ]) {
    assert.equal(
      findDocumentationViolations(source, filePath).module.length,
      1,
      filePath,
    );
  }
  assert.deepEqual(
    findDocumentationViolations(
      "<!DOCTYPE html>\n<!-- Product shell. Why: stable entrypoint. -->\n<html></html>",
      "page.html",
    ),
    { module: [], exports: [] },
  );
  assert.deepEqual(
    findDocumentationViolations(
      "#!/bin/sh\n# Runtime entrypoint. Why: maps the process boundary.\nset -eu",
      "entry.sh",
    ),
    { module: [], exports: [] },
  );
});

test("arity scan accepts four parameters and rejects five", () => {
  assert.equal(MAX_FUNCTION_ARGS, 4);
  assert.deepEqual(
    findArityViolations("function ok(a, b, c, d) {}", "ok.ts"),
    [],
  );
  const violations = findArityViolations(
    "const tooWide = (a, b, c, d, e) => a;",
    "wide.mjs",
  );
  assert.equal(violations.length, 1);
  assert.deepEqual(violations[0], {
    filePath: "wide.mjs",
    line: 1,
    name: "tooWide",
    args: 5,
  });
});

test("syntax scan reports malformed source and accepts valid modules", () => {
  assert.deepEqual(
    findSyntaxViolations("export const valid = true;", "valid.mjs"),
    [],
  );
  const issues = findSyntaxViolations("function broken( {", "broken.mjs");
  assert.equal(issues.length > 0, true);
  assert.equal(issues[0].filePath, "broken.mjs");
  assert.equal(issues[0].line, 1);
});

test("embedded module bodies retain AST quality coverage", () => {
  const [module] = extractModuleScripts(
    `<script type="module">
      const tooWide = (a, b, c, d, e) => a;
      const tooComplex = () => { ${"if (x) work();".repeat(50)} };
    </script>`,
    "sample.html",
  );
  assert.equal(module.filePath, "sample.html#module");
  assert.equal(findArityViolations(module.source, module.filePath)[0].args, 5);
  assert.equal(findSyntaxViolations("function broken( {", module.filePath).length > 0, true);
  assert.equal(
    findComplexityViolations(module.source, module.filePath)[0].complexity,
    51,
  );
});

test("complexity scan ignores nested callables and rejects excessive branching", () => {
  assert.equal(MAX_FUNCTION_COMPLEXITY, 50);
  const nestedBranches = `function outer() { return () => { ${"if (x) work();".repeat(55)} }; }`;
  assert.equal(
    findComplexityViolations(nestedBranches, "nested.mjs")[0]?.name,
    "anonymous",
  );

  const oversized = `const tooComplex = () => { ${"if (x) work();".repeat(50)} };`;
  assert.deepEqual(findComplexityViolations(oversized, "complex.mjs"), [
    {
      filePath: "complex.mjs",
      line: 1,
      name: "tooComplex",
      complexity: 51,
    },
  ]);
});

test("exact duplicate scan groups copies without conflating distinct sources", () => {
  assert.deepEqual(
    findExactDuplicateGroups([
      { filePath: "z.mjs", source: "same\n" },
      { filePath: "a.mjs", source: "same\n" },
      { filePath: "unique.mjs", source: "different\n" },
    ]),
    [["a.mjs", "z.mjs"]],
  );
});

test("clone-block scan reports maximal normalized blocks with source ranges", () => {
  const repeated = Array.from({ length: 13 }, (_, index) => `step(${index});`).join("\n");
  assert.deepEqual(
    findCloneBlockGroups([
      { filePath: "a.mjs", source: `before();\n${repeated}\nafter();\n` },
      { filePath: "b.mjs", source: `different();\n// non-semantic note\n${repeated}\nend();\n` },
      { filePath: "c.mjs", source: "unique();\n" },
    ]),
    [["a.mjs:2-14", "b.mjs:3-15"]],
  );
});

test("clone-block scan terminates when a shared block reaches end of file", () => {
  const repeated = Array.from(
    { length: MIN_DUPLICATE_BLOCK_LINES },
    (_, index) => `finish(${index});`,
  ).join("\n");
  assert.deepEqual(
    findCloneBlockGroups([
      { filePath: "a.mjs", source: repeated },
      { filePath: "b.mjs", source: repeated },
    ]),
    [["a.mjs:1-12", "b.mjs:1-12"]],
  );
});
