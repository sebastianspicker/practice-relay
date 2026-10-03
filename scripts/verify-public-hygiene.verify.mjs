/** Deterministic PATH-hijack verification for public-hygiene Git probes. */
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { collectPublicHygiene } from "./verify-public-hygiene.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const trustedGitExecutable = "/usr/bin/git";
const trustedTeeExecutable = "/usr/bin/tee";
const trustedChmodExecutable = "/bin/chmod";

function requireIncludes(values, value, label) {
  if (!values.includes(value)) throw new Error(`${label}: missing ${value}`);
}

function requireExcludes(values, value, label) {
  if (values.includes(value)) throw new Error(`${label}: unexpectedly found ${value}`);
}

function requireSuccessfulHelper(result, label) {
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${(result.stderr || result.stdout).trim()}`);
  }
}

function requireNoGitStatusFailure(result, label) {
  if (result.errors.some((error) => error.startsWith("git status failed:"))) {
    throw new Error(`${label}: unexpectedly found git status failure`);
  }
}

function verifyResultClassification(candidate, strict, insideWorktree, status) {
  const reportingWarning = "confidential security reporting route is not configured";
  requireIncludes(candidate.warnings, reportingWarning, "candidate reporting warning");
  requireIncludes(strict.errors, reportingWarning, "strict reporting error");

  const metadataMessage = "Git metadata is unavailable; tracked-set and clean-tree checks were skipped";
  if (insideWorktree.status !== 0 || insideWorktree.stdout.trim() !== "true") {
    requireIncludes(candidate.warnings, metadataMessage, "candidate metadata warning");
    requireIncludes(strict.errors, metadataMessage, "strict metadata error");
    return;
  }

  requireExcludes(candidate.warnings, metadataMessage, "candidate metadata warning");
  requireExcludes(strict.errors, metadataMessage, "strict metadata error");
  if (status.status !== 0) {
    const statusMessage = `git status failed: ${(status.stderr || status.stdout).trim()}`;
    requireIncludes(candidate.errors, statusMessage, "candidate Git status error");
    requireIncludes(strict.errors, statusMessage, "strict Git status error");
  } else if (status.stdout.trim()) {
    requireNoGitStatusFailure(candidate, "candidate Git status error");
    requireNoGitStatusFailure(strict, "strict Git status error");
    requireIncludes(strict.errors, "Git worktree is not clean", "strict dirty-worktree error");
    requireExcludes(candidate.errors, "Git worktree is not clean", "candidate dirty-worktree error");
  } else {
    requireNoGitStatusFailure(candidate, "candidate Git status error");
    requireNoGitStatusFailure(strict, "strict Git status error");
    requireExcludes(strict.errors, "Git worktree is not clean", "strict dirty-worktree error");
  }
}

function verifyTrustedGitPath() {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "practice-relay-public-hygiene-"));
  const fakeGit = join(fixtureRoot, "git");
  const originalPath = process.env.PATH;
  try {
    const fakeGitScript = [
      "#!/bin/sh",
      "if [ \"$1\" = \"rev-parse\" ]; then",
      "  printf 'false\\n'",
      "  exit 0",
      "fi",
      "printf 'ambient PATH git selected\\n' >&2",
      "exit 86",
      "",
    ].join("\n");
    requireSuccessfulHelper(
      spawnSync(trustedTeeExecutable, [fakeGit], {
        encoding: "utf8",
        input: fakeGitScript,
      }),
      "fake git creation",
    );
    requireSuccessfulHelper(
      spawnSync(trustedChmodExecutable, ["700", fakeGit], { encoding: "utf8" }),
      "fake git permissions",
    );
    process.env.PATH = `${fixtureRoot}${delimiter}${originalPath ?? ""}`;

    const insideWorktree = spawnSync(
      trustedGitExecutable,
      ["rev-parse", "--is-inside-work-tree"],
      { cwd: repositoryRoot, encoding: "utf8" },
    );
    const status = spawnSync(trustedGitExecutable, ["status", "--short"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });
    const candidate = collectPublicHygiene(repositoryRoot);
    const strict = collectPublicHygiene(repositoryRoot, { strict: true });

    verifyResultClassification(candidate, strict, insideWorktree, status);
  } finally {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
  return true;
}

function verifyPagesDemoContract() {
  const result = collectPublicHygiene(repositoryRoot);
  const pagesErrors = result.errors.filter((error) => error.includes("Pages demo"));
  assert.deepEqual(pagesErrors, [], "Pages demo workflow, artifact, and documentation contract");
  assert.equal(
    result.errors.some((error) => /PNG (evidence|too small|dimensions|signature)/u.test(error)),
    false,
    "PNG screenshots are not a public-hygiene release requirement",
  );
  return true;
}

export const verificationComplete = verifyTrustedGitPath() && verifyPagesDemoContract();
