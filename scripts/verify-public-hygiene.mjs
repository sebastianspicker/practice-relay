/**
 * Verify that a release candidate exposes no local residue or stale public evidence.
 *
 * Candidate mode permits explicitly documented external blockers. `--strict`
 * additionally requires a clean Git checkout, a private reporting route, and a
 * current PNG for every screenshot source.
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isProtectedRepositoryPath } from "./protected-paths.mjs";
import {
  hasSafeRepositoryPath,
  readRepositoryText,
  resolveExistingRepositoryPath,
} from "./repository-files.mjs";
import { findWorkspacePackageMetadataErrors } from "./workspace-package-metadata.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_ROOTS = [
  ".github",
  "deploy",
  "docs",
  "fixtures",
  "mvei",
  "packages",
  "practice-relay",
  "scripts",
  "tests",
];
const ROOT_FILES = [
  ".gitignore",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "PRODUCT.md",
  "README.md",
  "RELEASING.md",
  "RELEASE_STATUS.md",
  "SECURITY.md",
  "docker-compose.campus-lab.yml",
  "docker-compose.production-lab.yml",
  "package.json",
  "pnpm-workspace.yaml",
  "release.json",
];
const SKIP_DIRS = new Set([
  ".agents",
  ".codegraph",
  ".codex",
  ".git",
  ".pnpm-store",
  ".serena",
  ".scratch",
  "blob-report",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "tmp",
]);
const TEXT_EXTENSIONS = new Set([
  "",
  ".cjs",
  ".css",
  ".cts",
  ".d.ts",
  ".html",
  ".ics",
  ".js",
  ".json",
  ".jsonl",
  ".md",
  ".mjs",
  ".mts",
  ".sh",
  ".toml",
  ".ts",
  ".txt",
  ".xml",
  ".xsd",
  ".yaml",
  ".yml",
]);
const EXCLUDED_SCANNER_FILES = new Set([
  "scripts/verify-public-hygiene.mjs",
]);
const REQUIRED_IGNORE_RULES = [
  "/AGENTS.md",
  "node_modules/",
  ".pnpm-store/",
  "*.log",
  ".env",
  ".env.*",
  "!.env.example",
  ".codegraph/",
  ".agents/",
  ".codex/",
  ".serena/",
  "/data/**",
  "*.pem",
  "*.key",
  "*.p12",
  "*.pfx",
];
const REQUIRED_PUBLIC_FILES = [
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "NOTICE",
  "PRODUCT.md",
  "README.md",
  "RELEASING.md",
  "RELEASE_STATUS.md",
  "SECURITY.md",
  "docs/ALPHA.md",
  "docs/RELEASE-CHECKLIST.md",
];

function normalizedExt(path) {
  return path.endsWith(".d.ts") || path.endsWith(".d.mts")
    ? ".d.ts"
    : extname(path).toLowerCase();
}

/** Return whether a path is protected, generated, vendored, or local tool state. */
export function isSkippedPublicPath(relativePath) {
  if (isProtectedRepositoryPath(relativePath)) return true;
  const parts = relativePath.split("/");
  return parts.some((part) => SKIP_DIRS.has(part));
}

function collectTextFiles(root, relativeDir, files) {
  if (!hasSafeRepositoryPath(root, relativeDir)) return;
  const { absolute: absoluteDir, info } = resolveExistingRepositoryPath(root, relativeDir);
  if (!info.isDirectory()) return;
  for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
    const candidate = join(relativeDir, entry.name).replaceAll("\\", "/");
    if (isSkippedPublicPath(candidate) || entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      collectTextFiles(root, candidate, files);
    } else if (
      entry.isFile() &&
      TEXT_EXTENSIONS.has(normalizedExt(candidate)) &&
      !EXCLUDED_SCANNER_FILES.has(candidate)
    ) {
      files.push(candidate);
    }
  }
}

