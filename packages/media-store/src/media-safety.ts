/**
 * Shared media path containment, regular-file, and metadata validation primitives.
 *
 * Why: filesystem media paths must resist traversal and pathname replacement races.
 */
import { randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  createReadStream,
  createWriteStream,
  existsSync,
  fsyncSync,
  fstatSync,
  lstatSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type { Readable, Writable } from "node:stream";
import type { MediaBlobMeta } from "./types.js";
import { parseMediaMetaValue } from "./media-metadata.js";

const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const SYMLINK_ERROR = "media storage path must not contain symbolic links";
const REGULAR_FILE_ERROR = "media storage path must be a private regular file";
const REPLACED_FILE_ERROR = "media storage path changed during the operation";
const DIRECTORY_TRUST_ERROR = "media storage directories must be owner-only";

type FileIdentity = Readonly<{ dev: number | bigint; ino: number | bigint }>;
/** Test-only descriptor controls; this module does not expose them through the package entrypoint. */
export type SafeFileReadOptions =
  | Readonly<{ forceIdentityFallback: true }>
  | Readonly<{ afterValidationForTest: () => void }>;

const forbiddenStorageSegments = new Set(["", ".", ".."]);

const hasForbiddenStorageSegment = (storageKey: string): boolean => {
  return storageKey.split("/").some((segment) => forbiddenStorageSegments.has(segment));
};

const assertPortableRelativeStorageKey = (storageKey: string): void => {
  if (!storageKey) throw new Error("media storageKey must be a safe relative path");
  if (storageKey.includes("\0")) throw new Error("media storageKey must be a safe relative path");
  if (storageKey.includes("\\")) throw new Error("media storageKey must be a safe relative path");
  if (path.isAbsolute(storageKey)) throw new Error("media storageKey must be a safe relative path");
  if (path.win32.isAbsolute(storageKey)) throw new Error("media storageKey must be a safe relative path");
};

const isMissing = (error: unknown): boolean => {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
};

const numericFlag = (value: unknown): number => (typeof value === "number" ? value : 0);

const isVoidCallback = (value: unknown): value is (() => void) => typeof value === "function";

const readFlags = (options?: unknown): { flags: number; afterValidation?: () => void } => {
  const baseFlags = constants.O_RDONLY | numericFlag(constants.O_NONBLOCK);
  if (options === undefined) return { flags: baseFlags | numericFlag(constants.O_NOFOLLOW) };
  if (!options || typeof options !== "object") throw new TypeError("invalid media read options");
  const keys = Reflect.ownKeys(options);
  const plainObject = Object.getPrototypeOf(options) === Object.prototype || Object.getPrototypeOf(options) === null;
  if (!plainObject || keys.length !== 1 || typeof keys[0] !== "string") {
    throw new TypeError("invalid media read options");
  }
  const descriptor = Object.getOwnPropertyDescriptor(options, keys[0]);
  if (!descriptor || !("value" in descriptor)) throw new TypeError("invalid media read options");
  const value: unknown = descriptor.value;
  if (keys[0] === "forceIdentityFallback" && value === true) return { flags: baseFlags };
  if (keys[0] === "afterValidationForTest" && isVoidCallback(value)) {
    return {
      flags: baseFlags | numericFlag(constants.O_NOFOLLOW),
      afterValidation: value,
    };
  }
  throw new TypeError("invalid media read options");
};

const identityOf = (stats: ReturnType<typeof fstatSync>): FileIdentity => ({
  dev: stats.dev,
  ino: stats.ino,
});

const sameIdentity = (left: FileIdentity, right: FileIdentity): boolean => {
  return left.dev === right.dev && left.ino === right.ino;
};

const assertRegularFile = (stats: ReturnType<typeof fstatSync>, requirePrivate = true): FileIdentity => {
  if (!stats.isFile() || (requirePrivate && stats.nlink !== 1)) throw new Error(REGULAR_FILE_ERROR);
  return identityOf(stats);
};

const lstatRegularFile = (filePath: string, requirePrivate = true): FileIdentity => {
  const stats = lstatSync(filePath);
  if (stats.isSymbolicLink()) throw new Error(SYMLINK_ERROR);
  return assertRegularFile(stats, requirePrivate);
};

const lstatPrivateRegularFile = (filePath: string): FileIdentity => {
  return lstatRegularFile(filePath);
};

const assertCurrentPathIdentity = (filePath: string, expected: FileIdentity, requirePrivate = true): void => {
  const current = lstatRegularFile(filePath, requirePrivate);
  if (!sameIdentity(current, expected)) throw new Error(REPLACED_FILE_ERROR);
};

const openReadOnlyNoFollow = (filePath: string, flags = readFlags().flags): number => {
  return openSync(filePath, flags);
};

const closeAfter = <T>(descriptor: number, operation: () => T): T => {
  let result!: T;
  let primaryError: unknown;
  let hasPrimaryError = false;
  try {
    result = operation();
  } catch (error) {
    hasPrimaryError = true;
    primaryError = error;
  }
  try {
    closeSync(descriptor);
  } catch (error) {
    if (!hasPrimaryError) throw error;
  }
  if (hasPrimaryError) throw primaryError;
  return result;
};

const currentEffectiveUserId = (): number | undefined => {
  return typeof process.geteuid === "function" ? process.geteuid() : undefined;
};

const hasTrustedOwner = (stats: NonNullable<ReturnType<typeof lstatSync>>, allowRootOwner: boolean): boolean => {
  const effectiveUserId = currentEffectiveUserId();
  if (effectiveUserId === undefined) return true;
  if (typeof stats.uid !== "number") return false;
  return stats.uid === effectiveUserId || (allowRootOwner && stats.uid === 0);
};

const assertTrustedAncestorDirectory = (directory: string): void => {
  const stats = lstatSync(directory);
  if (stats.isSymbolicLink()) throw new Error(SYMLINK_ERROR);
  if (!stats.isDirectory()) throw new Error("media storage path must use directories");
  if (currentEffectiveUserId() === undefined) return;
  if (!hasTrustedOwner(stats, true)) throw new Error(DIRECTORY_TRUST_ERROR);
  const writable = (stats.mode & 0o022) !== 0;
  const sticky = (stats.mode & 0o1000) !== 0;
  if (writable && !sticky) throw new Error(DIRECTORY_TRUST_ERROR);
};

const assertNoSymlinkAncestors = (root: string): void => {
  const parsed = path.parse(root);
  const parts = path.relative(parsed.root, root).split(path.sep).filter(Boolean);
  let current = parsed.root;
  for (const part of parts) {
    current = path.join(current, part);
    try {
      assertTrustedAncestorDirectory(current);
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
  }
};

const assertManagedDirectory = (directory: string): void => {
  const stats = lstatSync(directory);
  if (stats.isSymbolicLink()) throw new Error(SYMLINK_ERROR);
  if (!stats.isDirectory()) throw new Error("media storage path must use directories");
  // Windows exposes neither a comparable euid nor POSIX mode semantics; callers must
  // pre-provision a trusted root there and retain only symlink/regular-file protections.
  if (currentEffectiveUserId() === undefined) return;
  if ((stats.mode & 0o022) !== 0) throw new Error(DIRECTORY_TRUST_ERROR);
  if (!hasTrustedOwner(stats, false)) {
    throw new Error(DIRECTORY_TRUST_ERROR);
  }
};

const cleanupTemporary = (temporaryPath: string, identity: FileIdentity | undefined): void => {
  if (!identity) return;
  try {
    assertCurrentPathIdentity(temporaryPath, identity);
    unlinkSync(temporaryPath);
  } catch {
    // A replacement is left intact; primary storage errors must win.
  }
};

/** Ensure a media storage directory exists before writing beneath it. */
export function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
}

/**
 * Resolve a configured root below the filesystem-root trust anchor, rejecting every
 * existing lexical symlink component before creating a missing leaf directory.
 */
export function prepareStorageRoot(root: string): string {
  assertNoSymlinkAncestors(root);
  ensureDir(root);
  assertNoSymlinkAncestors(root);
  assertManagedDirectory(root);
  return realpathSync(root);
}

/** Validate a record or take identifier as one portable path segment. */
export function safeId(id: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id)) {
    throw new Error("media recordId and takeId must be valid resource ids");
  }
  return id;
}

