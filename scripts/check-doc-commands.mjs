#!/usr/bin/env node
/**
 * Check maintained documentation for stale pnpm scripts and workspace names.
 * Why: command and package renames should leave one executable documentation surface.
 */
import { error as logError, log as logInfo } from "node:console";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const MAINTAINED_ROOT_FILES = new Set(["README.md", "CONTRIBUTING.md"]);
const PACKAGE_MANAGER_COMMANDS = new Set([
  "add",
  "audit",
  "create",
  "deploy",
  "dlx",
  "exec",
  "fetch",
  "import",
  "init",
  "install",
  "list",
  "licenses",
  "outdated",
  "pack",
  "patch",
  "prune",
  "publish",
  "remove",
  "setup",
  "store",
  "update",
  "version",
  "why",
]);

function walkMaintainedFiles(root, directory, files) {
  const relativeDirectory = relative(root, directory).replaceAll("\\", "/");
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name))) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (relativeDirectory === "" && ![".github", "docs", "packages"].includes(entry.name)) continue;
      if (relativeDirectory === "packages") continue;
      walkMaintainedFiles(root, file, files);
      continue;
    }
    const relativeFile = relative(root, file).replaceAll("\\", "/");
    const isMarkdown = entry.name.endsWith(".md");
    const isGitHubTemplate = relativeFile.startsWith(".github/") &&
      (entry.name.endsWith(".yml") || entry.name.endsWith(".yaml"));
    if (
      isMarkdown &&
      (MAINTAINED_ROOT_FILES.has(relativeFile) ||
        relativeFile.startsWith("docs/") ||
        relativeFile === "packages/README.md" ||
        relativeFile.startsWith(".github/"))
    ) {
      files.push(file);
    } else if (isGitHubTemplate) {
      files.push(file);
    }
  }
}

/** Return maintained Markdown and GitHub template files in stable order. */
export function listMaintainedDocFiles(root) {
  const files = [];
  walkMaintainedFiles(resolve(root), resolve(root), files);
  return files.sort((left, right) => left.localeCompare(right));
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function workspaceData(root) {
  const packageNames = new Set();
  const packageDirectories = new Set();
  for (const area of ["apps", "packages"]) {
    const areaPath = join(root, area);
    let entries;
    try {
      entries = readdirSync(areaPath, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const relativeDirectory = `${area}/${entry.name}`;
      const manifestPath = join(areaPath, entry.name, "package.json");
      try {
        const manifest = readJson(manifestPath);
        if (typeof manifest.name === "string") packageNames.add(manifest.name);
        packageDirectories.add(relativeDirectory);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
  }
  return { packageNames, packageDirectories };
}

function lineNumber(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

function finding({ file, source, offset, kind, value, message }) {
  return { file, line: lineNumber(source, offset), kind, value, message };
}

function scanSource({ file, source, rootScripts, packageNames, packageDirectories }) {
  const findings = [];
  let commandsChecked = 0;
  let packageReferencesChecked = 0;

  const commandPattern = /\bpnpm\s+((?:run\s+)?[a-z][a-z0-9:_-]*)\b/giu;
  for (const match of source.matchAll(commandPattern)) {
    const rawCommand = match[1].trim();
    const command = rawCommand.startsWith("run ") ? rawCommand.slice(4) : rawCommand;
    if (PACKAGE_MANAGER_COMMANDS.has(command)) continue;
    commandsChecked += 1;
    if (!rootScripts.has(command)) {
      findings.push(finding({
        file,
        source,
        offset: match.index ?? 0,
        kind: "root-script",
        value: command,
        message: `pnpm script is not defined in root package.json: ${command}`,
      }));
    }
  }

  const packagePattern = /@practice-relay\/[A-Za-z0-9][A-Za-z0-9._-]*/gu;
  for (const match of source.matchAll(packagePattern)) {
    const packageReference = match[0];
    packageReferencesChecked += 1;
    if (!packageNames.has(packageReference)) {
      findings.push(finding({
        file,
        source,
        offset: match.index ?? 0,
        kind: "package-name",
        value: packageReference,
        message: `workspace package is not present: ${packageReference}`,
      }));
    }
  }

  const pathPattern = /(?<![\w.-])(?:apps|packages)\/[A-Za-z0-9][A-Za-z0-9_-]*(?=\/|[\s`"'():,]|$)/gu;
  for (const match of source.matchAll(pathPattern)) {
    const packagePath = match[0];
    if (!packageDirectories.has(packagePath)) {
      findings.push(finding({
        file,
        source,
        offset: match.index ?? 0,
        kind: "package-path",
        value: packagePath,
        message: `workspace path is not present: ${packagePath}`,
      }));
    }
  }

  const legacyPathPattern = /(?<![@\w.-])(?:practice-relay|mvei)\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*/giu;
  for (const match of source.matchAll(legacyPathPattern)) {
    findings.push(finding({
      file,
      source,
      offset: match.index ?? 0,
      kind: "legacy-path",
      value: match[0],
      message: `legacy repository path is not maintained: ${match[0]}`,
    }));
  }

  return { findings, commandsChecked, packageReferencesChecked };
}

/** Scan maintained docs against the current root scripts and workspace packages. */
export function checkDocCommands({ root, files } = {}) {
  const repositoryRoot = resolve(root ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
  const manifest = readJson(join(repositoryRoot, "package.json"));
  const rootScripts = new Set(Object.keys(manifest.scripts ?? {}));
  const { packageNames, packageDirectories } = workspaceData(repositoryRoot);
  const maintainedFiles = files
    ? files.map((file) => resolve(repositoryRoot, file))
    : listMaintainedDocFiles(repositoryRoot);
  const findings = [];
  let commandsChecked = 0;
  let packageReferencesChecked = 0;
  for (const file of maintainedFiles) {
    const source = readFileSync(file, "utf8");
    const relativeFile = relative(repositoryRoot, file).replaceAll("\\", "/");
    const result = scanSource({
      file: relativeFile,
      source,
      rootScripts,
      packageNames,
      packageDirectories,
    });
    findings.push(...result.findings);
    commandsChecked += result.commandsChecked;
    packageReferencesChecked += result.packageReferencesChecked;
  }
  return {
    filesChecked: maintainedFiles.length,
    commandsChecked,
    packageReferencesChecked,
    findings,
  };
}

function main() {
  const result = checkDocCommands();
  if (result.findings.length > 0) {
    logError(`FAIL doc commands: ${result.findings.length} stale reference(s)`);
    for (const issue of result.findings) {
      logError(`  - ${issue.file}:${issue.line} ${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }
  logInfo(`Doc command check passed (${result.filesChecked} files, ${result.commandsChecked} root scripts, ${result.packageReferencesChecked} package references).`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main();
