#!/usr/bin/env node
/**
 * Whole-repository Markdown link validation.
 *
 * Why: public research and implementation documents must not accumulate broken
 * relative links outside the smaller evidence-entrypoint validation surface.
 */
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { maskFencedCode } from "./markdown-fences.mjs";
import { isProtectedRepositoryPath } from "./protected-paths.mjs";

const DEFAULT_SKIPPED_DIRECTORIES = new Set([
  ".agents",
  ".claude",
  ".codegraph",
  ".codacy",
  ".cursor",
  ".git",
  ".grok",
  ".pnpm-store",
  ".scratch",
  ".serena",
  ".turbo",
  ".vite",
  "blob-report",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "tmp",
]);

/** Re-export fenced-code masking for focused repository-tool tests. */
export { maskFencedCode };

function lineAt(source, index) {
  return source.slice(0, index).split("\n").length;
}

function unwrapDestination(raw) {
  const value = raw.trim();
  if (value.startsWith("<")) {
    const end = value.indexOf(">");
    return end >= 0 ? value.slice(1, end) : value;
  }
  for (let index = 0; index < value.length - 1; index += 1) {
    const current = value[index];
    const next = value[index + 1];
    const whitespace = current === " " || current === "\t";
    const titleDelimiter = next === '"' || next === "'" || next === "(";
    if (whitespace && titleDelimiter) return value.slice(0, index);
  }
  return value;
}

/** Extract inline, image, and reference-definition link destinations. */
export function extractMarkdownLinks(markdown) {
  const source = maskFencedCode(markdown);
  const links = [];
  const inline = /!?\[[^\]\n]*(?:\][^\]\n]*)?\]\(([^)\n]+)\)/gu;
  const reference = /^\s{0,3}\[[^\]\n]+\]:\s*(<[^>\n]+>|\S+)/gmu;
  for (const match of source.matchAll(inline)) {
    links.push({ target: unwrapDestination(match[1]), line: lineAt(source, match.index) });
  }
  for (const match of source.matchAll(reference)) {
    links.push({ target: unwrapDestination(match[1]), line: lineAt(source, match.index) });
  }
  return links.sort((left, right) => left.line - right.line || left.target.localeCompare(right.target));
}

function collectMarkdownFiles(root, directory, skippedDirectories, files) {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name);
    const relativePath = relative(root, path).replaceAll("\\", "/");
    if (isProtectedRepositoryPath(relativePath)) continue;
    if (entry.isDirectory()) {
      if (!skippedDirectories.has(entry.name)) {
        collectMarkdownFiles(root, path, skippedDirectories, files);
      }
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      files.push(path);
    }
  }
}

/** Collect repository-owned Markdown files in deterministic path order. */
export function listMarkdownFiles(options) {
  const files = [];
  collectMarkdownFiles(
    options.root,
    options.root,
    options.skippedDirectories ?? DEFAULT_SKIPPED_DIRECTORIES,
    files,
  );
  return files;
}

function localDestination(rawTarget) {
  const target = rawTarget.trim();
  if (!target || target.startsWith("#") || target.startsWith("//")) return null;
  if (/^[a-z][a-z0-9+.-]*:/iu.test(target)) return null;
  const withoutFragment = target.split("#", 1)[0]?.split("?", 1)[0] ?? "";
  if (!withoutFragment) return null;
  try {
    return decodeURIComponent(withoutFragment);
  } catch {
    return withoutFragment;
  }
}

function isInsideRoot(root, target) {
  const rel = relative(root, target);
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/** Validate every relative Markdown destination under a repository root. */
export function validateDocLinks(options) {
  const root = resolve(options.root);
  const realRoot = realpathSync(root);
  const files = listMarkdownFiles({
    root,
    skippedDirectories: options.skippedDirectories,
  });
  const failures = [];
  let linksChecked = 0;
  for (const file of files) {
    const markdown = readFileSync(file, "utf8");
    for (const link of extractMarkdownLinks(markdown)) {
      const destination = localDestination(link.target);
      if (destination === null) continue;
      linksChecked += 1;
      const target = resolve(dirname(file), destination);
      if (!isInsideRoot(root, target)) {
        failures.push({ file: relative(root, file), line: link.line, target: link.target, reason: "outside repository" });
      } else if (!existsSync(target)) {
        failures.push({ file: relative(root, file), line: link.line, target: link.target, reason: `missing ${relative(root, target)}` });
      } else if (!isInsideRoot(realRoot, realpathSync(target))) {
        failures.push({
          file: relative(root, file),
          line: link.line,
          target: link.target,
          reason: "outside repository through symlink",
        });
      }
    }
  }
  return { filesChecked: files.length, linksChecked, failures };
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const result = validateDocLinks({ root });
  if (result.failures.length > 0) {
    console.error(`FAIL docs: ${result.failures.length} broken relative Markdown link(s)`);
    for (const failure of result.failures) {
      console.error(`  - ${failure.file}:${failure.line} ${failure.target} (${failure.reason})`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`OK   docs: ${result.linksChecked} relative links across ${result.filesChecked} Markdown files resolve`);
}

const invoked = process.argv[1] && (() => {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return process.argv[1].includes("validate-doc-links");
  }
})();

if (invoked) main();
