/**
 * Contained read and write paths for release-reachable fixture generators.
 * Why: demos must reject protected, linked, or external paths before file access.
 */
import { randomBytes } from "node:crypto";
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { umask } from "node:process";
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

function outputFileInfo(root, candidate) {
  let info;
  try {
    info = lstatSync(candidate);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  if (!info.isFile()) throw new Error("contained output is not a regular file");
  if (info.nlink !== 1) {
    throw new Error("contained output has multiple hard links");
  }
  assertCanonicalContainment(root, candidate);
  return info;
}

function syncDirectoryBestEffort(directory) {
  let descriptor;
  try {
    descriptor = openSync(directory, constants.O_RDONLY);
    fsyncSync(descriptor);
  } catch {
    // Atomic visibility does not depend on directory fsync support.
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // A durability cleanup failure cannot undo an already published file.
      }
    }
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
  const existingInfo = outputFileInfo(absoluteRoot, absolute);
  const finalMode = existingInfo
    ? existingInfo.mode & 0o777
    : 0o644 & ~umask() & 0o777;
  let descriptor;
  let temporary;
  let temporaryIdentity;
  let published = false;
  try {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      temporary = join(
        outputDirectory,
        `.contained-output-${randomBytes(16).toString("hex")}.tmp`,
      );
      try {
        descriptor = openSync(
          temporary,
          constants.O_WRONLY |
            constants.O_CREAT |
            constants.O_EXCL |
            constants.O_NOFOLLOW,
          0o600,
        );
        break;
      } catch (error) {
        temporary = undefined;
        if (error?.code !== "EEXIST" || attempt === 15) throw error;
      }
    }
    temporaryIdentity = fstatSync(descriptor);
    if (!temporaryIdentity.isFile()) {
      throw new Error("contained temporary output is not a regular file");
    }
    if (temporaryIdentity.nlink !== 1) {
      throw new Error("contained temporary output has multiple hard links");
    }
    writeFileSync(descriptor, contents, "utf8");
    fchmodSync(descriptor, finalMode);
    fsyncSync(descriptor);
    assertNoSymlinkComponents(absoluteRoot, absolute, true);
    outputFileInfo(absoluteRoot, absolute);
    const finalTemporaryInfo = fstatSync(descriptor);
    if (finalTemporaryInfo.nlink !== 1) {
      throw new Error("contained temporary output has multiple hard links");
    }
    const completedDescriptor = descriptor;
    descriptor = undefined;
    closeSync(completedDescriptor);
    const pathnameInfo = lstatSync(temporary);
    if (
      pathnameInfo.dev !== temporaryIdentity.dev ||
      pathnameInfo.ino !== temporaryIdentity.ino
    ) {
      throw new Error("contained temporary output changed before publication");
    }
    renameSync(temporary, absolute);
    published = true;
    syncDirectoryBestEffort(outputDirectory);
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // Preserve the primary publication failure.
      }
    }
    if (!published && temporary && temporaryIdentity) {
      try {
        const current = lstatSync(temporary);
        if (
          current.dev === temporaryIdentity.dev &&
          current.ino === temporaryIdentity.ino
        ) {
          unlinkSync(temporary);
        }
      } catch {
        // Remove only the inode this call created and preserve the primary failure.
      }
    }
    throw error;
  }
  return absolute;
}
