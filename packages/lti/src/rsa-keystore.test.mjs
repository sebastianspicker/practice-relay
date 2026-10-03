/** Filesystem and publication regression tests for the LTI RSA keystore. */
import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import fs, {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as nodeTest } from "node:test";
import { exportPlatformJwks, signRs256Jwt, verifyRs256Jwt } from "./jwt.mjs";
import { generateLabPlatformKeys, resolveLabRsaKeys } from "./rsa-keystore.mjs";

const maxKeyBytes = 64 * 1024;
const keyMode = (filePath) => lstatSync(filePath).mode & 0o777;
const keyError = (fn, code) => assert.throws(fn, (error) => error?.code === code);
const artifacts = (dir) => readdirSync(dir).filter((name) => name.startsWith(".practice-relay-lti-"));

function withDir(run) {
  const dir = mkdtempSync(join(tmpdir(), "lti-keys-"));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function writePair(dir, pair = generateLabPlatformKeys()) {
  const privatePath = join(dir, "private.pem");
  const publicPath = join(dir, "public.pem");
  writeFileSync(privatePath, pair.privateKey, { mode: 0o600 });
  writeFileSync(publicPath, pair.publicKey, { mode: 0o644 });
  chmodSync(privatePath, 0o600);
  chmodSync(publicPath, 0o644);
  return { ...pair, privatePath, publicPath };
}

function replaceFsMethod(name, replacement) {
  switch (name) {
    case "fstatSync": {
      const original = fs.fstatSync;
      fs.fstatSync = replacement;
      return () => { fs.fstatSync = original; };
    }
    case "fsyncSync": {
      const original = fs.fsyncSync;
      fs.fsyncSync = replacement;
      return () => { fs.fsyncSync = original; };
    }
    case "linkSync": {
      const original = fs.linkSync;
      fs.linkSync = replacement;
      return () => { fs.linkSync = original; };
    }
    case "readSync": {
      const original = fs.readSync;
      fs.readSync = replacement;
      return () => { fs.readSync = original; };
    }
    case "unlinkSync": {
      const original = fs.unlinkSync;
      fs.unlinkSync = replacement;
      return () => { fs.unlinkSync = original; };
    }
    default:
      throw new TypeError(`unsupported fs test patch: ${name}`);
  }
}

function patchFs(name, replacement, run) {
  const restore = replaceFsMethod(name, replacement);
  syncBuiltinESMExports();
  try {
    return run();
  } finally {
    restore();
    syncBuiltinESMExports();
  }
}

nodeTest("inline precedence, halves, and disabled directories preserve the no-filesystem contract", () => withDir((root) => {
  const inline = generateLabPlatformKeys();
  const missing = join(root, "missing");
  const resolved = resolveLabRsaKeys({
    PRACTICE_RELAY_LTI_RSA_PRIVATE: inline.privateKey,
    PRACTICE_RELAY_LTI_RSA_PUBLIC: inline.publicKey,
    PRACTICE_RELAY_LTI_KEYS_DIR: missing,
    PRACTICE_RELAY_LTI_GENERATE_RSA: "1",
  });
  assert.equal(resolved.privateKeyPem, inline.privateKey.trim());
  assert.equal(existsSync(missing), false);
  for (const half of [
    { PRACTICE_RELAY_LTI_RSA_PRIVATE: inline.privateKey },
    { PRACTICE_RELAY_LTI_RSA_PUBLIC: inline.publicKey },
  ]) {
    keyError(
      () => resolveLabRsaKeys({ ...half, PRACTICE_RELAY_LTI_KEYS_DIR: missing }),
      "ERR_LTI_KEY_CONFIG",
    );
    assert.equal(existsSync(missing), false);
  }
  assert.equal(resolveLabRsaKeys({}), null);
  assert.equal(resolveLabRsaKeys({ PRACTICE_RELAY_LTI_KEYS_DIR: missing }), null);
}));

nodeTest("generation uses safe modes, reloads byte-identically, and supplies an RS256/JWKS pair", () => withDir((root) => {
  const dir = join(root, "nested", "keys");
  const generated = resolveLabRsaKeys({
    PRACTICE_RELAY_LTI_KEYS_DIR: dir,
    PRACTICE_RELAY_LTI_GENERATE_RSA: "1",
  });
  assert.equal(keyMode(dir), 0o700);
  assert.equal(keyMode(join(dir, "private.pem")), 0o600);
  assert.equal(keyMode(join(dir, "public.pem")), 0o644);
  assert.deepEqual(resolveLabRsaKeys({ PRACTICE_RELAY_LTI_KEYS_DIR: dir }), generated);
  assert.equal(readFileSync(join(dir, "private.pem"), "utf8"), generated.privateKeyPem);
  assert.deepEqual(artifacts(dir), []);
  const token = signRs256Jwt({ sub: "keystore" }, generated.privateKeyPem);
  assert.equal(verifyRs256Jwt(token, generated.publicKeyPem).sub, "keystore");
  const jwk = exportPlatformJwks(generated.publicKeyPem).keys[0];
  assert.equal(jwk.kty, "RSA");
  assert.ok(jwk.n && jwk.e);
}));

nodeTest("partial, symlink, non-file, and unsafe-mode stores fail closed", () => withDir((root) => {
  for (const name of ["private.pem", "public.pem"]) {
    const dir = join(root, `partial-${name}`);
    mkdirSync(dir, { mode: 0o700 });
    const partial = join(dir, name);
    writeFileSync(partial, "partial", { mode: 0o600 });
    const before = readFileSync(partial);
    for (const generate of [undefined, "1"]) {
      keyError(
        () => resolveLabRsaKeys({ PRACTICE_RELAY_LTI_KEYS_DIR: dir, ...(generate ? { PRACTICE_RELAY_LTI_GENERATE_RSA: generate } : {}) }),
        "ERR_LTI_KEY_PARTIAL",
      );
      assert.deepEqual(readFileSync(partial), before);
    }
  }
  const real = join(root, "real");
  const linked = join(root, "linked");
  mkdirSync(real, { mode: 0o700 });
  symlinkSync(real, linked);
  keyError(() => resolveLabRsaKeys({ PRACTICE_RELAY_LTI_KEYS_DIR: linked }), "ERR_LTI_KEYSTORE_TYPE");
  const fileLink = join(root, "file-link");
  mkdirSync(fileLink, { mode: 0o700 });
  const pair = writePair(fileLink);
  rmSync(pair.publicPath);
  symlinkSync(pair.privatePath, pair.publicPath);
  keyError(() => resolveLabRsaKeys({ PRACTICE_RELAY_LTI_KEYS_DIR: fileLink }), "ERR_LTI_KEYSTORE_TYPE");
  const keyDirectory = join(root, "key-directory");
  mkdirSync(keyDirectory, { mode: 0o700 });
  mkdirSync(join(keyDirectory, "private.pem"));
  mkdirSync(join(keyDirectory, "public.pem"));
  keyError(() => resolveLabRsaKeys({ PRACTICE_RELAY_LTI_KEYS_DIR: keyDirectory }), "ERR_LTI_KEYSTORE_TYPE");
  const unsafe = join(root, "unsafe");
  mkdirSync(unsafe, { mode: 0o700 });
  chmodSync(unsafe, 0o770);
  keyError(() => resolveLabRsaKeys({ PRACTICE_RELAY_LTI_KEYS_DIR: unsafe }), "ERR_LTI_KEYSTORE_PERMISSIONS");
  const privateMode = join(root, "private-mode");
  mkdirSync(privateMode, { mode: 0o700 });
  const privatePair = writePair(privateMode);
  chmodSync(privatePair.privatePath, 0o640);
  keyError(() => resolveLabRsaKeys({ PRACTICE_RELAY_LTI_KEYS_DIR: privateMode }), "ERR_LTI_KEYSTORE_PERMISSIONS");
  const publicMode = join(root, "public-mode");
  mkdirSync(publicMode, { mode: 0o700 });
  const publicPair = writePair(publicMode);
  chmodSync(publicPair.publicPath, 0o664);
  keyError(() => resolveLabRsaKeys({ PRACTICE_RELAY_LTI_KEYS_DIR: publicMode }), "ERR_LTI_KEYSTORE_PERMISSIONS");
}));

nodeTest("invalid, mismatched, short, and non-RSA pairs fail validation", () => withDir((root) => {
  const mismatch = join(root, "mismatch");
  mkdirSync(mismatch, { mode: 0o700 });
  const first = generateLabPlatformKeys();
  const second = generateLabPlatformKeys();
  writePair(mismatch, { privateKey: first.privateKey, publicKey: second.publicKey });
  keyError(() => resolveLabRsaKeys({ PRACTICE_RELAY_LTI_KEYS_DIR: mismatch }), "ERR_LTI_KEYPAIR");
  const ec = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const ecDir = join(root, "ec");
  mkdirSync(ecDir, { mode: 0o700 });
  writePair(ecDir, ec);
  keyError(() => resolveLabRsaKeys({ PRACTICE_RELAY_LTI_KEYS_DIR: ecDir }), "ERR_LTI_KEYPAIR");
  const short = generateKeyPairSync("rsa", {
    modulusLength: 1024,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const shortDir = join(root, "short");
  mkdirSync(shortDir, { mode: 0o700 });
  writePair(shortDir, short);
  keyError(() => resolveLabRsaKeys({ PRACTICE_RELAY_LTI_KEYS_DIR: shortDir }), "ERR_LTI_KEYPAIR");
  const privatePublic = join(root, "private-public");
  mkdirSync(privatePublic, { mode: 0o700 });
  writePair(privatePublic, { privateKey: first.privateKey, publicKey: first.privateKey });
  keyError(() => resolveLabRsaKeys({ PRACTICE_RELAY_LTI_KEYS_DIR: privatePublic }), "ERR_LTI_KEYPAIR");
}));

nodeTest("an existing lock reports busy without mutating the store", () => withDir((dir) => {
  const lock = join(dir, ".practice-relay-lti-keys.lock");
  writeFileSync(lock, "operator lock", { mode: 0o600, flag: "wx" });
  keyError(
    () => resolveLabRsaKeys({ PRACTICE_RELAY_LTI_KEYS_DIR: dir, PRACTICE_RELAY_LTI_GENERATE_RSA: "1" }),
    "ERR_LTI_KEYGEN_BUSY",
  );
  assert.equal(readFileSync(lock, "utf8"), "operator lock");
  assert.equal(existsSync(join(dir, "private.pem")), false);
}));

nodeTest("lock fsync setup failure leaves no owned lock or keys", () => withDir((dir) => {
  const originalFsync = fs.fsyncSync;
  patchFs("fsyncSync", () => { throw new Error("lock fsync failed"); }, () => {
    keyError(
      () => resolveLabRsaKeys({ PRACTICE_RELAY_LTI_KEYS_DIR: dir, PRACTICE_RELAY_LTI_GENERATE_RSA: "1" }),
      "ERR_LTI_KEYGEN_PUBLISH",
    );
  });
  assert.equal(fs.fsyncSync, originalFsync);
  assert.deepEqual(readdirSync(dir), []);
}));

nodeTest("first ownership fstat failure removes the lock and a retry succeeds", () => withDir((dir) => {
  const originalFstat = fs.fstatSync;
  let failed = false;
  patchFs("fstatSync", (...args) => {
    if (!failed) {
      failed = true;
      throw new Error("first ownership fstat failed");
    }
    return originalFstat(...args);
  }, () => {
    keyError(
      () => resolveLabRsaKeys({ PRACTICE_RELAY_LTI_KEYS_DIR: dir, PRACTICE_RELAY_LTI_GENERATE_RSA: "1" }),
      "ERR_LTI_KEYGEN_PUBLISH",
    );
  });
  assert.deepEqual(readdirSync(dir), []);
  assert.ok(resolveLabRsaKeys({ PRACTICE_RELAY_LTI_KEYS_DIR: dir, PRACTICE_RELAY_LTI_GENERATE_RSA: "1" }));
}));

nodeTest("private temporary-key setup failure leaves no owned temporary key or lock", () => withDir((dir) => {
  const originalFsync = fs.fsyncSync;
  let calls = 0;
  patchFs("fsyncSync", (fd) => { if (++calls === 2) throw new Error("temp fsync failed"); return originalFsync(fd); }, () => {
    keyError(
      () => resolveLabRsaKeys({ PRACTICE_RELAY_LTI_KEYS_DIR: dir, PRACTICE_RELAY_LTI_GENERATE_RSA: "1" }),
      "ERR_LTI_KEYGEN_PUBLISH",
    );
  });
  assert.deepEqual(readdirSync(dir), []);
}));

nodeTest("second-link failure rolls back only owned finals and temporary files", () => withDir((dir) => {
  const originalLink = fs.linkSync;
  let calls = 0;
  patchFs("linkSync", (...args) => { if (++calls === 2) throw new Error("second link failed"); return originalLink(...args); }, () => {
    keyError(
      () => resolveLabRsaKeys({ PRACTICE_RELAY_LTI_KEYS_DIR: dir, PRACTICE_RELAY_LTI_GENERATE_RSA: "1" }),
      "ERR_LTI_KEYGEN_PUBLISH",
    );
  });
  assert.deepEqual(readdirSync(dir), []);
}));

nodeTest("inode-guarded rollback preserves a replaced private final", () => withDir((dir) => {
  const originalLink = fs.linkSync;
  let calls = 0;
  const privatePath = join(dir, "private.pem");
  patchFs("linkSync", (...args) => {
    if (++calls === 2) {
      fs.unlinkSync(privatePath);
      fs.writeFileSync(privatePath, "replacement", { mode: 0o600 });
      throw new Error("second link failed");
    }
    return originalLink(...args);
  }, () => {
    keyError(
      () => resolveLabRsaKeys({ PRACTICE_RELAY_LTI_KEYS_DIR: dir, PRACTICE_RELAY_LTI_GENERATE_RSA: "1" }),
      "ERR_LTI_KEYGEN_PUBLISH",
    );
  });
  assert.equal(readFileSync(privatePath, "utf8"), "replacement");
  assert.deepEqual(artifacts(dir), []);
}));

nodeTest("bounded reads reject a key that grows after secure open", () => withDir((dir) => {
  const pair = writePair(dir);
  const originalRead = fs.readSync;
  let grew = false;
  patchFs("readSync", (...args) => {
    if (!grew) {
      fs.appendFileSync(pair.privatePath, randomBytes(maxKeyBytes + 1));
      grew = true;
    }
    return originalRead(...args);
  }, () => {
    keyError(() => resolveLabRsaKeys({ PRACTICE_RELAY_LTI_KEYS_DIR: dir }), "ERR_LTI_KEYSTORE_TYPE");
  });
  assert.ok(grew);
}));

nodeTest("directory fsync failure after commit preserves a reloadable pair and cleans owned artifacts", () => withDir((dir) => {
  const originalFsync = fs.fsyncSync;
  const originalFstat = fs.fstatSync;
  patchFs("fsyncSync", (fd) => {
    if (originalFstat(fd).isDirectory()) throw new Error("directory fsync failed");
    return originalFsync(fd);
  }, () => {
    keyError(
      () => resolveLabRsaKeys({ PRACTICE_RELAY_LTI_KEYS_DIR: dir, PRACTICE_RELAY_LTI_GENERATE_RSA: "1" }),
      "ERR_LTI_KEYGEN_PUBLISH",
    );
  });
  assert.deepEqual(artifacts(dir), []);
  const reloaded = resolveLabRsaKeys({ PRACTICE_RELAY_LTI_KEYS_DIR: dir });
  assert.ok(reloaded?.privateKeyPem && reloaded.publicKeyPem);
}));

function assertOneShotUnlinkRetry(name, shouldFail) {
  nodeTest(`${name} unlink failure retries cleanup and leaves a reloadable pair`, () => withDir((dir) => {
    const originalUnlink = fs.unlinkSync;
    let failed = false;
    patchFs("unlinkSync", (filePath, ...args) => {
      if (!failed && shouldFail(filePath)) {
        failed = true;
        throw new Error(`${name} unlink failed once`);
      }
      return originalUnlink(filePath, ...args);
    }, () => {
      assert.ok(resolveLabRsaKeys({
        PRACTICE_RELAY_LTI_KEYS_DIR: dir,
        PRACTICE_RELAY_LTI_GENERATE_RSA: "1",
      }));
    });
    assert.ok(failed);
    assert.deepEqual(artifacts(dir), []);
    assert.ok(resolveLabRsaKeys({ PRACTICE_RELAY_LTI_KEYS_DIR: dir }));
  }));
}

function failTempUnlink(number) {
  let attempts = 0;
  return (filePath) => filePath.endsWith(".tmp") && ++attempts === number;
}

assertOneShotUnlinkRetry("private temporary key", failTempUnlink(1));
assertOneShotUnlinkRetry("public temporary key", failTempUnlink(2));

assertOneShotUnlinkRetry("generation lock", (filePath) => filePath.endsWith(".lock"));

nodeTest("persistent temporary cleanup failure reports publication failure and preserves finals", () => withDir((dir) => {
  const originalUnlink = fs.unlinkSync;
  patchFs("unlinkSync", (filePath, ...args) => {
    if (filePath.endsWith(".tmp")) throw new Error("persistent temporary cleanup failure");
    return originalUnlink(filePath, ...args);
  }, () => {
    keyError(
      () => resolveLabRsaKeys({ PRACTICE_RELAY_LTI_KEYS_DIR: dir, PRACTICE_RELAY_LTI_GENERATE_RSA: "1" }),
      "ERR_LTI_KEYGEN_PUBLISH",
    );
  });
  assert.ok(existsSync(join(dir, "private.pem")));
  assert.ok(existsSync(join(dir, "public.pem")));
  assert.ok(artifacts(dir).length > 0);
  for (const artifact of artifacts(dir)) rmSync(join(dir, artifact));
  assert.ok(resolveLabRsaKeys({ PRACTICE_RELAY_LTI_KEYS_DIR: dir }));
}));
