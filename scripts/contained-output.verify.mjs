/** Deterministic adversarial verification for contained output publication. */
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { umask } from "node:process";
import { writeContainedText } from "./contained-output.mjs";

function requireEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function requireThrowsExact(callback, message, label) {
  try {
    callback();
  } catch (error) {
    requireEqual(error?.message, message, label);
    return;
  }
  throw new Error(`${label}: expected ${message}`);
}

function requireThrowsContaining(callback, message, label) {
  try {
    callback();
  } catch (error) {
    if (error?.message?.includes(message)) return;
    throw new Error(`${label}: unexpected error ${String(error)}`);
  }
  throw new Error(`${label}: expected an error containing ${message}`);
}

function temporaryOutputs(directory) {
  return readdirSync(directory).filter((name) =>
    name.startsWith(".contained-output-"),
  );
}

function verifyCreateAndAtomicOverwrite(root) {
  const candidate = "nested/capture.txt";
  const absolute = writeContainedText(root, candidate, "alpha\n");
  requireEqual(absolute, resolve(root, candidate), "absolute return path");
  requireEqual(readFileSync(absolute, "utf8"), "alpha\n", "created bytes");
  requireEqual(
    statSync(absolute).mode & 0o777,
    0o644 & ~umask() & 0o777,
    "new-file mode",
  );

  chmodSync(absolute, 0o640);
  const originalInode = statSync(absolute).ino;
  writeContainedText(root, candidate, "bravo\n");
  const replacement = statSync(absolute);
  requireEqual(readFileSync(absolute, "utf8"), "bravo\n", "overwrite bytes");
  requireEqual(replacement.mode & 0o777, 0o640, "overwrite mode");
  if (replacement.ino === originalInode) {
    throw new Error("atomic overwrite must replace the destination inode");
  }
  requireEqual(temporaryOutputs(join(root, "nested")).length, 0, "published temp cleanup");
}

function verifyHardLinkRejection(root, fixtureParent) {
  const external = join(fixtureParent, "external.txt");
  const linked = join(root, "hard-linked.txt");
  writeFileSync(external, "outside-before", "utf8");
  linkSync(external, linked);
  requireThrowsExact(
    () => writeContainedText(root, linked, "outside-after"),
    "contained output has multiple hard links",
    "hard-link rejection",
  );
  requireEqual(readFileSync(external, "utf8"), "outside-before", "external hard-link bytes");
  requireEqual(readFileSync(linked, "utf8"), "outside-before", "contained hard-link bytes");
}

function verifySymlinkRejection(root, fixtureParent) {
  const external = join(fixtureParent, "symlink-target.txt");
  writeFileSync(external, "outside-before", "utf8");
  symlinkSync(external, join(root, "leaf-link.txt"));
  requireThrowsExact(
    () => writeContainedText(root, "leaf-link.txt", "outside-after"),
    "contained path includes a symlink component",
    "leaf symlink rejection",
  );

  const externalDirectory = join(fixtureParent, "external-directory");
  mkdirSync(externalDirectory);
  symlinkSync(externalDirectory, join(root, "parent-link"), "dir");
  requireThrowsExact(
    () => writeContainedText(root, "parent-link/capture.txt", "outside-after"),
    "contained path includes a symlink component",
    "parent symlink rejection",
  );
  requireEqual(readFileSync(external, "utf8"), "outside-before", "symlink target bytes");
  requireEqual(
    existsSync(join(externalDirectory, "capture.txt")),
    false,
    "parent symlink external creation",
  );
}

function verifyBoundaryErrors(root, fixtureParent) {
  mkdirSync(join(root, "directory-target"));
  requireThrowsExact(
    () => writeContainedText(root, "directory-target", "value"),
    "contained output is not a regular file",
    "directory target rejection",
  );
  requireThrowsExact(
    () => writeContainedText(root, "../escape.txt", "value"),
    "contained path escapes repository root",
    "lexical escape rejection",
  );
  requireThrowsExact(
    () => writeContainedText(root, ".git/capture.txt", "value"),
    "contained path is protected",
    "protected path rejection",
  );

  const invalidRoot = join(fixtureParent, "not-a-directory");
  writeFileSync(invalidRoot, "value", "utf8");
  requireThrowsExact(
    () => writeContainedText(invalidRoot, "capture.txt", "value"),
    "contained root must be a real directory",
    "invalid root rejection",
  );
}

function verifyFailedWriteCleanup(root) {
  mkdirSync(join(root, "failure"));
  requireThrowsContaining(
    () => writeContainedText(root, "failure/capture.txt", Symbol("invalid")),
    "must be of type string",
    "invalid contents rejection",
  );
  requireEqual(existsSync(join(root, "failure/capture.txt")), false, "failed destination cleanup");
  requireEqual(temporaryOutputs(join(root, "failure")).length, 0, "failed temp cleanup");
}

function verifyContainedOutput() {
  const fixtureParent = mkdtempSync(join(tmpdir(), "practice-relay-contained-"));
  const root = join(fixtureParent, "root");
  mkdirSync(root);
  try {
    verifyCreateAndAtomicOverwrite(root);
    verifyHardLinkRejection(root, fixtureParent);
    verifySymlinkRejection(root, fixtureParent);
    verifyBoundaryErrors(root, fixtureParent);
    verifyFailedWriteCleanup(root);
  } finally {
    rmSync(fixtureParent, { recursive: true, force: true });
  }
  return true;
}

export const verificationComplete = verifyContainedOutput();
