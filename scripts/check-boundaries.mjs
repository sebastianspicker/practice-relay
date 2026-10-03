#!/usr/bin/env node
/**
 * Check the monorepo's application/package import and migration boundaries.
 *
 * This is intentionally a small, dependency-free source/config check so it can
 * run before installation. It reports every violation and exits non-zero.
 */
import { builtinModules } from "node:module";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_EXTENSIONS = new Set([".cjs", ".d.mts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);
const SCANNED_EXTENSIONS = new Set([
  ...SOURCE_EXTENSIONS,
  ".json",
  ".toml",
  ".yaml",
  ".yml",
]);
const OLD_IDENTIFIERS = [
  "@practice-relay/work-record-core",
  "@practice-relay/work-record-package",
  "@practice-relay/interop",
  "@practice-relay/movement-encode",
  "@practice-relay/mvei-workbench",
  "@practice-relay/mvei-schema-site",
  "@practice-relay/lti-mock-platform",
  "@practice-relay/api",
  "@practice-relay/web",
];
// Directories of packages/movement that ship to browsers (the `./browser/*`
// exports, `#movement-*` imports, vocabulary, glyphs, transforms, and the TS
// sources compiled into the main entry). They must never import Node builtins.
const BROWSER_SAFE_DIRECTORIES = ["packages/movement/browser", "packages/movement/glyphs", "packages/movement/src", "packages/movement/transforms", "packages/movement/vocabulary"];
const NODE_BUILTINS = new Set(builtinModules);
// Relative imports that may leave their workspace directory, keyed by importer.
// The apps' dev-only entrypoints intentionally use helpers that stay in root
// `scripts/`.
const OUT_OF_WORKSPACE_IMPORT_ALLOWLIST = new Map([
  ["apps/relay-web/src/dev.mjs", new Set(["scripts/static-server.mjs"])],
  ["apps/movement-schema-site/src/dev.mjs", new Set(["scripts/static-server.mjs"])],
  ["apps/movement-workbench/src/dev.mjs", new Set(["scripts/static-server.mjs", "scripts/contained-output.mjs"])],
]);
const OBSOLETE_SCHEMA_HOST = "mac-research.local";
const OLD_ROOT_PATTERNS = [
  /(?:^|[\s"'(`])practice-relay\/(?:apps|packages|openapi|fixtures)(?:[\/\s"'`),]|$)/u,
  /(?:^|[\s"'(`])mvei\/(?:apps|packages|fixtures)(?:[\/\s"'`),]|$)/u,
  /(?:^|[\s"'(`])packages\/(?:interop|movement-encode|work-record-core|work-record-package)(?:[\/\s"'`),]|$)/u,
];

function workspaceFiles(root, directory, extensions, files = []) {
  const absoluteDirectory = join(root, directory);
  if (!existsSync(absoluteDirectory)) return files;
  for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
    const relativePath = join(directory, entry.name).replaceAll("\\", "/");
    if (entry.isDirectory()) workspaceFiles(root, relativePath, extensions, files);
    else if (entry.isFile() && [...extensions].some((extension) => entry.name.toLowerCase().endsWith(extension))) files.push(relativePath);
  }
  return files;
}

function packageMetadata(root) {
  const packages = new Map();
  const apps = new Map();
  const manifests = new Map();
  for (const kind of ["packages", "apps"]) {
    for (const directory of workspaceFiles(root, kind, new Set([".json"]))) {
      if (!directory.endsWith("/package.json")) continue;
      const manifest = JSON.parse(readFileSync(join(root, directory), "utf8"));
      if (typeof manifest.name !== "string") continue;
      const owner = directory.split("/")[0] === "apps" ? apps : packages;
      const ownerDirectory = directory.slice(0, -"/package.json".length);
      owner.set(manifest.name, ownerDirectory);
      manifests.set(ownerDirectory, manifest);
    }
  }
  return { apps, packages, manifests };
}

function importSpecifiers(source) {
  const specs = [];
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/gu,
    /\bimport\s*["']([^"']+)["']/gu,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/gu,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specs.push(match[1]);
  }
  return specs;
}

function packageForFile(path) {
  const [kind, name] = path.split("/");
  return kind === "apps" || kind === "packages" ? `${kind}/${name}` : null;
}

function sourceFilesFor(root) {
  return [
    ...workspaceFiles(root, "apps", SOURCE_EXTENSIONS),
    ...workspaceFiles(root, "packages", SOURCE_EXTENSIONS),
  ];
}

function checkImports(root, metadata, errors) {
  for (const path of sourceFilesFor(root)) {
    const owner = packageForFile(path);
    if (!owner) continue;
    const source = readFileSync(join(root, path), "utf8");
    const ownerManifest = metadata.manifests.get(owner);
    const ownerName = ownerManifest?.name;
    const declared = new Set([
      ...Object.keys(ownerManifest?.dependencies ?? {}),
      ...Object.keys(ownerManifest?.devDependencies ?? {}),
      ...Object.keys(ownerManifest?.optionalDependencies ?? {}),
      ...Object.keys(ownerManifest?.peerDependencies ?? {}),
    ]);
    const browserSafe = BROWSER_SAFE_DIRECTORIES.some((directory) => path.startsWith(`${directory}/`));
    for (const specifier of importSpecifiers(source)) {
      if (browserSafe && (specifier.startsWith("node:") || NODE_BUILTINS.has(specifier.split("/")[0]))) {
        errors.push(`${path}: browser-safe source imports Node builtin ${specifier}`);
      }
      const packageSpecifier = specifier.startsWith("@practice-relay/")
        ? specifier.split("/").slice(0, 2).join("/")
        : null;
      const importedDirectory = packageSpecifier
        ? metadata.apps.get(packageSpecifier) ?? metadata.packages.get(packageSpecifier)
        : null;
      const importedOwner = importedDirectory
        ? `${importedDirectory.split("/")[0]}/${importedDirectory.split("/")[1]}`
        : null;
      if (packageSpecifier && packageSpecifier !== ownerName && !declared.has(packageSpecifier)) {
        errors.push(`${path}: source import ${packageSpecifier} is not declared in ${owner}/package.json`);
      }
      if (importedOwner?.startsWith("apps/") && owner.startsWith("packages/")) {
        errors.push(`${path}: package imports app ${specifier}`);
      }
      if (importedOwner?.startsWith("apps/") && owner.startsWith("apps/") && importedOwner !== owner) {
        errors.push(`${path}: app imports app ${specifier}`);
      }
      if (owner === "packages/movement" && (specifier === "@practice-relay/work-record" || metadata.packages.get(specifier) === "packages/work-record")) {
        errors.push(`${path}: movement must not import work-record`);
      }
    }

    for (const specifier of importSpecifiers(source).filter((item) => item.startsWith("."))) {
      const resolvedImport = resolve(dirname(join(root, path)), specifier);
      const normalized = relative(root, resolvedImport).replaceAll("\\", "/");
      if (normalized.startsWith("../")) continue;
      if (!normalized.startsWith(`${owner}/`) && !OUT_OF_WORKSPACE_IMPORT_ALLOWLIST.get(path)?.has(normalized)) {
        errors.push(`${path}: relative import ${specifier} leaves workspace ${owner}`);
      }
      const importedOwner = packageForFile(normalized);
      if (importedOwner?.startsWith("apps/") && owner.startsWith("packages/")) {
        errors.push(`${path}: package imports app through relative path ${specifier}`);
      }
      if (importedOwner?.startsWith("apps/") && owner.startsWith("apps/") && importedOwner !== owner) {
        errors.push(`${path}: app imports app through relative path ${specifier}`);
      }
    }
  }
}

function checkOldReferences(root, errors) {
  const paths = [
    ...workspaceFiles(root, "apps", SCANNED_EXTENSIONS),
    ...workspaceFiles(root, "packages", SCANNED_EXTENSIONS),
    ...workspaceFiles(root, "scripts", SCANNED_EXTENSIONS),
    ...workspaceFiles(root, "tests", SCANNED_EXTENSIONS),
    ...workspaceFiles(root, "deploy", SCANNED_EXTENSIONS),
    ...["docker-compose.campus-lab.yml", "docker-compose.production-lab.yml", "package.json", "pnpm-workspace.yaml", "tsconfig.base.json", "tsconfig.json"].filter((path) => existsSync(join(root, path))),
  ];
  for (const path of paths) {
    // Verification fixtures intentionally contain stale examples to exercise
    // the checks and are not maintained repository references.
    if (path === "scripts/check-boundaries.mjs" || path.endsWith(".verify.mjs")) continue;
    const source = readFileSync(join(root, path), "utf8");
    for (const identifier of OLD_IDENTIFIERS) {
      if (source.includes(identifier)) errors.push(`${path}: stale package identifier ${identifier}`);
    }
    if (source.includes(OBSOLETE_SCHEMA_HOST)) {
      errors.push(`${path}: obsolete schema host ${OBSOLETE_SCHEMA_HOST}`);
    }
    for (const pattern of OLD_ROOT_PATTERNS) {
      if (pattern.test(source)) errors.push(`${path}: stale repository root reference`);
    }
  }
}

function checkDeclaredDependencies(root, errors) {
  const required = {
    "packages/handoff": "@practice-relay/work-record",
    "packages/record-store": "@practice-relay/work-record",
    "packages/movement-toolkit": "@practice-relay/movement",
  };
  for (const [directory, dependency] of Object.entries(required)) {
    const manifestPath = join(root, directory, "package.json");
    if (!existsSync(manifestPath)) {
      errors.push(`${directory}: missing package.json`);
      continue;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const declared = { ...(manifest.dependencies ?? {}), ...(manifest.peerDependencies ?? {}) };
    if (!declared[dependency]) errors.push(`${directory}: missing declared dependency ${dependency}`);
  }
}

function checkPackageCycles(metadata, errors) {
  const graph = new Map();
  for (const [directory, manifest] of metadata.manifests) {
    if (!directory.startsWith("packages/")) continue;
    const dependencies = {
      ...(manifest.dependencies ?? {}),
      ...(manifest.optionalDependencies ?? {}),
      ...(manifest.peerDependencies ?? {}),
    };
    graph.set(
      manifest.name,
      Object.keys(dependencies).filter((name) => metadata.packages.has(name)),
    );
  }

  const visited = new Set();
  const active = new Set();
  const stack = [];
  const reported = new Set();
  const visit = (name) => {
    if (visited.has(name)) return;
    if (active.has(name)) {
      const cycleStart = stack.indexOf(name);
      const cycle = [...stack.slice(cycleStart), name];
      const key = cycle.join(" -> ");
      if (!reported.has(key)) {
        reported.add(key);
        errors.push(`package dependency cycle: ${key}`);
      }
      return;
    }
    active.add(name);
    stack.push(name);
    for (const dependency of graph.get(name) ?? []) visit(dependency);
    stack.pop();
    active.delete(name);
    visited.add(name);
  };

  for (const name of graph.keys()) visit(name);
}

/** Return all import, migration-reference, and dependency-boundary violations. */
export function checkBoundaries(root = repoRoot) {
  const errors = [];
  const metadata = packageMetadata(root);
  checkImports(root, metadata, errors);
  checkOldReferences(root, errors);
  checkDeclaredDependencies(root, errors);
  checkPackageCycles(metadata, errors);
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const errors = checkBoundaries();
  if (errors.length) {
    console.error(`Boundary check failed (${errors.length}):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log("Boundary check passed.");
  }
}
