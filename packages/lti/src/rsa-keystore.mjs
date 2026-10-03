/** Filesystem-backed RSA keys for the local LTI lab boundary. */
import { Buffer } from "node:buffer";
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomUUID,
} from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { LTI_LAB_KID } from "./assignment.mjs";

const LAB_KEY_MAX_BYTES = 64 * 1024;
const PRIVATE_NAME = "private.pem";
const PUBLIC_NAME = "public.pem";
const LOCK_NAME = ".practice-relay-lti-keys.lock";
const NOFOLLOW = fsConstants.O_NOFOLLOW ?? 0;

function keyError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function typeError(message) {
  throw keyError("ERR_LTI_KEYSTORE_TYPE", message);
}

function permissionsError(message) {
  throw keyError("ERR_LTI_KEYSTORE_PERMISSIONS", message);
}

function lstatOrMissing(filePath) {
  try {
    return lstatSync(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    typeError(`Unable to inspect LTI key path: ${filePath}`);
  }
}

function sameFile(left, right) {
  return left && right && left.dev === right.dev && left.ino === right.ino;
}

function closeQuietly(descriptor) {
  if (descriptor === undefined) return true;
  try {
    closeSync(descriptor);
    return true;
  } catch {
    return false;
  }
}

function unlinkOwned(file) {
  if (!file) return "missing";
  try {
    const current = lstatSync(file.path);
    if (!sameFile(current, file.stat)) return "replaced";
    unlinkSync(file.path);
    return "removed";
  } catch (error) {
    return error?.code === "ENOENT" ? "missing" : "failure";
  }
}

function retryOwnedCleanup(file) {
  const first = unlinkOwned(file);
  return first === "failure" ? unlinkOwned(file) : first;
}

function cleanupTemps(privateTemp, publicTemp) {
  const privateResult = retryOwnedCleanup(privateTemp);
  const publicResult = retryOwnedCleanup(publicTemp);
  return {
    privateTemp: ["removed", "missing"].includes(privateResult) ? null : privateTemp,
    publicTemp: ["removed", "missing"].includes(publicResult) ? null : publicTemp,
    failed: privateResult === "failure" || publicResult === "failure",
  };
}

function openOwned(filePath, flags, mode) {
  const descriptor = openSync(filePath, flags, mode);
  let pathStat;
  try {
    pathStat = lstatSync(filePath);
    const descriptorStat = fstatSync(descriptor);
    if (!sameFile(pathStat, descriptorStat)) {
      throw new Error("opened LTI key path changed before ownership capture");
    }
    return { path: filePath, stat: pathStat, descriptor };
  } catch (error) {
    closeQuietly(descriptor);
    retryOwnedCleanup(pathStat ? { path: filePath, stat: pathStat } : null);
    throw error;
  }
}

function assertDirectory(keysDir, generate) {
  let stat = lstatOrMissing(keysDir);
  if (!stat) {
    if (!generate) return false;
    try {
      mkdirSync(keysDir, { recursive: true, mode: 0o700 });
    } catch {
      typeError(`Unable to create LTI key directory: ${keysDir}`);
    }
    stat = lstatOrMissing(keysDir);
  }
  if (!stat?.isDirectory() || stat.isSymbolicLink()) {
    typeError("LTI key directory must be a real directory");
  }
  if ((stat.mode & 0o022) !== 0) {
    permissionsError("LTI key directory must not be group or other writable");
  }
  return true;
}

function inspectPair(keysDir) {
  const privatePath = path.join(keysDir, PRIVATE_NAME);
  const publicPath = path.join(keysDir, PUBLIC_NAME);
  const privateStat = lstatOrMissing(privatePath);
  const publicStat = lstatOrMissing(publicPath);
  if (!privateStat && !publicStat) return { state: "empty", privatePath, publicPath };
  if (!privateStat || !publicStat) {
    throw keyError("ERR_LTI_KEY_PARTIAL", "LTI key directory has a partial key pair");
  }
  return { state: "complete", privatePath, publicPath, privateStat, publicStat };
}

function assertKeyFile(stat, name, isPrivate) {
  if (stat.isSymbolicLink() || !stat.isFile()) {
    typeError(`LTI ${name} key must be a regular file`);
  }
  if (stat.size > LAB_KEY_MAX_BYTES) typeError(`LTI ${name} key exceeds the maximum size`);
  if (isPrivate && (stat.nlink !== 1 || (stat.mode & 0o077) !== 0)) {
    permissionsError("LTI private key must have one link and no group/other permissions");
  }
  if (!isPrivate && (stat.mode & 0o022) !== 0) {
    permissionsError("LTI public key must not be group or other writable");
  }
}

function readBounded(descriptor, before, name) {
  const bytes = Buffer.alloc(LAB_KEY_MAX_BYTES + 1);
  let total = 0;
  while (total < bytes.length) {
    const count = readSync(descriptor, bytes, total, bytes.length - total, null);
    if (count === 0) break;
    total += count;
  }
  const after = fstatSync(descriptor);
  if (
    total > LAB_KEY_MAX_BYTES ||
    after.size > LAB_KEY_MAX_BYTES ||
    !sameFile(before, after)
  ) {
    typeError(`LTI ${name} key changed or exceeded the maximum size while being read`);
  }
  return bytes.subarray(0, total).toString("utf8");
}

function loadKey(filePath, name, isPrivate, expectedStat) {
  assertKeyFile(expectedStat, name, isPrivate);
  let descriptor;
  try {
    descriptor = openSync(
      filePath,
      fsConstants.O_RDONLY | NOFOLLOW | fsConstants.O_NONBLOCK,
    );
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || !sameFile(expectedStat, opened)) {
      typeError(`LTI ${name} key changed while it was being read`);
    }
    assertKeyFile(opened, name, isPrivate);
    return readBounded(descriptor, opened, name);
  } catch (error) {
    if (error?.code?.startsWith("ERR_LTI_")) throw error;
    typeError(`Unable to safely read LTI ${name} key`);
  } finally {
    closeQuietly(descriptor);
  }
}

