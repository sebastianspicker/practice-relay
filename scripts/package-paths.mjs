/**
 * Package-manifest path containment for local publish checks.
 * Why: manifest-controlled exports must not escape or traverse protected paths.
 */
import { isAbsolute, relative, resolve, sep } from "node:path";
import { isProtectedRepositoryPath } from "./protected-paths.mjs";
import {
  resolveExistingContainedPath,
  resolveExistingRepositoryPath,
} from "./repository-files.mjs";

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
    resolveExistingContainedPath(packageDirectory, absolute);
    resolveExistingRepositoryPath(repositoryRoot, absolute);
  } catch (error) {
    if (error?.code === "ENOENT") return absolute;
    if (
      error?.message === "contained path is a symlink" ||
      error?.message === "repository path is a symlink"
    ) {
      throw new Error(`package path is a symlink: ${entry}`);
    }
    if (error?.message === "repository path resolves into a protected location") {
      throw new Error(`package path resolves into a protected location: ${entry}`);
    }
    if (
      error?.message === "contained path escapes its root" ||
      error?.message === "contained path resolves outside its root" ||
      error?.message === "repository path resolves outside its root"
    ) {
      throw new Error(`package path resolves outside its package: ${entry}`);
    }
    if (
      error?.message === "repository path escapes its root" ||
      error?.message === "repository path is protected"
    ) {
      throw new Error(`package path reaches a protected location: ${entry}`);
    }
    throw error;
  }
  return absolute;
}
