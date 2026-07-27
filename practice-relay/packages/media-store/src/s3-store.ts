/**
 * SigV4 S3-compatible object-store adapter and environment factory.
 *
 * Why: S3 signing and delete semantics remain isolated from media lifecycle logic.
 */
import { createHmac } from "node:crypto";
import path from "node:path";
import type { ObjectStorageAdapter, S3CompatibleConfig } from "./types.js";
import { hmacSha256, sha256hex, sha256hexUtf8 } from "./hashing.js";
import { createFilesystemObjectStore, createMemoryObjectStore } from "./object-store.js";

function amzDate(d = new Date()): { amz: string; date: string } {
  const iso = d.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amz: iso, date: iso.slice(0, 8) };
}

function encodeS3Key(key: string): string {
  return key
    .split("/")
    .map((seg) => encodeURIComponent(seg).replace(/[!'()*]/g, (c) =>
      `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
    ))
    .join("/");
}

function s3ObjectUrl(
  config: S3CompatibleConfig,
  key: string,
): { url: string; host: string; canonicalUri: string } {
  const endpoint = config.endpoint.replace(/\/$/, "");
  const parsed = new URL(endpoint);
  const host = parsed.host;
  const forcePath = config.forcePathStyle !== false; // default path-style for MinIO
  const encKey = encodeS3Key(key);
  if (forcePath) {
    const basePath = parsed.pathname.replace(/\/$/, "");
    const canonicalUri = `${basePath}/${config.bucket}/${encKey}`.replace(
      /\/+/g,
      "/",
    );
    return {
      url: `${parsed.protocol}//${host}${canonicalUri}`,
      host,
      canonicalUri: canonicalUri.startsWith("/")
        ? canonicalUri
        : `/${canonicalUri}`,
    };
  }
  // virtual-hosted-style
  const vhHost = `${config.bucket}.${host}`;
  const canonicalUri = `/${encKey}`;
  return {
    url: `${parsed.protocol}//${vhHost}${canonicalUri}`,
    host: vhHost,
    canonicalUri,
  };
}

function signS3Request(opts: {
  method: string;
  config: S3CompatibleConfig;
  host: string;
  canonicalUri: string;
  headers: Record<string, string>;
  payloadHash: string;
}): string {
  const region = opts.config.region || "us-east-1";
  const service = "s3";
  const { amz, date } = amzDate();
  opts.headers["x-amz-date"] = amz;
  opts.headers["x-amz-content-sha256"] = opts.payloadHash;
  opts.headers.host = opts.host;

  const signedHeaderKeys = Object.keys(opts.headers)
    .map((k) => k.toLowerCase())
    .sort();
  const signedHeaders = signedHeaderKeys.join(";");
  const canonicalHeaders = signedHeaderKeys
    .map((k) => {
      const raw = opts.headers[
        Object.keys(opts.headers).find((h) => h.toLowerCase() === k)!
      ]!;
      return `${k}:${String(raw).trim().replace(/\s+/g, " ")}\n`;
    })
    .join("");

  const canonicalRequest = [
    opts.method,
    opts.canonicalUri,
    "", // query string
    canonicalHeaders,
    signedHeaders,
    opts.payloadHash,
  ].join("\n");

  const credentialScope = `${date}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amz,
    credentialScope,
    sha256hexUtf8(canonicalRequest),
  ].join("\n");

  const kDate = hmacSha256(`AWS4${opts.config.secretKey}`, date);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  const kSigning = hmacSha256(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning)
    .update(stringToSign, "utf8")
    .digest("hex");

  return (
    `AWS4-HMAC-SHA256 Credential=${opts.config.accessKey}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`
  );
}

/**
 * Fetch-based S3-compatible object store (MinIO / Garage / AWS).
 * Network not required in unit tests - inject `fetchImpl` or use memory backend.
 */
export function createS3CompatibleObjectStore(
  config: S3CompatibleConfig,
): ObjectStorageAdapter {
  const fetchFn = config.fetchImpl ?? globalThis.fetch;
  if (!fetchFn) {
    throw new Error("fetch is not available; inject fetchImpl or use memory/fs store");
  }

  async function request(
    method: string,
    key: string,
    body?: Buffer,
    contentType?: string,
  ): Promise<{ status: number; body: Buffer }> {
    const { url, host, canonicalUri } = s3ObjectUrl(config, key);
    const payload = body ?? Buffer.alloc(0);
    const payloadHash = sha256hex(payload);
    const headers: Record<string, string> = {};
    if (contentType) headers["content-type"] = contentType;
    if (body) headers["content-length"] = String(body.byteLength);

    const authorization = signS3Request({
      method,
      config,
      host,
      canonicalUri,
      headers,
      payloadHash,
    });
    headers.authorization = authorization;

    const res = await fetchFn(url, {
      method,
      headers,
      body: body && method !== "GET" && method !== "HEAD" ? new Uint8Array(body) : undefined,
    });
    const ab = await res.arrayBuffer();
    return { status: res.status, body: Buffer.from(ab) };
  }

  return {
    backend: "s3",
    async putObject(key, bytes, opts) {
      const r = await request(
        "PUT",
        key,
        bytes,
        opts?.contentType ?? "application/octet-stream",
      );
      if (r.status < 200 || r.status >= 300) {
        throw new Error(`S3 putObject failed: HTTP ${r.status}`);
      }
    },
    async getObject(key) {
      const r = await request("GET", key);
      if (r.status === 404) return undefined;
      if (r.status < 200 || r.status >= 300) {
        throw new Error(`S3 getObject failed: HTTP ${r.status}`);
      }
      return r.body;
    },
    async deleteObject(key) {
      const r = await request("DELETE", key);
      if (r.status === 404) return false;
      if (r.status < 200 || r.status >= 300) {
        throw new Error(`S3 deleteObject failed: HTTP ${r.status}`);
      }
      return true;
    },
  };
}

/**
 * Factory from env: PRACTICE_RELAY_OBJECT_STORE=memory|fs|s3
 *
 * S3 env: PRACTICE_RELAY_S3_ENDPOINT, PRACTICE_RELAY_S3_BUCKET,
 * PRACTICE_RELAY_S3_ACCESS_KEY, PRACTICE_RELAY_S3_SECRET_KEY,
 * PRACTICE_RELAY_S3_FORCE_PATH_STYLE=1 (default), PRACTICE_RELAY_S3_REGION
 */
export function createObjectStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  opts?: { fsRoot?: string; fetchImpl?: typeof fetch },
): ObjectStorageAdapter {
  const mode = (env.PRACTICE_RELAY_OBJECT_STORE?.trim().toLowerCase() || "fs") as string;
  if (mode === "memory") return createMemoryObjectStore();
  if (mode === "s3") {
    const endpoint = env.PRACTICE_RELAY_S3_ENDPOINT?.trim();
    const bucket = env.PRACTICE_RELAY_S3_BUCKET?.trim();
    const accessKey = env.PRACTICE_RELAY_S3_ACCESS_KEY?.trim();
    const secretKey = env.PRACTICE_RELAY_S3_SECRET_KEY?.trim();
    if (!endpoint || !bucket || !accessKey || !secretKey) {
      throw new Error(
        "PRACTICE_RELAY_OBJECT_STORE=s3 requires PRACTICE_RELAY_S3_ENDPOINT, BUCKET, ACCESS_KEY, SECRET_KEY",
      );
    }
    return createS3CompatibleObjectStore({
      endpoint,
      bucket,
      accessKey,
      secretKey,
      forcePathStyle: env.PRACTICE_RELAY_S3_FORCE_PATH_STYLE !== "0",
      region: env.PRACTICE_RELAY_S3_REGION?.trim() || "us-east-1",
      fetchImpl: opts?.fetchImpl,
    });
  }
  // fs default
  const root =
    opts?.fsRoot ||
    env.PRACTICE_RELAY_MEDIA?.trim() ||
    path.join(process.cwd(), "data", "media");
  return createFilesystemObjectStore(root);
}