/** Reject keys that are not relative, portable media-object paths. */
export function assertSafeStorageKey(storageKey: string): void {
  assertPortableRelativeStorageKey(storageKey);
  if (hasForbiddenStorageSegment(storageKey)) {
    throw new Error("media storageKey must not contain traversal segments");
  }
}

/** Whether a resolved path remains inside a resolved storage root. */
export function isWithinRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

/** Resolve a safe key and reject every existing symlink component. */
export function resolveStoragePath(root: string, realRoot: string, storageKey: string): string {
  assertSafeStorageKey(storageKey);
  const candidate = path.resolve(root, storageKey);
  if (!isWithinRoot(root, candidate)) throw new Error("media storageKey resolves outside the configured root");
  assertManagedDirectory(root);
  if (realpathSync(root) !== realRoot) throw new Error("media path resolves outside the configured root");

  const relativeParts = path.relative(root, candidate).split(path.sep);
  let current = root;
  for (const [index, part] of relativeParts.entries()) {
    current = path.join(current, part);
    try {
      const stats = lstatSync(current);
      if (stats.isSymbolicLink()) throw new Error(SYMLINK_ERROR);
      if (stats.isDirectory()) assertManagedDirectory(current);
      else if (index < relativeParts.length - 1) throw new Error("media storage path must use directories");
    } catch (error) {
      if (isMissing(error)) break;
      throw error;
    }
  }
  return candidate;
}

