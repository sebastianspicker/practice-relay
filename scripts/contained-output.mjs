/**
 * Contained read and write paths for release-reachable fixture generators.
 * Why: demos must reject protected, linked, or external paths before file access.
 */
import {
  closeSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { isProtectedRepositoryPath } from "./protected-paths.mjs";
import { readRepositoryText } from "./repository-files.mjs";

function escapes(root, candidate) {
  const path = relative(root, candidate);
  return path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path);
}

function containedPath(root, candidate) {
  const absoluteRoot = resolve(root);
  const rootInfo = lstatSync(absoluteRoot);
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) {
    throw new Error("contained root must be a real directory");
  }
  const absolute = isAbsolute(candidate)
    ? resolve(candidate)
    : resolve(absoluteRoot, candidate);
  if (escapes(absoluteRoot, absolute)) {
    throw new Error("contained path escapes repository root");
  }
  const repositoryPath = relative(absoluteRoot, absolute).replaceAll("\\", "/");
  if (isProtectedRepositoryPath(repositoryPath)) {
    throw new Error("contained path is protected");
  }
  return { absoluteRoot, absolute };
}

function assertNoSymlinkComponents(root, absolute, allowMissing) {
  const parts = relative(root, absolute).split(sep).filter(Boolean);
  let current = root;
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    try {
      const info = lstatSync(current);
      if (info.isSymbolicLink()) {
        throw new Error("contained path includes a symlink component");
      }
      if (index < parts.length - 1 && !info.isDirectory()) {
        throw new Error("contained path has a non-directory parent");
      }
    } catch (error) {
      if (error?.code === "ENOENT" && allowMissing) return;
      throw error;
    }
  }
}

function assertCanonicalContainment(root, candidate) {
  const realRoot = realpathSync(root);
  const realCandidate = realpathSync(candidate);
  if (escapes(realRoot, realCandidate)) {
    throw new Error("contained path resolves outside repository root");
  }
}

/** Read a contained text input after rejecting every symlink component. */
export function readContainedText(root, candidate) {
  const { absoluteRoot, absolute } = containedPath(root, candidate);
  assertNoSymlinkComponents(absoluteRoot, absolute, false);
  return readRepositoryText(absoluteRoot, absolute);
}

/** Return whether a fixed input exists and satisfies the complete read boundary. */
export function hasContainedPath(root, candidate) {
  try {
    readContainedText(root, candidate);
    return true;
  } catch {
    return false;
  }
}

/** Create or reuse one contained output directory after validating its parents. */
export function ensureContainedOutputDirectory(root, candidate) {
  const { absoluteRoot, absolute } = containedPath(root, candidate);
  assertNoSymlinkComponents(absoluteRoot, absolute, true);
  mkdirSync(absolute, { recursive: true });
  assertNoSymlinkComponents(absoluteRoot, absolute, false);
  const info = lstatSync(absolute);
  if (!info.isDirectory()) throw new Error("contained output is not a directory");
  assertCanonicalContainment(absoluteRoot, absolute);
  return absolute;
}

/** Write one contained text file after validating its directory and target. */
export function writeContainedText(root, candidate, contents) {
  const { absoluteRoot, absolute } = containedPath(root, candidate);
  const outputDirectory = ensureContainedOutputDirectory(
    absoluteRoot,
    dirname(absolute),
  );
  if (escapes(outputDirectory, absolute)) {
    throw new Error("contained output escapes its directory");
  }
  assertNoSymlinkComponents(absoluteRoot, absolute, true);
  if (existsSync(absolute)) {
    const info = lstatSync(absolute);
    if (!info.isFile()) throw new Error("contained output is not a regular file");
    assertCanonicalContainment(absoluteRoot, absolute);
  }
  const descriptor = openSync(
    absolute,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_TRUNC |
      constants.O_NOFOLLOW,
    0o644,
  );
  try {
    writeFileSync(descriptor, contents, "utf8");
  } finally {
    closeSync(descriptor);
  }
  return absolute;
}
