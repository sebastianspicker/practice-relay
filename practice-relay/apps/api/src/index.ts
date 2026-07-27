/**
 * Stable public entrypoint for the Practice Relay HTTP API.
 * Why: consumers keep one import surface while focused modules own behavior.
 */
import { realpathSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { MediaStoreAdapter } from "@practice-relay/media-store";
import {
  renderPrometheusMetricsText,
  resetRequestMetrics,
} from "./api-metrics.ts";
import { logRequestLine as writeLogRequestLine } from "./api-observability.ts";
import { handleRequestWithRuntime } from "./router.ts";
import {
  defaultRuntime,
  type ApiRecordStore,
} from "./runtime.ts";
import { durableStore } from "./record-service.ts";

/** Maximum time allowed to receive request headers on an API connection. */
export const API_HEADERS_TIMEOUT_MS = 15_000;

/** Maximum time allowed to receive an API request, including upload bodies. */
export const API_REQUEST_TIMEOUT_MS = 120_000;

/** Idle keep-alive window after a response completes. */
export const API_KEEP_ALIVE_TIMEOUT_MS = 5_000;

/** Host and port selected for a directly started local API process. */
export type ApiListenOptions = {
  host: string;
  port: number;
};

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

/** Resolve a loopback-safe listener unless strict deployment settings are explicit. */
export function resolveApiListenOptions(
  env: NodeJS.ProcessEnv = process.env,
): ApiListenOptions {
  const host = env.PRACTICE_RELAY_HOST?.trim() || "127.0.0.1";
  const port = Number(env.PORT?.trim() || "8787");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer from 1 to 65535");
  }
  if (
    !LOOPBACK_HOSTS.has(host) &&
    (env.PRACTICE_RELAY_REQUIRE_SECRETS !== "1" ||
      env.PRACTICE_RELAY_REQUIRE_CONFIGURED_AUTH_USERS !== "1")
  ) {
    throw new Error(
      "non-loopback PRACTICE_RELAY_HOST requires strict secrets and configured auth users",
    );
  }
  return { host, port };
}

/** Require an explicit safe configuration before directly starting the API process. */
export function assertDirectRuntimeIdentity(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const strictIdentity =
    env.PRACTICE_RELAY_REQUIRE_SECRETS === "1" &&
    env.PRACTICE_RELAY_REQUIRE_CONFIGURED_AUTH_USERS === "1";
  if (!strictIdentity && env.PRACTICE_RELAY_ALLOW_SYNTHETIC_AUTH !== "1") {
    throw new Error(
      "direct API runtime requires strict configured authentication or PRACTICE_RELAY_ALLOW_SYNTHETIC_AUTH=1",
    );
  }
}

/** Render the current process metrics using the live replaceable record store. */
export function renderPrometheusMetrics(opts?: {
  recordCount?: number;
  mediaBytes?: number;
  auditEvents?: number;
}): string {
  const durable = durableStore(defaultRuntime);
  return renderPrometheusMetricsText({
    recordCount: opts?.recordCount ?? defaultRuntime.recordStore.list().length,
    mediaBytes: opts?.mediaBytes ?? 0,
    auditEvents:
      opts?.auditEvents ?? durable?.listAllEvents().length ?? 0,
  });
}

/** Reset the process request metrics for deterministic tests. */
export function __resetMetricsForTests(): void {
  resetRequestMetrics();
}

/** Write one structured JSON-lines request log event. */
export function logRequestLine(entry: Record<string, unknown>): void {
  writeLogRequestLine(entry);
}

/** Replace the live record adapter used by existing and future servers. */
export function __setStoreForTests(next: ApiRecordStore): void {
  defaultRuntime.recordStore = next;
}

/** Replace the live media adapter used by existing and future servers. */
export function __setMediaStoreForTests(next: MediaStoreAdapter): void {
  defaultRuntime.mediaStore = next;
}

/** Handle one request through the default process runtime. */
export async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  await handleRequestWithRuntime(defaultRuntime, req, res);
}

/** Create the stable Node HTTP server backed by the default runtime. */
export function createAppServer() {
  const server = createServer((req, res) => {
    void handleRequest(req, res);
  });
  server.headersTimeout = API_HEADERS_TIMEOUT_MS;
  server.requestTimeout = API_REQUEST_TIMEOUT_MS;
  server.keepAliveTimeout = API_KEEP_ALIVE_TIMEOUT_MS;
  return server;
}

function isDirectRun(): boolean {
  if (!process.argv[1]) return false;
  try {
    const entry = realpathSync(path.resolve(process.argv[1]));
    const self = realpathSync(fileURLToPath(import.meta.url));
    return entry === self;
  } catch {
    return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  }
}

if (isDirectRun()) {
  const { host, port } = resolveApiListenOptions();
  assertDirectRuntimeIdentity();
  createAppServer().listen(port, host, () => {
    console.log(`Practice Relay API listening on http://${host}:${port}`);
  });
}
