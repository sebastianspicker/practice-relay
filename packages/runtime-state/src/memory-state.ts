/** Single-process implementation of bounded login and single-use LTI state. */
import { randomUUID } from "node:crypto";
import type {
  PendingLtiLaunch,
  RegisterLtiLaunchOptions,
  RuntimeState,
  RuntimeStateOptions,
} from "./types.js";
import {
  DEFAULT_LTI_TTL_MS,
  DEFAULT_MAX_PENDING_LTI,
  MAX_TRACKED_LOGIN_KEYS,
  boundedInteger,
  loginBounds,
  resolveTenantId,
  validateLtiLaunch,
  validateState,
} from "./support.js";

type Failure = { count: number; resetAt: number };
type Attempt = { account: string; source: string; expiresAt: number; windowMs: number };

/** Create isolated runtime state for one process. */
export function createMemoryRuntimeState(options: RuntimeStateOptions = {}): RuntimeState {
  resolveTenantId(options.tenantId);
  const accountFailures = new Map<string, Failure>();
  const sourceFailures = new Map<string, Failure>();
  const attempts = new Map<string, Attempt>();
  const launches = new Map<string, PendingLtiLaunch>();

  const increment = (failures: Map<string, Failure>, key: string, now: number, windowMs: number): void => {
    const previous = failures.get(key);
    const current = previous && previous.resetAt > now ? previous : undefined;
    if (!current && failures.size >= MAX_TRACKED_LOGIN_KEYS) return;
    failures.set(key, {
      count: (current?.count ?? 0) + 1,
      resetAt: current?.resetAt ?? now + windowMs,
    });
  };
  const settleExpiredAttempts = (now: number): void => {
    for (const [id, attempt] of attempts) {
      if (attempt.expiresAt > now) continue;
      increment(accountFailures, attempt.account, now, attempt.windowMs);
      increment(sourceFailures, attempt.source, now, attempt.windowMs);
      attempts.delete(id);
    }
    for (const [key, failure] of accountFailures) if (failure.resetAt <= now) accountFailures.delete(key);
    for (const [key, failure] of sourceFailures) if (failure.resetAt <= now) sourceFailures.delete(key);
  };

  return {
    async beginLogin(input) {
      const bounds = loginBounds(input);
      const now = Date.now();
      settleExpiredAttempts(now);
      let activeAccount = 0;
      let activeSource = 0;
      const trackedAccounts = new Set(accountFailures.keys());
      const trackedSources = new Set(sourceFailures.keys());
      for (const attempt of attempts.values()) {
        if (attempt.account === bounds.account) activeAccount += 1;
        if (attempt.source === bounds.source) activeSource += 1;
        trackedAccounts.add(attempt.account);
        trackedSources.add(attempt.source);
      }
      const accountCount = accountFailures.get(bounds.account)?.count ?? 0;
      const sourceCount = sourceFailures.get(bounds.source)?.count ?? 0;
      if (
        (!trackedAccounts.has(bounds.account) && trackedAccounts.size >= MAX_TRACKED_LOGIN_KEYS) ||
        (!trackedSources.has(bounds.source) && trackedSources.size >= MAX_TRACKED_LOGIN_KEYS) ||
        accountCount + activeAccount >= bounds.accountLimit ||
        sourceCount + activeSource >= bounds.sourceLimit
      ) return undefined;
      const attemptId = randomUUID();
      attempts.set(attemptId, {
        account: bounds.account,
        source: bounds.source,
        expiresAt: now + bounds.windowMs,
        windowMs: bounds.windowMs,
      });
      return attemptId;
    },
    async finishLogin(attemptId, success) {
      const attempt = attempts.get(attemptId);
      if (!attempt) return;
      attempts.delete(attemptId);
      const now = Date.now();
      if (attempt.expiresAt <= now) {
        increment(accountFailures, attempt.account, now, attempt.windowMs);
        increment(sourceFailures, attempt.source, now, attempt.windowMs);
        return;
      }
      if (success === true) {
        accountFailures.delete(attempt.account);
      } else if (success === false) {
        increment(accountFailures, attempt.account, now, attempt.windowMs);
        increment(sourceFailures, attempt.source, now, attempt.windowMs);
      }
    },
    async registerLtiLaunch(state, input, options?: RegisterLtiLaunchOptions) {
      validateState(state);
      const launch = validateLtiLaunch(input);
      const now = options?.now ?? Date.now();
      const ttlMs = boundedInteger(options?.ttlMs, DEFAULT_LTI_TTL_MS, "ttlMs");
      const maxPending = boundedInteger(options?.maxPending, DEFAULT_MAX_PENDING_LTI, "maxPending");
      for (const [key, pending] of launches) if (pending.expiresAt <= now) launches.delete(key);
      if (!launches.has(state)) {
        while (launches.size >= maxPending) {
          const oldest = launches.keys().next().value as string | undefined;
          if (oldest === undefined) break;
          launches.delete(oldest);
        }
      }
      const pending = { ...launch, expiresAt: now + ttlMs };
      launches.delete(state);
      launches.set(state, pending);
      return structuredClone(pending);
    },
    async consumeLtiLaunch(state, now = Date.now()) {
      validateState(state);
      const pending = launches.get(state);
      launches.delete(state);
      if (!pending || pending.expiresAt <= now) return undefined;
      return structuredClone(pending);
    },
    async checkHealth() {},
    async close() {},
  };
}