function assertPair(privateKeyPem, publicKeyPem) {
  if (publicKeyPem.split("\n").some((line) => {
    const header = line.trimEnd();
    return header.startsWith("-----BEGIN ") && header.endsWith(" PRIVATE KEY-----");
  })) {
    throw keyError("ERR_LTI_KEYPAIR", "LTI public key must not contain private PEM material");
  }
  let privateKey;
  let publicKey;
  try {
    privateKey = createPrivateKey(privateKeyPem);
    publicKey = createPublicKey(publicKeyPem);
  } catch {
    throw keyError("ERR_LTI_KEYPAIR", "LTI key pair PEM is invalid");
  }
  const privateBits = privateKey.asymmetricKeyDetails?.modulusLength;
  const publicBits = publicKey.asymmetricKeyDetails?.modulusLength;
  if (
    privateKey.asymmetricKeyType !== "rsa" ||
    publicKey.asymmetricKeyType !== "rsa" ||
    !Number.isInteger(privateBits) ||
    !Number.isInteger(publicBits) ||
    privateBits < 2048 ||
    publicBits < 2048
  ) {
    throw keyError("ERR_LTI_KEYPAIR", "LTI key pair must use RSA with a modulus of at least 2048 bits");
  }
  const derived = createPublicKey(privateKey).export({ format: "jwk" });
  const supplied = publicKey.export({ format: "jwk" });
  if (derived.kty !== "RSA" || derived.n !== supplied.n || derived.e !== supplied.e) {
    throw keyError("ERR_LTI_KEYPAIR", "LTI private and public keys do not match");
  }
}

function loadPair(files) {
  const privateKeyPem = loadKey(files.privatePath, "private", true, files.privateStat);
  const publicKeyPem = loadKey(files.publicPath, "public", false, files.publicStat);
  assertPair(privateKeyPem, publicKeyPem);
  return { privateKeyPem, publicKeyPem };
}

function writeTemp(keysDir, mode, contents) {
  const tempPath = path.join(keysDir, `.practice-relay-lti-${randomUUID()}.tmp`);
  let owned;
  try {
    owned = openOwned(
      tempPath,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | NOFOLLOW,
      mode,
    );
    fchmodSync(owned.descriptor, mode);
    writeFileSync(owned.descriptor, contents, "utf8");
    fsyncSync(owned.descriptor);
    const finished = fstatSync(owned.descriptor);
    if (!sameFile(owned.stat, finished)) throw new Error("temporary LTI key changed");
    closeSync(owned.descriptor);
    return { path: owned.path, stat: finished };
  } catch (error) {
    closeQuietly(owned?.descriptor);
    retryOwnedCleanup(owned);
    throw error;
  }
}

