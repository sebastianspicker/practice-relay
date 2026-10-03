/** Validation and default-policy helpers shared by runtime-state adapters. */
import type { BeginLoginOptions, PendingLtiLaunch } from "./types.js";

export const DEFAULT_LOGIN_LIMIT = 5;
export const DEFAULT_SOURCE_LIMIT = 100;
export const DEFAULT_WINDOW_MS = 5 * 60 * 1000;
export const DEFAULT_LTI_TTL_MS = 5 * 60 * 1000;
export const DEFAULT_MAX_PENDING_LTI = 1024;
export const MAX_TRACKED_LOGIN_KEYS = 10_000;

/** Resolve a safe positive bounded integer option. */
export function boundedInteger(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > 1_000_000) {
    throw new Error(`${name} must be an integer between 1 and 1000000`);
  }
  return resolved;
}

/** Validate an exact account admission key without aliasing configured identities. */
export function canonicalAccount(value: string): string {
  if (value.length > 256 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error("invalid login account key");
  }
  return value;
}

/** Normalize and validate a network-source admission key. */
export function canonicalSource(value: string): string {
  const canonical = value.trim();
  if (canonical.length > 256 || /[\u0000-\u001f\u007f]/u.test(canonical)) {
    throw new Error("invalid login source key");
  }
  return canonical;
}

/** Validate login admission inputs and fill policy defaults. */
export function loginBounds(options: BeginLoginOptions): {
  account: string; source: string; accountLimit: number; sourceLimit: number; windowMs: number;
} {
  return {
    account: canonicalAccount(options.account),
    source: canonicalSource(options.source),
    accountLimit: boundedInteger(options.accountLimit, DEFAULT_LOGIN_LIMIT, "accountLimit"),
    sourceLimit: boundedInteger(options.sourceLimit, DEFAULT_SOURCE_LIMIT, "sourceLimit"),
    windowMs: boundedInteger(options.windowMs, DEFAULT_WINDOW_MS, "windowMs"),
  };
}

/** Validate and detach the string-only pending LTI launch payload. */
export function validateLtiLaunch(
  launch: Omit<PendingLtiLaunch, "expiresAt">,
): Omit<PendingLtiLaunch, "expiresAt"> {
  for (const [name, value] of Object.entries(launch)) {
    if (typeof value !== "string" || value === "" || value.length > 4096) {
      throw new Error(`invalid LTI launch ${name}`);
    }
  }
  return structuredClone(launch);
}

/** Validate an opaque LTI state key before persistence. */
export function validateState(state: string): string {
  if (state === "" || state.length > 4096 || /[\u0000-\u001f\u007f]/u.test(state)) {
    throw new Error("invalid LTI state");
  }
  return state;
}

/** Resolve and validate the database tenant namespace. */
export function resolveTenantId(value: string | undefined): string {
  const tenant = value ?? "default";
  if (tenant.length < 1 || tenant.length > 128 || /[\u0000-\u001f\u007f]/u.test(tenant)) {
    throw new Error("invalid database tenant id");
  }
  return tenant;
}
