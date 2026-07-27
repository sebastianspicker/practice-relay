/**
 * Contained repository file access for release validators.
 * Why: explicit inputs must not traverse protected paths or external symlinks.
 */
import {
  lstatSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { isProtectedRepositoryPath } from "./protected-paths.mjs";

function escapes(root, candidate) {
  const rel = relative(root, candidate);
  return rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel);
}

/** Resolve an existing repository path without crossing protected or symlink boundaries. */
export function resolveExistingRepositoryPath(root, candidate) {
  const absolute = isAbsolute(candidate) ? resolve(candidate) : resolve(root, candidate);
  if (escapes(root, absolute)) throw new Error("repository path escapes its root");
  const relativePath = relative(root, absolute).replaceAll("\\", "/");
  if (isProtectedRepositoryPath(relativePath)) {
    throw new Error("repository path is protected");
  }
  const info = lstatSync(absolute);
  if (info.isSymbolicLink()) throw new Error("repository path is a symlink");
  const real = realpathSync(absolute);
  const realRoot = realpathSync(root);
  if (escapes(realRoot, real)) {
    throw new Error("repository path resolves outside its root");
  }
  const canonicalRelativePath = relative(realRoot, real).replaceAll("\\", "/");
  if (isProtectedRepositoryPath(canonicalRelativePath)) {
    throw new Error("repository path resolves into a protected location");
  }
  return { absolute, info };
}

/** Return whether a repository path exists and passes the no-read boundary. */
export function hasSafeRepositoryPath(root, candidate) {
  try {
    resolveExistingRepositoryPath(root, candidate);
    return true;
  } catch {
    return false;
  }
}

/** Read one contained regular text file after validating its complete path. */
export function readRepositoryText(root, candidate) {
  const { absolute, info } = resolveExistingRepositoryPath(root, candidate);
  if (!info.isFile()) throw new Error("repository path is not a regular file");
  return readFileSync(absolute, "utf8");
}
