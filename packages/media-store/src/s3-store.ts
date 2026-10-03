/** Streaming SigV4 S3-compatible object storage. */
import { createHmac } from "node:crypto";
import { createReadStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { MediaObjectExistsError, type ObjectStorageAdapter, type S3CompatibleConfig } from "./types.js";
import { hmacSha256, sha256hexUtf8 } from "./hashing.js";
import { createFilesystemObjectStore, createMemoryObjectStore } from "./object-store.js";
import { assertSafeStorageKey } from "./media-safety.js";

const EMPTY_SHA256 = sha256hexUtf8("");

type SigningInput = {
  method: string;
  host: string;
  uri: string;
  headers: Record<string, string>;
  payloadHash: string;
};

function positive(value: number | undefined, fallback: number, name: string): number {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected < 1) throw new Error(`${name} must be a positive integer`);
  return selected;
}

function encodedKey(key: string): string {
  assertSafeStorageKey(key);
  return key.split("/").map((part) => encodeURIComponent(part).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`)).join("/");
}

function target(config: S3CompatibleConfig, key: string): { url: string; host: string; uri: string } {
  const endpoint = new URL(config.endpoint);
  const objectKey = encodedKey(key);
  if (config.forcePathStyle !== false) {
    const uri = `${endpoint.pathname.replace(/\/$/, "")}/${encodeURIComponent(config.bucket)}/${objectKey}`.replace(/\/+/g, "/");
    return { url: `${endpoint.protocol}//${endpoint.host}${uri}`, host: endpoint.host, uri };
  }
  const host = `${config.bucket}.${endpoint.host}`;
  return { url: `${endpoint.protocol}//${host}/${objectKey}`, host, uri: `/${objectKey}` };
}

