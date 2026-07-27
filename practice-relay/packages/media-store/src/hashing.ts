/**
 * Hashing primitives for media checksums and S3 request signatures.
 *
 * Why: checksum and signature calculations must share the same deterministic implementation.
 */
import { createHash, createHmac } from "node:crypto";

/** Compute the lowercase SHA-256 checksum of a media payload. */
export function sha256hex(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Compute a SHA-256 HMAC digest for AWS SigV4 key derivation. */
export function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

/** Compute a SHA-256 checksum for canonical UTF-8 request text. */
export function sha256hexUtf8(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

