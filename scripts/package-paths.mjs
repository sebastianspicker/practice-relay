/**
 * Package-manifest path containment for local publish checks.
 * Why: manifest-controlled exports must not escape or traverse protected paths.
 */
import { lstatSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { isProtectedRepositoryPath } from "./protected-paths.mjs";

function escapes(base, candidate) {
  const rel = relative(base, candidate);
  return rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel);
}

/** Resolve one manifest entry inside its package and reject symlink targets. */
export function resolvePackageEntry(repositoryRoot, packageDirectory, entry) {
  if (typeof entry !== "string" || !entry.trim() || entry.includes("\0")) {
    throw new Error("package path must be a non-empty string");
  }
  const absolute = resolve(packageDirectory, entry);
  if (escapes(packageDirectory, absolute)) {
    throw new Error(`package path escapes its package: ${entry}`);
  }
  const repositoryPath = relative(repositoryRoot, absolute).replaceAll("\\", "/");
  if (escapes(repositoryRoot, absolute) || isProtectedRepositoryPath(repositoryPath)) {
    throw new Error(`package path reaches a protected location: ${entry}`);
  }
  try {
    if (lstatSync(absolute).isSymbolicLink()) {
      throw new Error(`package path is a symlink: ${entry}`);
    }
    const real = realpathSync(absolute);
    const realPackageDirectory = realpathSync(packageDirectory);
    const realRepositoryRoot = realpathSync(repositoryRoot);
    if (escapes(realPackageDirectory, real) || escapes(realRepositoryRoot, real)) {
      throw new Error(`package path resolves outside its package: ${entry}`);
    }
    const canonicalRepositoryPath = relative(realRepositoryRoot, real).replaceAll(
      "\\",
      "/",
    );
    if (isProtectedRepositoryPath(canonicalRepositoryPath)) {
      throw new Error(`package path resolves into a protected location: ${entry}`);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return absolute;
}
