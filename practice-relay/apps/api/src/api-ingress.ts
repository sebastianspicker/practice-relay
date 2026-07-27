/**
 * Browser and Host ingress policy for the Practice Relay API.
 * Why: the lab API must not expose authenticated routes to arbitrary browser origins.
 */
import type { IncomingMessage } from "node:http";

/** Exact origin and Host names accepted by the API ingress boundary. */
export type ApiIngressPolicy = {
  allowedOrigins: ReadonlySet<string>;
  allowedHosts: ReadonlySet<string>;
};

/** Result of checking browser and Host metadata before routing a request. */
export type IngressDecision =
  | { allowed: true; allowedOrigin?: string }
  | { allowed: false; status: 403 | 421; detail: string };

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "[::1]", "localhost"]);

function csvValues(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizedOrigin(value: string): string {
  const origin = new URL(value).origin;
  if (origin === "null" || origin !== value) {
    throw new Error("PRACTICE_RELAY_ALLOWED_ORIGINS must contain exact origins");
  }
  return origin;
}

function normalizedHost(value: string): string {
  const candidate = value.toLowerCase();
  const parsed = new URL(`http://${candidate}`);
  if (
    parsed.host !== candidate ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/"
  ) {
    throw new Error("PRACTICE_RELAY_ALLOWED_HOSTS must contain exact Host values");
  }
  return candidate;
}

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0];
  return value?.trim() || undefined;
}

function loopbackHost(host: string): boolean {
  try {
    return LOOPBACK_HOSTNAMES.has(new URL(`http://${host}`).hostname);
  } catch {
    return false;
  }
}

/** Resolve explicit browser origins and additional Host names from environment. */
export function resolveApiIngressPolicy(
  env: NodeJS.ProcessEnv = process.env,
): ApiIngressPolicy {
  return {
    allowedOrigins: new Set(
      csvValues(env.PRACTICE_RELAY_ALLOWED_ORIGINS).map(normalizedOrigin),
    ),
    allowedHosts: new Set(
      csvValues(env.PRACTICE_RELAY_ALLOWED_HOSTS).map(normalizedHost),
    ),
  };
}

/** Reject untrusted Host or Origin metadata before a route reads credentials or a body. */
export function checkApiIngress(
  req: IncomingMessage,
  policy: ApiIngressPolicy,
): IngressDecision {
  const host = headerValue(req, "host")?.toLowerCase();
  if (host && !loopbackHost(host) && !policy.allowedHosts.has(host)) {
    return { allowed: false, status: 421, detail: "untrusted Host header" };
  }

  const origin = headerValue(req, "origin");
  if (!origin) return { allowed: true };
  if (!policy.allowedOrigins.has(origin)) {
    return { allowed: false, status: 403, detail: "untrusted Origin header" };
  }
  return { allowed: true, allowedOrigin: origin };
}