function acquireLock(keysDir) {
  const lockPath = path.join(keysDir, LOCK_NAME);
  let lock;
  try {
    lock = openOwned(
      lockPath,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | NOFOLLOW,
      0o600,
    );
    fchmodSync(lock.descriptor, 0o600);
    fsyncSync(lock.descriptor);
    return lock;
  } catch (error) {
    closeQuietly(lock?.descriptor);
    retryOwnedCleanup(lock);
    if (error?.code === "EEXIST") {
      throw keyError("ERR_LTI_KEYGEN_BUSY", "LTI key generation is already in progress");
    }
    throw keyError("ERR_LTI_KEYGEN_PUBLISH", "Unable to create LTI key generation lock");
  }
}

function releaseLock(lock) {
  if (!lock) return false;
  const closed = closeQuietly(lock.descriptor);
  const cleanup = retryOwnedCleanup(lock);
  return !closed || cleanup === "failure";
}

function syncDirectory(keysDir) {
  let descriptor;
  try {
    descriptor = openSync(keysDir, fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0));
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function publishPair(keysDir, pair) {
  let privateTemp;
  let publicTemp;
  let privateFinal;
  let publicFinal;
  let committed = false;
  try {
    privateTemp = writeTemp(keysDir, 0o600, pair.privateKey);
    publicTemp = writeTemp(keysDir, 0o644, pair.publicKey);
    privateFinal = { path: path.join(keysDir, PRIVATE_NAME), stat: privateTemp.stat };
    publicFinal = { path: path.join(keysDir, PUBLIC_NAME), stat: publicTemp.stat };
    linkSync(privateTemp.path, privateFinal.path);
    linkSync(publicTemp.path, publicFinal.path);
    committed = true;
    syncDirectory(keysDir);
    ({ privateTemp, publicTemp } = cleanupTemps(privateTemp, publicTemp));
    if (privateTemp || publicTemp) {
      const cleanup = cleanupTemps(privateTemp, publicTemp);
      ({ privateTemp, publicTemp } = cleanup);
      if (cleanup.failed) throw new Error("unable to remove LTI key temporary files");
    }
    syncDirectory(keysDir);
  } catch {
    if (!committed) {
      retryOwnedCleanup(privateFinal);
      retryOwnedCleanup(publicFinal);
    }
    const cleanup = cleanupTemps(privateTemp, publicTemp);
    privateTemp = cleanup.privateTemp;
    publicTemp = cleanup.publicTemp;
    throw keyError("ERR_LTI_KEYGEN_PUBLISH", "Unable to publish generated LTI key pair");
  }
}

/** Optional RSA keypair for demos that need asymmetric shape. */
export function generateLabPlatformKeys() {
  return generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

/** Resolve validated inline or filesystem-backed LTI RSA keys. */
export function resolveLabRsaKeys(env = process.env) {
  const kid = env.PRACTICE_RELAY_LTI_KID?.trim() || LTI_LAB_KID;
  const privateKeyPem = env.PRACTICE_RELAY_LTI_RSA_PRIVATE?.trim();
  const publicKeyPem = env.PRACTICE_RELAY_LTI_RSA_PUBLIC?.trim();
  if (Boolean(privateKeyPem) !== Boolean(publicKeyPem)) {
    throw keyError("ERR_LTI_KEY_CONFIG", "LTI RSA private and public keys must be configured together");
  }
  if (privateKeyPem && publicKeyPem) {
    assertPair(privateKeyPem, publicKeyPem);
    return { privateKeyPem, publicKeyPem, kid };
  }
  const keysDir = env.PRACTICE_RELAY_LTI_KEYS_DIR?.trim();
  if (!keysDir) return null;
  const generate = env.PRACTICE_RELAY_LTI_GENERATE_RSA === "1";
  if (!assertDirectory(keysDir, generate)) return null;
  const files = inspectPair(keysDir);
  if (files.state === "complete") return { ...loadPair(files), kid };
  if (!generate) return null;
  const lock = acquireLock(keysDir);
  let resolved;
  let primaryError;
  try {
    const lockedFiles = inspectPair(keysDir);
    if (lockedFiles.state === "complete") {
      resolved = { ...loadPair(lockedFiles), kid };
    } else {
      const pair = generateLabPlatformKeys();
      assertPair(pair.privateKey, pair.publicKey);
      publishPair(keysDir, pair);
      resolved = { privateKeyPem: pair.privateKey, publicKeyPem: pair.publicKey, kid };
    }
  } catch (error) {
    primaryError = error;
  }
  const releaseFailed = releaseLock(lock);
  if (primaryError) throw primaryError;
  if (releaseFailed) {
    throw keyError("ERR_LTI_KEYGEN_PUBLISH", "Unable to release LTI key generation lock");
  }
  return resolved;
}
