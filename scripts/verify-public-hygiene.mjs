/**
 * Verify that a release candidate exposes no local residue or stale public evidence.
 *
 * Candidate mode permits explicitly documented external blockers. `--strict`
 * additionally requires a clean Git checkout and a private reporting route.
 * Pages evidence must be the loaded static application, never a screenshot.
 */
import {
  existsSync,
  readdirSync,
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
const TRUSTED_GIT_EXECUTABLE = "/usr/bin/git";
const SCAN_ROOTS = [
  ".github",
  "apps",
  "deploy",
  "docs",
  "fixtures",
  "packages",
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
  "node_modules/",
  ".pnpm-store/",
  "*.log",
  ".env",
  ".env.*",
  "!.env.example",
  ".codegraph/",
  ".agents/",
  ".claude/",
  ".codex/",
  ".cursor/",
  ".serena/",
  "AGENTS.md",
  "CODEX.md",
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
  "SECURITY.md",
  "docs/ALPHA.md",
  "docs/RELEASE-CHECKLIST.md",
];
const PAGES_WORKFLOW_PATH = ".github/workflows/pages.yml";
const PAGES_ARTIFACT_PATH = "apps/relay-web/dist";
const PAGES_DEMO_URL = "https://sebastianspicker.github.io/practice-relay/";
const REQUIRED_PAGES_ASSETS = [
  "apps/relay-web/src/index.html",
  "apps/relay-web/src/app.css",
  "apps/relay-web/src/practice-relay-app.mjs",
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
    "docs/relay/README.md",
    "docs/movement/README.md",
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

function verifyPagesDemoEvidence(root, errors) {
  if (!hasSafeRepositoryPath(root, PAGES_WORKFLOW_PATH)) {
    errors.push(`missing Pages demo workflow: ${PAGES_WORKFLOW_PATH}`);
    return;
  }

  const workflow = readRepositoryText(root, PAGES_WORKFLOW_PATH);
  const workflowRequirements = [
    ["Node 24 setup", /actions\/setup-node@v4[\s\S]*node-version:\s*24/u],
    [
      "dependency-free relay-web test gate",
      /node --test apps\/relay-web\/test\/\*\.verify\.mjs/u,
    ],
    ["Pages artifact upload", /actions\/upload-pages-artifact@v3/u],
    ["relay-web static artifact path", /path:\s*apps\/relay-web\/dist/u],
    ["Pages deployment", /actions\/deploy-pages@v4/u],
  ];
  for (const [label, pattern] of workflowRequirements) {
    if (!pattern.test(workflow)) errors.push(`Pages demo workflow lacks ${label}`);
  }

  for (const path of REQUIRED_PAGES_ASSETS) {
    if (!hasSafeRepositoryPath(root, path)) {
      errors.push(`missing Pages demo artifact asset: ${path}`);
    }
  }
  if (hasSafeRepositoryPath(root, "apps/relay-web/src/index.html")) {
    const page = readRepositoryText(root, "apps/relay-web/src/index.html");
    for (const reference of ["./app.css", "./practice-relay-app.mjs"]) {
      if (!page.includes(reference)) {
        errors.push(`Pages demo artifact does not load ${reference}`);
      }
    }
  }

  for (const path of ["README.md", "RELEASING.md", "docs/ALPHA.md", "docs/RELEASE-CHECKLIST.md"]) {
    const document = readRepositoryText(root, path);
    if (!document.includes(PAGES_DEMO_URL) || !document.includes(PAGES_ARTIFACT_PATH)) {
      errors.push(`Pages demo documentation is not linked to source and expected URL: ${path}`);
    }
  }
  const alpha = readRepositoryText(root, "docs/ALPHA.md");
  for (const disclosure of [
    "synthetic, sanitized local mock data",
    "simulated",
    "no API or service writes",
    "deployment readiness",
    "institutional adoption",
  ]) {
    if (!alpha.includes(disclosure)) {
      errors.push(`Pages demo documentation omits required disclosure: ${disclosure}`);
    }
  }
}

function verifyCandidateResidue(root, errors) {
  const forbidden = [
    "docs/images/0.4.0-alpha.1/practice-relay-concept.png",
    "docs/images/0.4.0-alpha.1/mvei-workbench-concept.png",
    "docs/images/0.4.0-alpha.1/lti-mock-admin.png",
    "docs/images/0.4.0-alpha.1/mvei-corpus-site.png",
    "docs/images/archive/0.2.7-alpha.1",
    "docs/pilot-pack/preference-survey.md",
    "docs/relay/mvp.md",
    "docs/relay/prd.md",
    "docs/relay/roadmap.md",
    "docs/movement/mvp.md",
    "docs/movement/prd.md",
    "docs/movement/roadmap.md",
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
    TRUSTED_GIT_EXECUTABLE,
    ["rev-parse", "--is-inside-work-tree"],
    { cwd: root, encoding: "utf8" },
  );
  if (insideWorktree.status !== 0 || insideWorktree.stdout.trim() !== "true") {
    (strict ? errors : warnings).push("Git metadata is unavailable; tracked-set and clean-tree checks were skipped");
    return;
  }
  const status = spawnSync(TRUSTED_GIT_EXECUTABLE, ["status", "--short"], {
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
  verifyPagesDemoEvidence(root, errors);
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