const ensureStorageParent = (root: string, realRoot: string, storageKey: string): string => {
  const candidate = resolveStoragePath(root, realRoot, storageKey);
  const parts = path.relative(root, path.dirname(candidate)).split(path.sep).filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    try {
      assertManagedDirectory(current);
    } catch (error) {
      if (!isMissing(error)) throw error;
      try {
        mkdirSync(current, { mode: PRIVATE_DIRECTORY_MODE });
      } catch (mkdirError) {
        const alreadyExists = typeof mkdirError === "object" && mkdirError !== null && "code" in mkdirError && mkdirError.code === "EEXIST";
        if (!alreadyExists) throw mkdirError;
      }
      assertManagedDirectory(current);
    }
  }
  return resolveStoragePath(root, realRoot, storageKey);
};

/** Descriptor-backed immutable streaming write staged beneath the trusted parent. */
export function createStorageWriteStream(
  root: string,
  realRoot: string,
  storageKey: string,
): { stream: Writable; publish: () => void; cleanup: () => void } {
  const target = ensureStorageParent(root, realRoot, storageKey);
  const temporaryPath = `${target}.${randomUUID()}.tmp`;
  const descriptor = openSync(
    temporaryPath,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | numericFlag(constants.O_NOFOLLOW),
    PRIVATE_FILE_MODE,
  );
  const identity = assertRegularFile(fstatSync(descriptor));
  let published = false;
  return {
    stream: createWriteStream(temporaryPath, { fd: descriptor, autoClose: true }),
    publish() {
      assertCurrentPathIdentity(temporaryPath, identity);
      const syncDescriptor = openReadOnlyNoFollow(temporaryPath);
      closeAfter(syncDescriptor, () => fsyncSync(syncDescriptor));
      // link is an atomic no-replace publication. EEXIST leaves the winner intact.
      linkSync(temporaryPath, target);
      unlinkSync(temporaryPath);
      published = true;
      lstatPrivateRegularFile(target);
      if (process.platform !== "win32") {
        const directoryDescriptor = openSync(path.dirname(target), constants.O_RDONLY);
        closeAfter(directoryDescriptor, () => fsyncSync(directoryDescriptor));
      }
    },
    cleanup() {
      if (published) return;
      cleanupTemporary(temporaryPath, identity);
    },
  };
}

