/**
 * Contained repository file access for release validators.
 * Why: explicit inputs must not traverse protected paths or external symlinks.
 */
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { isProtectedRepositoryPath } from "./protected-paths.mjs";

function escapes(root, candidate) {
  const rel = relative(root, candidate);
  return rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel);
}

function resolveCanonicalContainedPath(root, candidate) {
  const absolute = isAbsolute(candidate) ? resolve(candidate) : resolve(root, candidate);
  if (escapes(root, absolute)) throw new Error("contained path escapes its root");
  const info = lstatSync(absolute);
  if (info.isSymbolicLink()) throw new Error("contained path is a symlink");
  const real = realpathSync(absolute);
  const realRoot = realpathSync(root);
  if (escapes(realRoot, real)) {
    throw new Error("contained path resolves outside its root");
  }
  return {
    absolute,
    info,
    canonicalRelativePath: relative(realRoot, real).replaceAll("\\", "/"),
  };
}

/** Resolve an existing path without crossing its root or a final symlink. */
export function resolveExistingContainedPath(root, candidate) {
  const { absolute, info } = resolveCanonicalContainedPath(root, candidate);
  return { absolute, info };
}

/** Resolve an existing repository path without crossing protected or symlink boundaries. */
export function resolveExistingRepositoryPath(root, candidate) {
  const absolute = isAbsolute(candidate) ? resolve(candidate) : resolve(root, candidate);
  if (escapes(root, absolute)) throw new Error("repository path escapes its root");
  const relativePath = relative(root, absolute).replaceAll("\\", "/");
  if (isProtectedRepositoryPath(relativePath)) {
    throw new Error("repository path is protected");
  }
  let contained;
  try {
    contained = resolveCanonicalContainedPath(root, absolute);
  } catch (error) {
    if (error?.message === "contained path escapes its root") {
      throw new Error("repository path escapes its root");
    }
    if (error?.message === "contained path is a symlink") {
      throw new Error("repository path is a symlink");
    }
    if (error?.message === "contained path resolves outside its root") {
      throw new Error("repository path resolves outside its root");
    }
    throw error;
  }
  const { info, canonicalRelativePath } = contained;
  if (isProtectedRepositoryPath(canonicalRelativePath)) {
    throw new Error("repository path resolves into a protected location");
  }
  return { absolute: contained.absolute, info };
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
  return readValidatedRepositoryText(absolute, info, openValidatedRepositoryFile);
}

/**
 * Read one contained regular text file when no-follow support is unavailable.
 * @internal Test-only third argument may force descriptor identity fallback.
 * @param {{ forceIdentityFallback: true }} [testOptions]
 */
export function readRepositoryTextWithIdentityFallback(root, candidate, testOptions) {
  const forceIdentityFallback = validateIdentityFallbackTestOptions(testOptions);
  const { absolute, info } = resolveExistingRepositoryPath(root, candidate);
  if (!info.isFile()) throw new Error("repository path is not a regular file");
  const noFollowFlag = forceIdentityFallback ? null : availableNoFollowFlag();
  return readValidatedRepositoryText(
    absolute,
    info,
    (path) => openRepositoryFile(path, noFollowFlag),
  );
}

function readValidatedRepositoryText(absolute, info, openFile) {
  const descriptor = openFile(absolute);
  let primaryError;
  let text;
  try {
    const openedInfo = fstatSync(descriptor);
    if (!openedInfo.isFile()) {
      throw new Error("repository path is not a regular file");
    }
    if (openedInfo.dev !== info.dev || openedInfo.ino !== info.ino) {
      throw new Error("repository path changed after validation");
    }
    text = readFileSync(descriptor, "utf8");
  } catch (error) {
    primaryError = error;
  }
  let closeError;
  try {
    closeSync(descriptor);
  } catch (error) {
    closeError = error;
  }
  if (primaryError !== undefined) throw primaryError;
  if (closeError !== undefined) throw closeError;
  return text;
}

function openValidatedRepositoryFile(absolute) {
  if (typeof constants.O_NOFOLLOW !== "number") {
    throw new Error("repository path cannot enforce no-follow protection");
  }
  return openRepositoryFile(absolute, constants.O_NOFOLLOW);
}

function validateIdentityFallbackTestOptions(testOptions) {
  if (testOptions === undefined) return false;
  if (testOptions === null || typeof testOptions !== "object" || Array.isArray(testOptions)) {
    throw new TypeError("repository identity fallback options are invalid");
  }
  const keys = Reflect.ownKeys(testOptions);
  const option = Object.getOwnPropertyDescriptor(testOptions, "forceIdentityFallback");
  if (
    keys.length !== 1
    || keys[0] !== "forceIdentityFallback"
    || option?.value !== true
    || option.get !== undefined
    || option.set !== undefined
  ) {
    throw new TypeError("repository identity fallback options are invalid");
  }
  return true;
}

function availableNoFollowFlag() {
  return typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : null;
}

function openRepositoryFile(absolute, noFollowFlag) {
  const nonBlocking = typeof constants.O_NONBLOCK === "number"
    ? constants.O_NONBLOCK
    : 0;
  const noFollow = typeof noFollowFlag === "number" ? noFollowFlag : 0;
  try {
    return openSync(absolute, constants.O_RDONLY | noFollow | nonBlocking);
  } catch (error) {
    if (error?.code === "ELOOP") {
      throw new Error("repository path changed after validation");
    }
    throw error;
  }
}
