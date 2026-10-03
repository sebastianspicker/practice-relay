#!/usr/bin/env node
/**
 * Whole-repository Markdown link validation.
 *
 * Why: public research and implementation documents must not accumulate broken
 * relative links outside the smaller evidence-entrypoint validation surface.
 */
import { error as logError, log as logInfo } from "node:console";
import { readdirSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { maskFencedCode } from "./markdown-fences.mjs";
import { isProtectedRepositoryPath } from "./protected-paths.mjs";
import {
  readRepositoryText,
  resolveExistingRepositoryPath,
} from "./repository-files.mjs";

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

function closingBracketBeforeLineEnd(source, start) {
  for (let index = start; index < source.length; index += 1) {
    if (source.at(index) === "]") return index;
    if (source.at(index) === "\n") return null;
  }
  return null;
}

function lineEnd(source, start) {
  for (let index = start; index < source.length; index += 1) {
    if (source.at(index) === "\n") return index;
  }
  return source.length;
}

function destinationRange(source, openingParenthesis) {
  const start = openingParenthesis + 1;
  let end = start;
  while (
    end < source.length &&
    source.at(end) !== ")" &&
    source.at(end) !== "\n"
  ) {
    end += 1;
  }
  return source.at(end) === ")" && end > start ? { start, end } : null;
}

function inlineDestinationRange(source, labelStart) {
  const firstClosingBracket = closingBracketBeforeLineEnd(source, labelStart + 1);
  if (firstClosingBracket === null) return { range: null, next: lineEnd(source, labelStart + 1) };
  const extraClosingBracket = closingBracketBeforeLineEnd(source, firstClosingBracket + 1);
  if (extraClosingBracket !== null && source.at(extraClosingBracket + 1) === "(") {
    const range = destinationRange(source, extraClosingBracket + 1);
    if (range !== null) return { range, next: range.end + 1 };
  }
  if (source.at(firstClosingBracket + 1) === "(") {
    const range = destinationRange(source, firstClosingBracket + 1);
    if (range !== null) return { range, next: range.end + 1 };
  }
  return { range: null, next: firstClosingBracket + 1 };
}

function scanInlineLinks(source, links) {
  let index = 0;
  let line = 1;
  while (index < source.length) {
    if (source.at(index) === "\n") {
      line += 1;
      index += 1;
      continue;
    }
    const labelStart = source.at(index) === "!" && source.at(index + 1) === "["
      ? index + 1
      : source.at(index) === "["
        ? index
        : null;
    if (labelStart === null) {
      index += 1;
      continue;
    }
    const candidate = inlineDestinationRange(source, labelStart);
    if (candidate.range === null) {
      index = candidate.next;
      continue;
    }
    links.push({ target: unwrapDestination(source.slice(candidate.range.start, candidate.range.end)), line });
    index = candidate.next;
  }
}

function appendReferenceLinks(source, links) {
  const reference = /^\s{0,3}\[[^\]\n]+\]:\s*(<[^>\n]+>|\S+)/gmu;
  let index = 0;
  let line = 1;
  for (const match of source.matchAll(reference)) {
    const matchIndex = match.index ?? 0;
    while (index < matchIndex) {
      if (source.at(index) === "\n") line += 1;
      index += 1;
    }
    links.push({ target: unwrapDestination(match.at(1)), line });
  }
}

/** Extract inline, image, and reference-definition link destinations. */
export function extractMarkdownLinks(markdown) {
  const source = maskFencedCode(markdown);
  const links = [];
  scanInlineLinks(source, links);
  appendReferenceLinks(source, links);
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

function targetFailureReason(root, target, error) {
  if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
    return `missing ${relative(root, target)}`;
  }
  return error instanceof Error ? error.message : "unreadable repository path";
}

/** Validate every relative Markdown destination under a repository root. */
export function validateDocLinks(options) {
  const root = resolve(options.root);
  const rootInfo = resolveExistingRepositoryPath(root, ".");
  if (!rootInfo.info.isDirectory()) throw new Error("repository root is not a directory");
  const files = listMarkdownFiles({
    root,
    skippedDirectories: options.skippedDirectories,
  });
  const failures = [];
  let linksChecked = 0;
  for (const file of files) {
    const markdown = readRepositoryText(root, file);
    for (const link of extractMarkdownLinks(markdown)) {
      const destination = localDestination(link.target);
      if (destination === null) continue;
      linksChecked += 1;
      const target = resolve(dirname(file), destination);
      if (!isInsideRoot(root, target)) {
        failures.push({ file: relative(root, file), line: link.line, target: link.target, reason: "outside repository" });
        continue;
      }
      try {
        const resolvedTarget = resolveExistingRepositoryPath(root, target);
        if (!resolvedTarget.info.isFile() && !resolvedTarget.info.isDirectory()) {
          failures.push({
            file: relative(root, file),
            line: link.line,
            target: link.target,
            reason: "target is not a regular file or directory",
          });
        }
      } catch (error) {
        failures.push({
          file: relative(root, file),
          line: link.line,
          target: link.target,
          reason: targetFailureReason(root, target, error),
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
    logError(`FAIL docs: ${result.failures.length} broken relative Markdown link(s)`);
    for (const failure of result.failures) {
      logError(`  - ${failure.file}:${failure.line} ${failure.target} (${failure.reason})`);
    }
    process.exitCode = 1;
    return;
  }
  logInfo(`OK   docs: ${result.linksChecked} relative links across ${result.filesChecked} Markdown files resolve`);
}

const invoked = process.argv[1] && (() => {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return process.argv[1].includes("validate-doc-links");
  }
})();

if (invoked) main();