function authorization(config: S3CompatibleConfig, input: SigningInput): string {
  const iso = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = iso.slice(0, 8);
  input.headers.host = input.host;
  input.headers["x-amz-date"] = iso;
  input.headers["x-amz-content-sha256"] = input.payloadHash;
  const names = Object.keys(input.headers).map((name) => name.toLowerCase()).sort();
  const canonicalHeaders = names.map((name) => `${name}:${input.headers[name]!.trim().replace(/\s+/g, " ")}\n`).join("");
  const canonical = [input.method, input.uri, "", canonicalHeaders, names.join(";"), input.payloadHash].join("\n");
  const scope = `${date}/${config.region ?? "us-east-1"}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", iso, scope, sha256hexUtf8(canonical)].join("\n");
  const kDate = hmacSha256(`AWS4${config.secretKey}`, date);
  const kRegion = hmacSha256(kDate, config.region ?? "us-east-1");
  const kService = hmacSha256(kRegion, "s3");
  const signature = createHmac("sha256", hmacSha256(kService, "aws4_request")).update(stringToSign).digest("hex");
  return `AWS4-HMAC-SHA256 Credential=${config.accessKey}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`;
}

function requestSignal(timeoutMs: number, parent?: AbortSignal): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("S3 request timed out")), timeoutMs);
  timer.unref();
  const abort = (): void => controller.abort(parent?.reason);
  if (parent?.aborted) abort();
  else parent?.addEventListener("abort", abort, { once: true });
  return { signal: controller.signal, clear: () => {
    clearTimeout(timer);
    parent?.removeEventListener("abort", abort);
  } };
}

/** Create an immutable SigV4 S3-compatible object adapter. */
export function createS3CompatibleObjectStore(config: S3CompatibleConfig): ObjectStorageAdapter {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) throw new Error("fetch is not available");
  const timeoutMs = positive(config.requestTimeoutMs, 120_000, "S3 request timeout");

  async function request(method: string, key: string, options: {
    bodyPath?: string; byteSize?: number; sha256?: string; contentType?: string; signal?: AbortSignal;
  } = {}): Promise<Response> {
    const location = target(config, key);
    const headers: Record<string, string> = {};
    if (options.bodyPath) {
      headers["content-length"] = String(options.byteSize);
      headers["content-type"] = options.contentType ?? "application/octet-stream";
      headers["if-none-match"] = "*";
    }
    headers.authorization = authorization(config, {
      method,
      host: location.host,
      uri: location.uri,
      headers,
      payloadHash: options.sha256 ?? EMPTY_SHA256,
    });
    const lifetime = requestSignal(timeoutMs, options.signal);
    try {
      const init: RequestInit & { duplex?: "half" } = {
        method, headers, signal: lifetime.signal, redirect: "error",
        body: options.bodyPath ? createReadStream(options.bodyPath) as unknown as RequestInit["body"] : undefined,
      };
      if (options.bodyPath) init.duplex = "half";
      const response = await fetchImpl(location.url, init);
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel().catch(() => undefined);
        lifetime.clear();
        throw new Error("S3 redirects are refused");
      }
      if (method === "GET" && response.body && response.ok) {
        const clear = lifetime.clear;
        const stream = Readable.fromWeb(response.body as never);
        stream.once("close", clear);
        stream.once("end", clear);
        stream.once("error", clear);
        return Object.assign(response, { __mediaStream: stream });
      }
      await response.body?.cancel().catch(() => undefined);
      lifetime.clear();
      return response;
    } catch (error) {
      lifetime.clear();
      throw error;
    }
  }

  return {
    backend: "s3",
    async putFile(key, filePath, options) {
      const response = await request("PUT", key, {
        bodyPath: filePath, byteSize: options.byteSize, sha256: options.sha256,
        contentType: options.contentType, signal: options.signal,
      });
      if (response.status === 412) throw new MediaObjectExistsError("immutable S3 object already exists");
      if (!response.ok) throw new Error(`S3 PUT failed: HTTP ${response.status}`);
    },
    async getStream(key, options) {
      const response = await request("GET", key, { signal: options?.signal });
      if (response.status === 404) return undefined;
      if (!response.ok) throw new Error(`S3 GET failed: HTTP ${response.status}`);
      return (response as Response & { __mediaStream: Readable }).__mediaStream;
    },
    async deleteObject(key) {
      const response = await request("DELETE", key);
      if (response.status === 404) return false;
      if (!response.ok) throw new Error(`S3 DELETE failed: HTTP ${response.status}`);
      return true;
    },
  };
}

/** Create a memory, filesystem, or S3 object adapter from environment settings. */
export function createObjectStoreFromEnv(env: NodeJS.ProcessEnv = process.env, options?: { fsRoot?: string; fetchImpl?: typeof fetch }): ObjectStorageAdapter {
  const mode = env.PRACTICE_RELAY_OBJECT_STORE?.trim().toLowerCase() || "fs";
  if (mode === "memory") return createMemoryObjectStore();
  if (mode === "s3") {
    const endpoint = env.PRACTICE_RELAY_S3_ENDPOINT?.trim();
    const bucket = env.PRACTICE_RELAY_S3_BUCKET?.trim();
    const accessKey = env.PRACTICE_RELAY_S3_ACCESS_KEY?.trim();
    const secretKey = env.PRACTICE_RELAY_S3_SECRET_KEY?.trim();
    if (!endpoint || !bucket || !accessKey || !secretKey) throw new Error("S3 media configuration is incomplete");
    return createS3CompatibleObjectStore({ endpoint, bucket, accessKey, secretKey,
      forcePathStyle: env.PRACTICE_RELAY_S3_FORCE_PATH_STYLE !== "0",
      region: env.PRACTICE_RELAY_S3_REGION?.trim() || "us-east-1", fetchImpl: options?.fetchImpl,
      requestTimeoutMs: env.PRACTICE_RELAY_S3_REQUEST_TIMEOUT_MS ? Number(env.PRACTICE_RELAY_S3_REQUEST_TIMEOUT_MS) : undefined });
  }
  if (mode !== "fs") throw new Error("invalid PRACTICE_RELAY_OBJECT_STORE");
  return createFilesystemObjectStore(options?.fsRoot ?? env.PRACTICE_RELAY_MEDIA?.trim() ?? path.join(process.cwd(), "data", "media"));
}
