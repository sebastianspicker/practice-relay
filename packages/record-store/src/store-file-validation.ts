/** Shared descriptor identities and ownership checks for managed JSON storage. */
import { closeSync, constants, fstatSync, lstatSync, type Stats } from "node:fs";
import path from "node:path";
const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

/** Test-only controls for exercising the portable descriptor fallback and replacement checks. */
export type StorePathTestOptions = {
  forceIdentityFallback?: true;
  afterValidation?: (stage: "after-read-validation" | "before-publish" | "before-file-removal" | "before-directory-removal") => void;
};

/** Read a filesystem error code without assuming an Error subclass. */
const errorCode = (error: unknown): string | undefined => {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const { code } = error as { code?: unknown };
  return typeof code === "string" ? code : undefined;
};

/** Identify absent paths while preserving other filesystem failures. */
const isMissing = (error: unknown): boolean => errorCode(error) === "ENOENT";
/** Reject unsupported test hooks before filesystem operations. */
const validateTestOptions = (options: StorePathTestOptions | undefined): StorePathTestOptions | undefined => {
  if (options === undefined) return undefined;
  if (Object.prototype.toString.call(options) !== "[object Object]" || Array.isArray(options)) {
    throw new TypeError("invalid store path test options");
  }
  for (const key of Object.keys(options)) {
    if (key !== "forceIdentityFallback" && key !== "afterValidation") {
      throw new TypeError("invalid store path test options");
    }
  }
  if ("forceIdentityFallback" in options && options.forceIdentityFallback !== true) {
    throw new TypeError("invalid store path test options");
  }
  if (options.afterValidation !== undefined && typeof options.afterValidation !== "function") {
    throw new TypeError("invalid store path test options");
  }
  return options;
};

/** Reject symbolic links and non-directory managed path components. */
const assertDirectory = (dir: string): void => {
  // System ancestors may use platform aliases (for example, macOS /var). The
  // configured root, tenant root, and every managed descendant are validated
  // explicitly by the durable-store layout check before file operations.
  const component = path.resolve(dir);
  let status: Stats;
  try {
    status = lstatSync(component);
  } catch (error) {
    if (isMissing(error)) throw new Error(`managed directory missing: ${component}`);
    throw error;
  }
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error(`managed directory is not a real directory: ${component}`);
  }
};

/** Require current-user ownership and reject writable shared directories. */
const assertTrustedDirectory = (dir: string): void => {
  assertDirectory(dir);
  const status = lstatSync(dir);
  const getEffectiveUserId = process.geteuid;
  if (typeof getEffectiveUserId === "function" && status.uid !== getEffectiveUserId()) {
    throw new Error(`managed directory is not owned by the current user: ${dir}`);
  }
  if ((status.mode & 0o022) !== 0) {
    throw new Error(`managed directory is group or world writable: ${dir}`);
  }
};

/** Reject symlinks, special files, and shared hardlinks. */
const assertRegular = (filePath: string, status: Stats): void => {
  if (status.isSymbolicLink() || !status.isFile()) {
    throw new Error(`managed file is not a regular file: ${filePath}`);
  }
  if (status.nlink !== 1) {
    throw new Error(`managed file is not singly linked: ${filePath}`);
  }
};

const hasUsableIdentity = (status: Stats): boolean => {
  return Number.isFinite(status.dev) && Number.isFinite(status.ino) && (status.dev !== 0 || status.ino !== 0);
};

/** Compare verified inode identities and fail when identity is unavailable. */
const sameIdentity = (expected: Stats, actual: Stats): boolean => {
  if (!hasUsableIdentity(expected) || !hasUsableIdentity(actual)) {
    throw new Error("managed file identity unavailable");
  }
  return expected.dev === actual.dev && expected.ino === actual.ino;
};

/** Select no-follow and nonblocking descriptor flags where available. */
const noFollowFlags = (flags: number, useIdentityFallback: boolean): number => {
  let result = flags;
  if (!useIdentityFallback && typeof Reflect.get(constants, "O_NOFOLLOW") === "number") {
    result |= constants.O_NOFOLLOW;
  }
  if (typeof constants.O_NONBLOCK === "number") result |= constants.O_NONBLOCK;
  return result;
};

/** Inspect a regular file beneath a trusted parent directory. */
const lstatRegular = (filePath: string): Stats => {
  assertTrustedDirectory(path.dirname(filePath));
  const status = lstatSync(filePath);
  assertRegular(filePath, status);
  return status;
};
/** Inspect an optional regular file, treating only ENOENT as absence. */
const lstatOptionalRegular = (filePath: string): Stats | undefined => {
  assertTrustedDirectory(path.dirname(filePath));
  try {
    const status = lstatSync(filePath);
    assertRegular(filePath, status);
    return status;
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
};

/** Bind an opened descriptor to the previously inspected file identity. */
const verifyDescriptor = (
  filePath: string,
  expected: Stats,
  descriptor: number,
  useIdentityFallback: boolean,
): void => {
  const actual = fstatSync(descriptor);
  assertRegular(filePath, actual);
  if (!sameIdentity(expected, actual)) {
    throw new Error(`managed file changed while opening: ${filePath}`);
  }
  if (useIdentityFallback || typeof Reflect.get(constants, "O_NOFOLLOW") !== "number") {
    const afterOpen = lstatSync(filePath);
    assertRegular(filePath, afterOpen);
    if (!sameIdentity(actual, afterOpen)) {
      throw new Error(`managed file changed while opening: ${filePath}`);
    }
  }
};

/** Close a descriptor without masking an earlier operation failure. */
const closeDescriptor = (descriptor: number, primaryError: unknown): void => {
  try {
    closeSync(descriptor);
  } catch (error) {
    if (primaryError === undefined) throw error;
  }
};

export { PRIVATE_DIRECTORY_MODE, PRIVATE_FILE_MODE, errorCode, isMissing, validateTestOptions, assertDirectory, assertTrustedDirectory, assertRegular, sameIdentity, noFollowFlags, lstatRegular, lstatOptionalRegular, verifyDescriptor, closeDescriptor };