/** Open one validated immutable object as a descriptor-backed stream. */
export function createStorageReadStream(root: string, realRoot: string, storageKey: string): Readable | undefined {
  let filePath: string;
  try { filePath = resolveStoragePath(root, realRoot, storageKey); }
  catch (error) { if (isMissing(error)) return undefined; throw error; }
  let descriptor: number;
  try { descriptor = openReadOnlyNoFollow(filePath); }
  catch (error) { if (isMissing(error)) return undefined; throw error; }
  try {
    const identity = assertRegularFile(fstatSync(descriptor));
    assertCurrentPathIdentity(filePath, identity);
    return createReadStream(filePath, { fd: descriptor, autoClose: true });
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
}

/** Read a regular file through a no-follow descriptor and verify pathname identity. */
export function readRegularFile(filePath: string, options?: SafeFileReadOptions): Buffer {
  const readOptions = readFlags(options);
  const expected = lstatPrivateRegularFile(filePath);
  readOptions.afterValidation?.();
  const descriptor = openReadOnlyNoFollow(filePath, readOptions.flags);
  return closeAfter(descriptor, () => {
    const opened = assertRegularFile(fstatSync(descriptor));
    if (!sameIdentity(opened, expected)) throw new Error(REPLACED_FILE_ERROR);
    assertCurrentPathIdentity(filePath, opened);
    return readFileSync(descriptor);
  });
}

/** Read a contained regular object, preserving missing-object semantics. */
export function readStorageFile(root: string, realRoot: string, storageKey: string): Buffer | undefined {
  const filePath = resolveStoragePath(root, realRoot, storageKey);
  try {
    return readRegularFile(filePath);
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

/** Validate a contained regular object without reading its bytes. */
export function validateStorageFile(root: string, realRoot: string, storageKey: string): boolean {
  const filePath = resolveStoragePath(root, realRoot, storageKey);
  let expected: FileIdentity;
  try {
    expected = lstatPrivateRegularFile(filePath);
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
  const descriptor = openReadOnlyNoFollow(filePath);
  return closeAfter(descriptor, () => {
    const opened = assertRegularFile(fstatSync(descriptor));
    if (!sameIdentity(expected, opened)) throw new Error(REPLACED_FILE_ERROR);
    assertCurrentPathIdentity(filePath, opened);
    return true;
  });
}

/** Atomically replace a contained leaf without opening an existing target for writing. */
export function writeStorageFile(
  root: string,
  realRoot: string,
  storageKey: string,
  bytes: string | Buffer,
): void {
  const filePath = ensureStorageParent(root, realRoot, storageKey);
  let expected: FileIdentity | undefined;
  try {
    expected = lstatRegularFile(filePath, false);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  const parentKey = path.posix.dirname(storageKey);
  const temporaryKey = `${parentKey === "." ? "" : `${parentKey}/`}.${randomUUID()}.tmp`;
  const temporaryPath = ensureStorageParent(root, realRoot, temporaryKey);
  let descriptor: number | undefined;
  let temporaryIdentity: FileIdentity | undefined;
  let primaryError: unknown;
  let hasPrimaryError = false;
  try {
    descriptor = openSync(
      temporaryPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | numericFlag(constants.O_NOFOLLOW),
      PRIVATE_FILE_MODE,
    );
    temporaryIdentity = assertRegularFile(fstatSync(descriptor));
    assertCurrentPathIdentity(temporaryPath, temporaryIdentity);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } catch (error) {
    hasPrimaryError = true;
    primaryError = error;
  }
  if (descriptor !== undefined) {
    try {
      closeSync(descriptor);
    } catch (error) {
      if (!hasPrimaryError) {
        hasPrimaryError = true;
        primaryError = error;
      }
    }
  }
  if (hasPrimaryError) {
    cleanupTemporary(temporaryPath, temporaryIdentity);
    throw primaryError;
  }
  try {
    resolveStoragePath(root, realRoot, storageKey);
    if (expected) assertCurrentPathIdentity(filePath, expected, false);
    else if (existsSync(filePath)) throw new Error(REPLACED_FILE_ERROR);
    renameSync(temporaryPath, filePath);
  } catch (error) {
    cleanupTemporary(temporaryPath, temporaryIdentity);
    throw error;
  }
}

/** Delete a contained regular object only when its identity still matches validation. */
export function deleteStorageFile(root: string, realRoot: string, storageKey: string): boolean {
  const filePath = resolveStoragePath(root, realRoot, storageKey);
  let expected: FileIdentity;
  try {
    expected = lstatPrivateRegularFile(filePath);
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
  const descriptor = openReadOnlyNoFollow(filePath);
  closeAfter(descriptor, () => {
    const opened = assertRegularFile(fstatSync(descriptor));
    if (!sameIdentity(expected, opened)) throw new Error(REPLACED_FILE_ERROR);
    assertCurrentPathIdentity(filePath, opened);
  });
  const parentKey = path.posix.dirname(storageKey);
  const temporaryKey = `${parentKey === "." ? "" : `${parentKey}/`}.${randomUUID()}.delete`;
  const temporaryPath = ensureStorageParent(root, realRoot, temporaryKey);
  renameSync(filePath, temporaryPath);
  try {
    assertCurrentPathIdentity(temporaryPath, expected);
  } catch (error) {
    try {
      if (!existsSync(filePath)) renameSync(temporaryPath, filePath);
    } catch {
      // The replacement rejection remains the primary result.
    }
    throw error;
  }
  unlinkSync(temporaryPath);
  return true;
}

/** Parse persisted metadata only when its identity and primitive fields are valid. */
export function parseMediaMeta(raw: string, requestedKey?: string): MediaBlobMeta | undefined {
  return parseMediaMetaValue(raw, requestedKey, assertSafeStorageKey);
}
