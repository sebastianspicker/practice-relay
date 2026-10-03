/** Deterministic adversarial verification for contained repository reads. */
import {
  constants,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { execPath } from "node:process";
import { URL } from "node:url";
import {
  hasSafeRepositoryPath,
  readRepositoryText,
  readRepositoryTextWithIdentityFallback,
  resolveExistingContainedPath,
  resolveExistingRepositoryPath,
} from "./repository-files.mjs";

function requireEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function requireTrue(value, label) {
  requireEqual(value, true, label);
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

function verifyOrdinaryReadAndContracts(root) {
  mkdirSync(join(root, "nested"));
  const candidate = "nested/ordinary.txt";
  const absolute = join(root, candidate);
  const contents = "Mañana, déjà vu.\n";
  writeFileSync(absolute, contents, "utf8");

  const resolved = resolveExistingRepositoryPath(root, candidate);
  const expectedInfo = lstatSync(absolute);
  requireEqual(resolved.absolute, resolve(root, candidate), "absolute return path");
  requireTrue(resolved.info.isFile(), "resolved info is a regular file");
  requireEqual(resolved.info.dev, expectedInfo.dev, "resolved device identity");
  requireEqual(resolved.info.ino, expectedInfo.ino, "resolved inode identity");
  if (typeof constants.O_NOFOLLOW === "number") {
    requireEqual(readRepositoryText(root, candidate), contents, "UTF-8 text read");
  } else {
    requireThrowsExact(
      () => readRepositoryText(root, candidate),
      "repository path cannot enforce no-follow protection",
      "strict reader rejects unavailable no-follow support",
    );
  }
  requireEqual(
    readRepositoryTextWithIdentityFallback(root, candidate),
    contents,
    "automatic fallback UTF-8 text read",
  );
  requireEqual(
    readRepositoryTextWithIdentityFallback(root, candidate, { forceIdentityFallback: true }),
    contents,
    "fallback UTF-8 text read without no-follow support",
  );
  requireTrue(hasSafeRepositoryPath(root, candidate), "safe file predicate");
  requireEqual(hasSafeRepositoryPath(root, "missing.txt"), false, "missing file predicate");
}

function verifyExistingRejections(root, fixtureParent) {
  requireThrowsExact(
    () => resolveExistingRepositoryPath(root, "../escape.txt"),
    "repository path escapes its root",
    "lexical escape rejection",
  );
  requireThrowsExact(
    () => resolveExistingRepositoryPath(root, ".git/config"),
    "repository path is protected",
    "protected path rejection",
  );

  const external = join(fixtureParent, "external.txt");
  writeFileSync(external, "external", "utf8");
  symlinkSync(external, join(root, "final-link.txt"));
  requireThrowsExact(
    () => resolveExistingRepositoryPath(root, "final-link.txt"),
    "repository path is a symlink",
    "final symlink resolution rejection",
  );
  requireThrowsExact(
    () => readRepositoryText(root, "final-link.txt"),
    "repository path is a symlink",
    "final symlink read rejection",
  );
  requireEqual(hasSafeRepositoryPath(root, "final-link.txt"), false, "symlink predicate");

  mkdirSync(join(root, "directory-target"));
  requireTrue(hasSafeRepositoryPath(root, "directory-target"), "directory predicate");
  requireThrowsExact(
    () => readRepositoryText(root, "directory-target"),
    "repository path is not a regular file",
    "directory read rejection",
  );
}

function verifyGenericAndProtectedWrappers(root, fixtureParent) {
  const externalDirectory = join(fixtureParent, "external-directory");
  mkdirSync(externalDirectory);
  writeFileSync(join(externalDirectory, "outside.txt"), "outside\n", "utf8");
  symlinkSync(externalDirectory, join(root, "external-parent"), "dir");
  requireThrowsExact(
    () => resolveExistingContainedPath(root, "external-parent/outside.txt"),
    "contained path resolves outside its root",
    "generic external parent rejection",
  );
  requireThrowsExact(
    () => resolveExistingRepositoryPath(root, "external-parent/outside.txt"),
    "repository path resolves outside its root",
    "protected wrapper external parent rejection",
  );

  const protectedDirectory = join(root, ".git");
  mkdirSync(protectedDirectory);
  const protectedTarget = join(protectedDirectory, "config");
  writeFileSync(protectedTarget, "protected\n", "utf8");
  symlinkSync(protectedDirectory, join(root, "protected-parent"), "dir");
  requireEqual(
    resolveExistingContainedPath(root, "protected-parent/config").absolute,
    join(root, "protected-parent", "config"),
    "generic canonical protected target return",
  );
  requireThrowsExact(
    () => resolveExistingRepositoryPath(root, "protected-parent/config"),
    "repository path resolves into a protected location",
    "protected wrapper canonical protected target rejection",
  );
}

function runDeterministicLeafMutation({
  moduleUrl,
  root,
  target,
  external,
  replacement,
  mutation,
  reader,
}) {
  const helper = [
    "import fs from 'node:fs';",
    "import { syncBuiltinESMExports } from 'node:module';",
    "const [moduleUrl, root, target, external, replacement, mutation, readerName] = process.argv.slice(1);",
    "const originalOpen = fs.openSync;",
    "const originalFstat = fs.fstatSync;",
    "const originalRead = fs.readFileSync;",
    "const originalClose = fs.closeSync;",
    "let mutated = false;",
    "let descriptor;",
    "let closeCalls = 0;",
    "let openCalls = 0;",
    "let descriptorReadCalls = 0;",
    "let openFlags;",
    "const descriptorEvents = [];",
    "fs.openSync = (path, flags, mode) => {",
    "  if (path === target) openCalls += 1;",
    "  if (!mutated && path === target) {",
    "    mutated = true;",
    "    if (mutation === 'regular') fs.renameSync(replacement, target);",
    "    else if (mutation === 'same-inode') { fs.rmSync(target, { force: true }); fs.linkSync(replacement, target); }",
    "    else if (mutation === 'symlink') { fs.rmSync(target, { force: true }); fs.symlinkSync(external, target); }",
    "    else if (mutation === 'directory') { fs.rmSync(target, { force: true }); fs.mkdirSync(target); }",
    "    else if (mutation === 'open') throw new Error('injected open failure');",
    "  }",
    "  const opened = originalOpen(path, flags, mode);",
    "  if (path === target) { descriptor = opened; openFlags = flags; }",
    "  return opened;",
    "};",
    "fs.fstatSync = (fd, options) => {",
    "  if (fd === descriptor) descriptorEvents.push('fstat');",
    "  if (mutation === 'fstat' && fd === descriptor) throw new Error('injected fstat failure');",
    "  return originalFstat(fd, options);",
    "};",
    "fs.readFileSync = (fd, options) => {",
    "  if (fd === descriptor) { descriptorEvents.push('read'); descriptorReadCalls += 1; }",
    "  if (mutation === 'read' && fd === descriptor) throw new Error('injected read failure');",
    "  return originalRead(fd, options);",
    "};",
    "fs.closeSync = (fd) => {",
    "  if (fd === descriptor) { closeCalls += 1; originalClose(fd); if (mutation === 'fstat' || mutation === 'read' || mutation === 'close') throw new Error('injected close failure'); return; }",
    "  return originalClose(fd);",
    "};",
    "syncBuiltinESMExports();",
    "const module = await import(moduleUrl);",
    "const reader = readerName === 'strict' ? module.readRepositoryText : module.readRepositoryTextWithIdentityFallback;",
    "if (readerName === 'invalid') {",
    "  for (const options of [{ forceIdentityFallback: false }, { forceIdentityFallback: true, extra: true }, { forceIdentityFallback: 1 }, { noFollowFlag: 0 }, null, 0, 'forceIdentityFallback']) {",
    "    try { module.readRepositoryTextWithIdentityFallback(root, target, options); throw new Error('invalid options were accepted'); }",
    "    catch (error) { if (!(error instanceof TypeError) || error.message !== 'repository identity fallback options are invalid') throw error; }",
    "  }",
    "  if (originalRead(target, 'utf8') !== 'contained\\n') throw new Error('invalid options changed the target');",
    "} else {",
    "  const options = readerName === 'forced' ? { forceIdentityFallback: true } : undefined;",
    "  try {",
    "    const text = readerName === 'forced' ? reader(root, target, options) : reader(root, target);",
    "    if (!['success', 'same-inode'].includes(mutation) || text !== 'contained\\n') throw new Error('leaf mutation was not rejected');",
    "  } catch (error) {",
    "    if (['success', 'same-inode'].includes(mutation)) throw error;",
    "    const expected = mutation === 'open' ? 'injected open failure' : mutation === 'fstat' ? 'injected fstat failure' : mutation === 'read' ? 'injected read failure' : mutation === 'close' ? 'injected close failure' : mutation === 'directory' ? 'repository path is not a regular file' : 'repository path changed after validation';",
    "    if (error?.message !== expected) throw error;",
    "  }",
    "}",
    "const symlinkOpenFailed = mutation === 'symlink' && readerName !== 'forced' && typeof fs.constants.O_NOFOLLOW === 'number';",
    "const expectedCloses = readerName === 'invalid' || mutation === 'open' || symlinkOpenFailed ? 0 : 1;",
    "if (closeCalls !== expectedCloses) throw new Error(`expected ${expectedCloses} close calls, got ${closeCalls}`);",
    "const expectedOpens = readerName === 'invalid' ? 0 : 1;",
    "if (openCalls !== expectedOpens) throw new Error(`expected ${expectedOpens} open calls, got ${openCalls}`);",
    "if (readerName === 'forced' && openFlags !== undefined) {",
    "  if ((openFlags & fs.constants.O_NOFOLLOW) !== 0) throw new Error('fallback unexpectedly used no-follow');",
    "  if ((openFlags & (fs.constants.O_WRONLY | fs.constants.O_RDWR)) !== 0) throw new Error('fallback did not preserve read-only flags');",
    "  if (typeof fs.constants.O_NONBLOCK === 'number' && (openFlags & fs.constants.O_NONBLOCK) !== fs.constants.O_NONBLOCK) throw new Error('fallback did not preserve nonblocking flag');",
    "}",
    "if (readerName === 'automatic' && openFlags !== undefined && typeof fs.constants.O_NOFOLLOW === 'number' && (openFlags & fs.constants.O_NOFOLLOW) !== fs.constants.O_NOFOLLOW) throw new Error('automatic fallback did not prefer no-follow');",
    "if (mutation === 'success' && descriptorEvents.join(',') !== 'fstat,read') throw new Error(`descriptor read order was ${descriptorEvents.join(',')}`);",
    "if (['regular', 'symlink', 'directory'].includes(mutation) && descriptorReadCalls !== 0) throw new Error(`rejected replacement performed ${descriptorReadCalls} descriptor reads`);",
    "if (fs.readFileSync(external, 'utf8') !== 'external\\n') throw new Error('external leaf was read');",
  ].join("\n");
  const child = spawnSync(execPath, [
    "--input-type=module",
    "-e",
    helper,
    moduleUrl,
    root,
    target,
    external,
    replacement,
    mutation,
    reader,
  ], { encoding: "utf8", stdio: ["ignore", "ignore", "pipe"] });
  if (child.error) throw child.error;
  if (child.status !== 0) {
    throw new Error(
      `leaf replacement helper failed: ${String(child.status)}: ${child.stderr}`,
    );
  }
}

function verifyDeterministicLeafIdentity(root, fixtureParent) {
  const target = join(root, "deterministic-race.txt");
  const external = join(fixtureParent, "deterministic-external.txt");
  const moduleUrl = new URL("./repository-files.mjs", import.meta.url).href;
  writeFileSync(external, "external\n", "utf8");
  const readers = ["automatic", "forced"];
  if (typeof constants.O_NOFOLLOW === "number") readers.unshift("strict");
  for (const reader of readers) {
    for (const mutation of [
      "success",
      "regular",
      "symlink",
      "directory",
      "open",
      "fstat",
      "read",
      "close",
      "same-inode",
    ]) {
      rmSync(target, { recursive: true, force: true });
      writeFileSync(target, "contained\n", "utf8");
      const replacement = join(root, `deterministic-${reader}-${mutation}.txt`);
      if (mutation === "same-inode") {
        // A hard-link replacement preserves dev/ino, so identity checks cannot distinguish it.
        linkSync(target, replacement);
      } else {
        writeFileSync(replacement, "replacement\n", "utf8");
      }
      runDeterministicLeafMutation({
        moduleUrl,
        root,
        target,
        external,
        replacement,
        mutation,
        reader,
      });
    }
  }
  rmSync(target, { recursive: true, force: true });
  writeFileSync(target, "contained\n", "utf8");
  const invalidReplacement = join(root, "deterministic-invalid-options.txt");
  writeFileSync(invalidReplacement, "replacement\n", "utf8");
  runDeterministicLeafMutation({
    moduleUrl,
    root,
    target,
    external,
    replacement: invalidReplacement,
    mutation: "invalid-options",
    reader: "invalid",
  });
}

function verifyRepositoryFiles() {
  const fixtureParent = mkdtempSync(join(tmpdir(), "practice-relay-repository-files-"));
  const root = join(fixtureParent, "root");
  mkdirSync(root);
  try {
    verifyOrdinaryReadAndContracts(root);
    verifyExistingRejections(root, fixtureParent);
    verifyGenericAndProtectedWrappers(root, fixtureParent);
    verifyDeterministicLeafIdentity(root, fixtureParent);
  } finally {
    rmSync(fixtureParent, { recursive: true, force: true });
  }
  return true;
}

export const verificationComplete = verifyRepositoryFiles();
