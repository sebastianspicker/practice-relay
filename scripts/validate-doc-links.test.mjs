/**
 * Tests for deterministic whole-repository Markdown link validation.
 * Why: public docs must catch broken paths without treating examples or URLs as files.
 */
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  extractMarkdownLinks,
  listMarkdownFiles,
  maskFencedCode,
  validateDocLinks,
} from "./validate-doc-links.mjs";

test("extracts inline, image, and reference links but masks fenced examples", () => {
  const markdown = [
    "[doc](guide/readme.md#start)",
    "![image](images/shot.png)",
    "[guide]: <guide/readme.md> \"Guide\"",
    "```md",
    "[example](missing.md)",
    "```",
  ].join("\n");
  assert.deepEqual(extractMarkdownLinks(markdown), [
    { target: "guide/readme.md#start", line: 1 },
    { target: "images/shot.png", line: 2 },
    { target: "guide/readme.md", line: 3 },
  ]);
  assert.equal(maskFencedCode(markdown).split("\n").length, 6);
});

test("validates local targets and reports missing or escaping destinations", () => {
  const root = mkdtempSync(join(tmpdir(), "practice-relay-doc-links-"));
  try {
    mkdirSync(join(root, "docs", "guide"), { recursive: true });
    mkdirSync(join(root, "docs", "images"), { recursive: true });
    writeFileSync(join(root, "README.md"), "[docs](docs/guide/readme.md)\n", "utf8");
    writeFileSync(join(root, "docs", "guide", "readme.md"), "# Guide\n", "utf8");
    writeFileSync(join(root, "docs", "images", "shot.png"), "png", "utf8");
    writeFileSync(
      join(root, "docs", "page.md"),
      "![shot](images/shot.png)\n[web](https://example.test)\n[missing](nope.md)\n[escape](../../outside.md)\n",
      "utf8",
    );
    const result = validateDocLinks({ root });
    assert.equal(result.filesChecked, 3);
    assert.equal(result.linksChecked, 4);
    assert.deepEqual(
      result.failures.map(({ file, line, target, reason }) => ({ file, line, target, reason })),
      [
        { file: "docs/page.md", line: 3, target: "nope.md", reason: "missing docs/nope.md" },
        { file: "docs/page.md", line: 4, target: "../../outside.md", reason: "outside repository" },
      ],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("skips vendor and local-index directories", () => {
  const root = mkdtempSync(join(tmpdir(), "practice-relay-doc-links-skip-"));
  try {
    writeFileSync(join(root, "README.md"), "# Root\n", "utf8");
    for (const directory of ["node_modules", ".codegraph", "deploy/secrets"]) {
      mkdirSync(join(root, directory), { recursive: true });
      writeFileSync(join(root, directory, "broken.md"), "[bad](missing.md)\n", "utf8");
    }
    writeFileSync(join(root, ".env.notes.md"), "[bad](missing.md)\n", "utf8");
    const result = validateDocLinks({ root });
    assert.equal(result.filesChecked, 1);
    assert.deepEqual(result.failures, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects destinations that escape through an intermediate symlink", () => {
  const root = mkdtempSync(join(tmpdir(), "practice-relay-doc-links-root-"));
  const outside = mkdtempSync(join(tmpdir(), "practice-relay-doc-links-outside-"));
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(outside, "target.md"), "# Outside\n", "utf8");
    symlinkSync(outside, join(root, "docs", "linked"), "dir");
    writeFileSync(
      join(root, "docs", "page.md"),
      "[outside](linked/target.md)\n",
      "utf8",
    );

    const result = validateDocLinks({ root });
    assert.deepEqual(result.failures, [
      {
        file: "docs/page.md",
        line: 1,
        target: "linked/target.md",
        reason: "outside repository through symlink",
      },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("includes nested maintained Markdown in the public corpus", () => {
  const root = mkdtempSync(join(tmpdir(), "practice-relay-doc-links-corpus-"));
  try {
    for (const path of [
      ["docs", "architecture", "paper.md"],
      ["docs", "notes", "working.md"],
      ["docs", "reference", "old-release.md"],
    ]) {
      const file = join(root, ...path);
      mkdirSync(join(file, ".."), { recursive: true });
      writeFileSync(file, "# Retained public record\n", "utf8");
    }
    const files = listMarkdownFiles({ root }).map((file) =>
      file.slice(root.length + 1),
    );
    assert.deepEqual(files, [
      "docs/architecture/paper.md",
      "docs/notes/working.md",
      "docs/reference/old-release.md",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
