/**
 * Filesystem path validation and no-follow primitives shared by durable storage.
 *
 * Why: tenant isolation and filesystem ownership must remain centralized instead
 * of being recreated by callers.
 */
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";

import { PRIVATE_DIRECTORY_MODE, PRIVATE_FILE_MODE, errorCode, isMissing, validateTestOptions, assertDirectory, assertTrustedDirectory, assertRegular, sameIdentity, noFollowFlags, lstatRegular, lstatOptionalRegular, verifyDescriptor, closeDescriptor, type StorePathTestOptions } from "./store-file-validation.js";
export type { StorePathTestOptions } from "./store-file-validation.js";

/** Persist directory-entry changes after publishing or removing managed state. */
export function syncManagedDirectory(directory: string): void {
  assertTrustedDirectory(directory);
  const descriptor = openSync(directory, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

/** Ensure a real, private managed directory without changing existing ancestors. */
export function ensureDir(dir: string): void {
  const resolved = path.resolve(dir);
  const missing: string[] = [];
  let existing = resolved;
  for (;;) {
    try {
      const status = lstatSync(existing);
      if (status.isSymbolicLink() || !status.isDirectory()) {
        throw new Error(`managed directory is not a real directory: ${existing}`);
      }
      break;
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    missing.push(existing);
    const parent = path.dirname(existing);
    if (parent === existing) throw new Error(`managed directory missing: ${resolved}`);
    existing = parent;
  }
  for (const component of missing.reverse()) {
    try {
      mkdirSync(component, { mode: PRIVATE_DIRECTORY_MODE });
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
    }
    const status = lstatSync(component);
    if (status.isSymbolicLink() || !status.isDirectory()) {
      throw new Error(`managed directory is not a real directory: ${component}`);
    }
    chmodSync(component, PRIVATE_DIRECTORY_MODE);
    syncManagedDirectory(component);
    syncManagedDirectory(path.dirname(component));
  }
  assertTrustedDirectory(resolved);
}

/** Validate a managed directory without creating it. */
export function validateManagedDirectory(dir: string): void {
  assertTrustedDirectory(dir);
}

/** Return managed-directory existence while rejecting a symlink or non-directory entry. */
export function managedDirectoryExists(dir: string): boolean {
  assertDirectory(path.dirname(dir));
  try {
    const status = lstatSync(dir);
    if (status.isSymbolicLink()) {
      throw new Error(`managed directory is not a real directory: ${dir}`);
    }
    if (!status.isDirectory()) return false;
    assertTrustedDirectory(dir);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

/** Atomically move one validated managed directory to an absent sibling path. */
export function moveManagedDirectory(source: string, destination: string): void {
  assertTrustedDirectory(source);
  assertTrustedDirectory(path.dirname(destination));
  if (existsSync(destination)) throw new Error(`managed destination already exists: ${destination}`);
  renameSync(source, destination);
  syncManagedDirectory(path.dirname(source));
  syncManagedDirectory(path.dirname(destination));
  assertTrustedDirectory(destination);
}

/** Return regular-file existence, rejecting a symlink or another non-file entry. */
export function regularFileExists(filePath: string): boolean {
  assertTrustedDirectory(path.dirname(filePath));
  try {
    const status = lstatSync(filePath);
    assertRegular(filePath, status);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

/** Read a regular file through a no-follow descriptor and validate its identity before reading. */
export function readRegularFile(filePath: string, testOptions?: StorePathTestOptions): Buffer {
  const options = validateTestOptions(testOptions);
  const useIdentityFallback = options?.forceIdentityFallback === true;
  const expected = lstatRegular(filePath);
  let descriptor: number | undefined;
  let primaryError: unknown;
  try {
    options?.afterValidation?.("after-read-validation");
    descriptor = openSync(filePath, noFollowFlags(constants.O_RDONLY, useIdentityFallback));
    verifyDescriptor(filePath, expected, descriptor, useIdentityFallback);
    const chunks: Buffer[] = [];
    const size = Math.max(expected.size, 1);
    let offset = 0;
    for (;;) {
      const chunk = Buffer.alloc(Math.min(64 * 1024, Math.max(size - offset, 1)));
      const read = readSync(descriptor, chunk, 0, chunk.length, null);
      if (read === 0) break;
      chunks.push(chunk.subarray(0, read));
      offset += read;
    }
    return Buffer.concat(chunks);
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (descriptor !== undefined) {
      const openDescriptor = descriptor;
      descriptor = undefined;
      closeDescriptor(openDescriptor, primaryError);
    }
  }
}

/** Read at most maxBytes from a regular file tail through the validated descriptor. */
export function readRegularFileTail(filePath: string, maxBytes: number): Buffer {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error("invalid tail byte limit");
  const expected = lstatRegular(filePath);
  let descriptor: number | undefined;
  let primaryError: unknown;
  try {
    descriptor = openSync(filePath, noFollowFlags(constants.O_RDONLY, false));
    verifyDescriptor(filePath, expected, descriptor, false);
    const length = Math.min(expected.size, maxBytes);
    const bytes = Buffer.alloc(length);
    let offset = 0;
    while (offset < length) {
      const read = readSync(descriptor, bytes, offset, length - offset, expected.size - length + offset);
      if (read === 0) break;
      offset += read;
    }
    return bytes.subarray(0, offset);
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (descriptor !== undefined) closeDescriptor(descriptor, primaryError);
  }
}

/** Return the validated size of a managed regular file. */
export function regularFileSize(filePath: string): number {
  return lstatRegular(filePath).size;
}

/** List only an already-validated managed directory. */
export function listManagedDirectory(dir: string): string[] {
  assertTrustedDirectory(dir);
  return readdirSync(dir);
}

const removePrivateTemporary = (filePath: string): void => {
  if (lstatOptionalRegular(filePath) !== undefined) unlinkSync(filePath);
};

/** Atomically replace a managed regular file using an exclusive same-directory private temporary. */
export function writePrivateFileAtomic(
  filePath: string,
  bytes: Buffer | string,
  testOptions?: StorePathTestOptions,
): void {
  const options = validateTestOptions(testOptions);
  const directory = path.dirname(filePath);
  assertTrustedDirectory(directory);
  const initialTarget = lstatOptionalRegular(filePath);
  const data = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes, "utf8");
  const temporary = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${randomBytes(9).toString("hex")}.tmp`);
  let descriptor: number | undefined;
  let error: unknown;
  let failed = false;
  try {
    descriptor = openSync(
      temporary,
      noFollowFlags(constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, false),
      PRIVATE_FILE_MODE,
    );
    let offset = 0;
    while (offset < data.length) offset += writeSync(descriptor, data, offset, data.length - offset);
    fsyncSync(descriptor);
    const openDescriptor = descriptor;
    descriptor = undefined;
    closeDescriptor(openDescriptor, undefined);
    const tempStatus = lstatRegular(temporary);
    if ((tempStatus.mode & 0o777) !== PRIVATE_FILE_MODE) chmodSync(temporary, PRIVATE_FILE_MODE);
    options?.afterValidation?.("before-publish");
    assertTrustedDirectory(directory);
    const beforePublish = lstatOptionalRegular(filePath);
    if (
      (initialTarget === undefined && beforePublish !== undefined) ||
      (initialTarget !== undefined && (beforePublish === undefined || !sameIdentity(initialTarget, beforePublish)))
    ) {
      throw new Error(`managed file changed before publication: ${filePath}`);
    }
    renameSync(temporary, filePath);
    syncManagedDirectory(directory);
  } catch (caught) {
    error = caught;
    failed = true;
  }
  if (descriptor !== undefined) {
    const openDescriptor = descriptor;
    descriptor = undefined;
    try {
      closeSync(openDescriptor);
    } catch (caught) {
      if (!failed) {
        error = caught;
        failed = true;
      }
    }
  }
  if (existsSync(temporary)) {
    try {
      removePrivateTemporary(temporary);
    } catch (caught) {
      if (!failed) {
        error = caught;
        failed = true;
      }
    }
  }
  if (failed) throw error;
}

/** Copy only bytes first read from a validated regular file into an atomic private destination. */
export function copyPrivateRegularFile(source: string, destination: string): void {
  writePrivateFileAtomic(destination, readRegularFile(source));
}

/** Append to a validated regular file, or exclusively create a new private file without following a final symlink. */
export function appendPrivateFile(filePath: string, text: Buffer | string): void {
  const directory = path.dirname(filePath);
  assertTrustedDirectory(directory);
  let descriptor: number | undefined;
  let primaryError: unknown;
  try {
    try {
      const expected = lstatRegular(filePath);
      descriptor = openSync(filePath, noFollowFlags(constants.O_WRONLY | constants.O_APPEND, false));
      verifyDescriptor(filePath, expected, descriptor, false);
    } catch (error) {
      if (!isMissing(error)) throw error;
      descriptor = openSync(
        filePath,
        noFollowFlags(constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_EXCL, false),
        PRIVATE_FILE_MODE,
      );
      assertRegular(filePath, fstatSync(descriptor));
    }
    const bytes = Buffer.isBuffer(text) ? text : Buffer.from(text, "utf8");
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
    fsyncSync(descriptor);
    syncManagedDirectory(directory);
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (descriptor !== undefined) {
      const openDescriptor = descriptor;
      descriptor = undefined;
      closeDescriptor(openDescriptor, primaryError);
    }
  }
}

const restoreQuarantineIfSafe = (original: string, quarantine: string): void => {
  try {
    assertTrustedDirectory(path.dirname(original));
    try {
      lstatSync(original);
      return;
    } catch (error) {
      if (!isMissing(error)) return;
    }
    renameSync(quarantine, original);
  } catch {
    // Preserve the replacement error and leave the quarantined entry intact.
  }
};

/** Delete a verified regular file; unlink never follows a final symlink. */
export function removeRegularFile(filePath: string, testOptions?: StorePathTestOptions): void {
  const options = validateTestOptions(testOptions);
  const expected = lstatRegular(filePath);
  const directory = path.dirname(filePath);
  assertDirectory(directory);
  const quarantine = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${randomBytes(9).toString("hex")}.removing`);
  options?.afterValidation?.("before-file-removal");
  renameSync(filePath, quarantine);
  const moved = lstatSync(quarantine);
  if (moved.isSymbolicLink() || !moved.isFile()) {
    restoreQuarantineIfSafe(filePath, quarantine);
    throw new Error(`managed file changed before removal: ${filePath}`);
  }
  let matches = false;
  try {
    matches = sameIdentity(expected, moved);
  } catch (error) {
    restoreQuarantineIfSafe(filePath, quarantine);
    throw error;
  }
  if (!matches) {
    restoreQuarantineIfSafe(filePath, quarantine);
    throw new Error(`managed file changed before removal: ${filePath}`);
  }
  unlinkSync(quarantine);
  syncManagedDirectory(directory);
}

/** Remove only a directory that was just verified as managed; never recurse through a symlink. */
export function removeManagedDirectory(dir: string, testOptions?: StorePathTestOptions): void {
  const options = validateTestOptions(testOptions);
  assertTrustedDirectory(path.dirname(dir));
  const status = lstatSync(dir);
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error(`managed directory is not a real directory: ${dir}`);
  }
  const directory = path.dirname(dir);
  const quarantine = path.join(directory, `.${path.basename(dir)}.${process.pid}.${randomBytes(9).toString("hex")}.removing`);
  options?.afterValidation?.("before-directory-removal");
  renameSync(dir, quarantine);
  const moved = lstatSync(quarantine);
  if (moved.isSymbolicLink() || !moved.isDirectory()) {
    restoreQuarantineIfSafe(dir, quarantine);
    throw new Error(`managed directory changed before removal: ${dir}`);
  }
  let matches = false;
  try {
    matches = sameIdentity(status, moved);
  } catch (error) {
    restoreQuarantineIfSafe(dir, quarantine);
    throw error;
  }
  if (!matches) {
    restoreQuarantineIfSafe(dir, quarantine);
    throw new Error(`managed directory changed before removal: ${dir}`);
  }
  rmSync(quarantine, { recursive: true, force: false });
  syncManagedDirectory(directory);
}

/** Validate a tenant or record id as one portable filesystem segment without rewriting it. */
export function safePathSegment(id: string): string {
  if (
    typeof id !== "string" ||
    !/^[a-zA-Z0-9_][a-zA-Z0-9._-]{0,127}$/.test(id) ||
    id === "." ||
    id === ".."
  ) {
    throw new Error("invalid filesystem path segment");
  }
  return id;
}

/**
 * Resolve the effective data root for a store, applying optional tenant prefix.
 * Layout: `{rootDir}/{tenantId}/work-records|events|audit|backups` when tenantId set.
 */
export function resolveTenantRoot(
  rootDir: string,
  tenantId?: string,
): string {
  const root = path.resolve(rootDir);
  if (tenantId === undefined) return root;
  return path.join(root, safePathSegment(tenantId));
}

/** Resolve the validated JSON record path beneath a store root. */
export function recordPath(root: string, id: string): string {
  const safe = safePathSegment(id);
  return path.join(root, "records", `${safe}.json`);
}

/** Resolve the validated event-log path beneath a store root. */
export function eventsPath(root: string, id: string): string {
  const safe = safePathSegment(id);
  return path.join(root, "events", `${safe}.jsonl`);
}