/** Find unsafe local-machine or placeholder repository references in text. */
export function findUnsafePublicText(text) {
  const findings = [];
  const checks = [
    ["macOS home path", /\/Users\/[A-Za-z0-9._-]+\//g],
    ["Linux home path", /\/home\/[A-Za-z0-9._-]+\//g],
    ["Windows home path", /[A-Za-z]:[\\]Users[\\][^\\\s]+[\\]/g],
    ["placeholder GitHub URL", /github\.com\/local(?:\/|\b)/gi],
  ];
  for (const [label, pattern] of checks) {
    for (const match of text.matchAll(pattern)) {
      findings.push({ label, index: match.index ?? 0, value: match[0] });
    }
  }
  return findings;
}

/** Return whether the security policy still records an unconfigured private route. */
export function hasUnconfiguredConfidentialReporting(text) {
  return /\bconfidential reporting\b[^\n.]{0,40}\bnot configured\b/iu.test(text);
}

function isMissingLocalHtmlReference(target, sourcePath, root) {
  const absolute = target.startsWith("/")
    ? join(root, target.slice(1))
    : resolve(dirname(sourcePath), target);
  const relativeTarget = relative(root, absolute).replaceAll("\\", "/");
  return (
    relativeTarget === ".." ||
    relativeTarget.startsWith("../") ||
    !hasSafeRepositoryPath(root, absolute)
  );
}

/** Find local HTML asset references that do not resolve inside the repository. */
export function findMissingLocalHtmlReferences(html, sourcePath, root = repoRoot) {
  const missing = [];
  const referencePattern = /\b(?:href|src)=["']([^"']+)["']/giu;
  for (const match of html.matchAll(referencePattern)) {
    const reference = match[1];
    if (
      !reference ||
      reference.startsWith("#") ||
      reference.startsWith("//") ||
      /^[a-z][a-z0-9+.-]*:/iu.test(reference)
    ) {
      continue;
    }
    const target = reference.split(/[?#]/u, 1)[0];
    if (!target) continue;
    if (isMissingLocalHtmlReference(target, sourcePath, root)) {
      missing.push(reference);
    }
  }
  return missing;
}

function lineNumber(text, index) {
  return text.slice(0, index).split("\n").length;
}

function scanText(root, errors) {
  const files = ROOT_FILES.filter((path) => hasSafeRepositoryPath(root, path));
  for (const scanRoot of SCAN_ROOTS) collectTextFiles(root, scanRoot, files);
  for (const path of files) {
    const text = readRepositoryText(root, path);
    for (const finding of findUnsafePublicText(text)) {
      errors.push(
        `${path}:${lineNumber(text, finding.index)} ${finding.label}: ${finding.value}`,
      );
    }
  }
  return files.length;
}

function verifyRequiredFiles(root, errors) {
  for (const path of REQUIRED_PUBLIC_FILES) {
    if (!hasSafeRepositoryPath(root, path)) {
      errors.push(`missing or unsafe required public file: ${path}`);
    }
  }
  if (hasSafeRepositoryPath(root, "LICENSE")) {
    const license = readRepositoryText(root, "LICENSE");
    if (
      license.split("\n").length < 180 ||
      !license.includes("TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION") ||
      !license.includes("9. Accepting Warranty or Additional Liability")
    ) {
      errors.push("LICENSE is not the complete Apache-2.0 text");
    }
  }
}

function verifyIgnoreRules(root, errors) {
  const ignore = readRepositoryText(root, ".gitignore")
    .split(/\r?\n/u)
    .map((line) => line.trim());
  for (const rule of REQUIRED_IGNORE_RULES) {
    if (!ignore.includes(rule)) errors.push(`.gitignore missing rule: ${rule}`);
  }
}

function verifyReleaseIdentity(root, errors) {
  const release = JSON.parse(readRepositoryText(root, "release.json"));
  const packageJson = JSON.parse(readRepositoryText(root, "package.json"));
  if (release.version !== packageJson.version) {
    errors.push(`version mismatch: release.json=${release.version} package.json=${packageJson.version}`);
  }
  const requiredVersionSurfaces = [
    "README.md",
    "docs/README.md",
    "docs/ALPHA.md",
    "docs/images/0.4.0-alpha.1/README.md",
    "practice-relay/README.md",
    "mvei/README.md",
    "packages/README.md",
    ".github/ISSUE_TEMPLATE/bug_report.yml",
  ];
  for (const path of requiredVersionSurfaces) {
    if (!hasSafeRepositoryPath(root, path)) {
      errors.push(`missing version surface: ${path}`);
    } else if (!readRepositoryText(root, path).includes(release.version)) {
      errors.push(`${path} does not name release ${release.version}`);
    }
  }
  return release;
}

function verifyPng(root, path, label, errors) {
  if (!hasSafeRepositoryPath(root, path)) {
    errors.push(`missing PNG evidence: ${label}`);
    return;
  }
  const { absolute } = resolveExistingRepositoryPath(root, path);
  const data = readFileSync(absolute);
  if (data.length < 10_000) errors.push(`PNG too small: ${label}`);
  const isPng = data.subarray(0, 8).equals(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  if (!isPng || data.length < 24) {
    errors.push(`invalid PNG signature: ${label}`);
    return;
  }
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  if (width < 1000 || height < 700) {
    errors.push(`PNG dimensions too small: ${label} (${width}x${height})`);
  }
}

function verifyScreenshots(root, errors) {
  const gallery = join(root, "docs/images/0.4.0-alpha.1");
  for (const base of ["practice-relay-web", "mvei-schema-site", "mvei-workbench"]) {
    const source = join(gallery, `${base}.source.html`);
    if (!hasSafeRepositoryPath(root, source)) {
      errors.push(`missing product evidence: ${relative(root, source)}`);
      continue;
    }
    const missing = findMissingLocalHtmlReferences(
      readRepositoryText(root, source),
      source,
      root,
    );
    for (const reference of missing) {
      errors.push(`${relative(root, source)} has missing local reference: ${reference}`);
    }
  }
  for (const base of ["practice-relay-web", "mvei-schema-site", "mvei-workbench"]) {
    verifyPng(
      root,
      join(gallery, `${base}.png`),
      `0.4.0-alpha.1/${base}.png`,
      errors,
    );
  }
}

function verifyCandidateResidue(root, errors) {
  const forbidden = [
    "docs/images/0.4.0-alpha.1/practice-relay-concept.png",
    "docs/images/0.4.0-alpha.1/mvei-workbench-concept.png",
    "docs/images/archive/0.2.7-alpha.1",
    "docs/pilot-pack/preference-survey.md",
    "practice-relay/docs/mvp.md",
    "practice-relay/docs/prd.md",
    "practice-relay/docs/roadmap.md",
    "mvei/docs/mvp.md",
    "mvei/docs/prd.md",
    "mvei/docs/roadmap.md",
    "docs/images/alpha/faculty-path/X01-out-of-path-stubs.png",
    "docs/images/alpha/faculty-path/X01-out-of-path-stubs.source.html",
  ];
  for (const path of forbidden) {
    if (existsSync(join(root, path))) errors.push(`obsolete release residue exists: ${path}`);
  }
}

function verifyStrictExternalState(root, strict, errors, warnings) {
  const security = readRepositoryText(root, "SECURITY.md");
  if (hasUnconfiguredConfidentialReporting(security)) {
    (strict ? errors : warnings).push("confidential security reporting route is not configured");
  }
  const insideWorktree = spawnSync(
    "git",
    ["rev-parse", "--is-inside-work-tree"],
    { cwd: root, encoding: "utf8" },
  );
  if (insideWorktree.status !== 0 || insideWorktree.stdout.trim() !== "true") {
    (strict ? errors : warnings).push("Git metadata is unavailable; tracked-set and clean-tree checks were skipped");
    return;
  }
  const status = spawnSync("git", ["status", "--short"], {
    cwd: root,
    encoding: "utf8",
  });
  if (status.status !== 0) {
    errors.push(`git status failed: ${(status.stderr || status.stdout).trim()}`);
  } else if (strict && status.stdout.trim()) {
    errors.push("Git worktree is not clean");
  }
}

/** Collect release-hygiene errors and documented candidate warnings. */
export function collectPublicHygiene(root = repoRoot, options = {}) {
  const strict = options.strict === true;
  const errors = [];
  const warnings = [];
  const scannedFiles = scanText(root, errors);
  verifyRequiredFiles(root, errors);
  verifyIgnoreRules(root, errors);
  const release = verifyReleaseIdentity(root, errors);
  const packageMetadata = findWorkspacePackageMetadataErrors(root, release.version);
  errors.push(...packageMetadata.errors);
  verifyScreenshots(root, errors);
  verifyCandidateResidue(root, errors);
  verifyStrictExternalState(root, strict, errors, warnings);
  return {
    errors,
    warnings,
    scannedFiles,
    strict,
    release,
    packageManifestCount: packageMetadata.manifests.length,
  };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = collectPublicHygiene(repoRoot, {
    strict: process.argv.includes("--strict"),
  });
  for (const warning of result.warnings) console.warn(`WARN public-hygiene: ${warning}`);
  for (const error of result.errors) console.error(`ERROR public-hygiene: ${error}`);
  if (result.errors.length > 0) process.exitCode = 1;
  else {
    console.log(
      `OK public-hygiene: ${result.scannedFiles} files; version ${result.release.version}; ` +
        `${result.packageManifestCount} manifests; ` +
        `${result.warnings.length} documented warning(s); mode=${result.strict ? "strict" : "candidate"}`,
    );
  }
}
