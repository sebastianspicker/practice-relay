/** Deterministic adversarial verification for package-manifest path containment. */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { resolvePackageEntry } from "./package-paths.mjs";

function requirePackageError(callback, message, label) {
  assert.throws(
    callback,
    (error) => {
      if (!(error instanceof Error)) return false;
      assert.doesNotMatch(
        error.message,
        /^(?:contained|repository) path/u,
        `${label}: shared error leaked`,
      );
      return error.message === message;
    },
    label,
  );
}

function verifyOrdinaryEntries(repositoryRoot, packageDirectory) {
  const file = join(packageDirectory, "ordinary.txt");
  const directory = join(packageDirectory, "directory");
  writeFileSync(file, "ordinary\n", "utf8");
  mkdirSync(directory);
  assert.equal(
    resolvePackageEntry(repositoryRoot, packageDirectory, "ordinary.txt"),
    file,
    "ordinary file absolute return",
  );
  assert.equal(
    resolvePackageEntry(repositoryRoot, packageDirectory, "directory"),
    directory,
    "ordinary directory absolute return",
  );
  assert.equal(
    resolvePackageEntry(repositoryRoot, packageDirectory, "missing.txt"),
    resolve(packageDirectory, "missing.txt"),
    "missing target absolute return",
  );
}

function verifyLexicalRejections(repositoryRoot, packageDirectory, fixtureParent) {
  requirePackageError(
    () => resolvePackageEntry(repositoryRoot, packageDirectory, ""),
    "package path must be a non-empty string",
    "empty entry rejection",
  );
  requirePackageError(
    () => resolvePackageEntry(repositoryRoot, packageDirectory, "bad\0entry"),
    "package path must be a non-empty string",
    "NUL entry rejection",
  );
  requirePackageError(
    () => resolvePackageEntry(repositoryRoot, packageDirectory, "../outside.txt"),
    "package path escapes its package: ../outside.txt",
    "package escape rejection",
  );
  requirePackageError(
    () => resolvePackageEntry(repositoryRoot, join(fixtureParent, "outside-package"), "outside.txt"),
    "package path reaches a protected location: outside.txt",
    "repository escape rejection",
  );
  requirePackageError(
    () => resolvePackageEntry(repositoryRoot, packageDirectory, ".git/config"),
    "package path reaches a protected location: .git/config",
    "protected lexical path rejection",
  );
}

function verifyCanonicalRejections(repositoryRoot, packageDirectory, fixtureParent) {
  const externalDirectory = join(fixtureParent, "external");
  mkdirSync(externalDirectory);
  writeFileSync(join(externalDirectory, "outside.txt"), "outside\n", "utf8");
  symlinkSync(join(externalDirectory, "outside.txt"), join(packageDirectory, "final-link.txt"));
  requirePackageError(
    () => resolvePackageEntry(repositoryRoot, packageDirectory, "final-link.txt"),
    "package path is a symlink: final-link.txt",
    "final symlink rejection",
  );

  symlinkSync(externalDirectory, join(packageDirectory, "outside-parent"), "dir");
  requirePackageError(
    () => resolvePackageEntry(repositoryRoot, packageDirectory, "outside-parent/outside.txt"),
    "package path resolves outside its package: outside-parent/outside.txt",
    "external parent symlink rejection",
  );

  const siblingPackage = join(repositoryRoot, "packages", "sibling");
  mkdirSync(siblingPackage);
  writeFileSync(join(siblingPackage, "sibling.txt"), "sibling\n", "utf8");
  symlinkSync(siblingPackage, join(packageDirectory, "sibling-parent"), "dir");
  requirePackageError(
    () => resolvePackageEntry(repositoryRoot, packageDirectory, "sibling-parent/sibling.txt"),
    "package path resolves outside its package: sibling-parent/sibling.txt",
    "in-repository parent symlink rejection",
  );
}

function verifyCanonicalProtectedTarget(repositoryRoot) {
  const protectedDirectory = join(repositoryRoot, ".git");
  mkdirSync(protectedDirectory);
  writeFileSync(join(protectedDirectory, "config"), "protected\n", "utf8");
  symlinkSync(protectedDirectory, join(repositoryRoot, "protected-parent"), "dir");
  requirePackageError(
    () => resolvePackageEntry(repositoryRoot, repositoryRoot, "protected-parent/config"),
    "package path resolves into a protected location: protected-parent/config",
    "canonical protected target rejection",
  );
}

function verifyCompatibleSymlinks(repositoryRoot, packageDirectory, fixtureParent) {
  const allowedData = join(repositoryRoot, "src", "data", "allowed.txt");
  mkdirSync(join(repositoryRoot, "src", "data"), { recursive: true });
  writeFileSync(allowedData, "allowed\n", "utf8");
  assert.equal(
    resolvePackageEntry(repositoryRoot, join(repositoryRoot, "src"), "data/allowed.txt"),
    allowedData,
    "allowed src data path",
  );

  const repositoryAlias = join(fixtureParent, "repository-alias");
  symlinkSync(repositoryRoot, repositoryAlias, "dir");
  const aliasedPackage = join(repositoryAlias, "packages", "package");
  assert.equal(
    resolvePackageEntry(repositoryAlias, aliasedPackage, "ordinary.txt"),
    join(aliasedPackage, "ordinary.txt"),
    "repository root symlink compatibility",
  );

  const packageAlias = join(repositoryRoot, "packages", "package-alias");
  symlinkSync(packageDirectory, packageAlias, "dir");
  assert.equal(
    resolvePackageEntry(repositoryRoot, packageAlias, "ordinary.txt"),
    join(packageAlias, "ordinary.txt"),
    "in-repository package root symlink compatibility",
  );

  const innerDirectory = join(packageDirectory, "inner");
  mkdirSync(innerDirectory);
  writeFileSync(join(innerDirectory, "inside.txt"), "inside\n", "utf8");
  symlinkSync(innerDirectory, join(packageDirectory, "inner-parent"), "dir");
  assert.equal(
    resolvePackageEntry(repositoryRoot, packageDirectory, "inner-parent/inside.txt"),
    join(packageDirectory, "inner-parent", "inside.txt"),
    "in-package parent symlink compatibility",
  );

  const externalPackage = join(fixtureParent, "external-package");
  mkdirSync(externalPackage);
  writeFileSync(join(externalPackage, "external.txt"), "external\n", "utf8");
  const externalPackageAlias = join(repositoryRoot, "packages", "external-package-alias");
  symlinkSync(externalPackage, externalPackageAlias, "dir");
  requirePackageError(
    () => resolvePackageEntry(repositoryRoot, externalPackageAlias, "external.txt"),
    "package path resolves outside its package: external.txt",
    "external package root symlink rejection",
  );
}

function verifyPackagePaths() {
  const fixtureParent = mkdtempSync(join(tmpdir(), "practice-relay-package-paths-"));
  const repositoryRoot = join(fixtureParent, "repository");
  const packageDirectory = join(repositoryRoot, "packages", "package");
  mkdirSync(packageDirectory, { recursive: true });
  try {
    verifyOrdinaryEntries(repositoryRoot, packageDirectory);
    verifyLexicalRejections(repositoryRoot, packageDirectory, fixtureParent);
    verifyCanonicalRejections(repositoryRoot, packageDirectory, fixtureParent);
    verifyCanonicalProtectedTarget(repositoryRoot);
    verifyCompatibleSymlinks(repositoryRoot, packageDirectory, fixtureParent);
  } finally {
    rmSync(fixtureParent, { recursive: true, force: true });
  }
  return true;
}

export const verificationComplete = verifyPackagePaths();
