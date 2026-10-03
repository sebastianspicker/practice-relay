/** PostgreSQL-backed admission and single-use state for multi-process runtimes. */
import { randomUUID } from "node:crypto";
import type { Database } from "@practice-relay/database";
import { requireRuntimeStateMigrations } from "./migrations.js";
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
import type { PendingLtiLaunch, RuntimeState, RuntimeStateOptions } from "./types.js";

/** Shared database and tenant binding for multi-process runtime state. */
export interface PostgresRuntimeStateOptions extends RuntimeStateOptions {
  readonly database: Database;
}

type AttemptRow = {
  attempt_id: string;
  account_key: string;
  source_key: string;
  expires_at: Date | string;
  window_ms: number;
};

async function lockTenant(tx: Database, tenant: string): Promise<void> {
  await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `practice-relay:runtime-state:${tenant}`,
  ]);
}

async function incrementFailure(
  tx: Database,
  input: {
    tenant: string;
    scope: "account" | "source";
    key: string;
    now: number;
    windowMs: number;
  },
): Promise<void> {
  await tx.query(
    `INSERT INTO practice_relay_login_failures
       (tenant_id, failure_scope, failure_key, failure_count, reset_at)
     VALUES ($1, $2, $3, 1, to_timestamp($4 / 1000.0) + ($5 * interval '1 millisecond'))
     ON CONFLICT (tenant_id, failure_scope, failure_key) DO UPDATE SET
       failure_count = CASE
         WHEN practice_relay_login_failures.reset_at <= to_timestamp($4 / 1000.0) THEN 1
         ELSE practice_relay_login_failures.failure_count + 1
       END,
       reset_at = CASE
         WHEN practice_relay_login_failures.reset_at <= to_timestamp($4 / 1000.0)
           THEN to_timestamp($4 / 1000.0) + ($5 * interval '1 millisecond')
         ELSE practice_relay_login_failures.reset_at
       END`,
    [input.tenant, input.scope, input.key, input.now, input.windowMs],
  );
}

async function settleExpiredAttempts(tx: Database, tenant: string, now: number): Promise<void> {
  const expired = await tx.query<AttemptRow>(
    `DELETE FROM practice_relay_login_attempts
     WHERE tenant_id = $1 AND expires_at <= to_timestamp($2 / 1000.0)
     RETURNING attempt_id, account_key, source_key, expires_at, window_ms`,
    [tenant, now],
  );
  for (const attempt of expired.rows) {
    await incrementFailure(tx, { tenant, scope: "account", key: attempt.account_key, now, windowMs: attempt.window_ms });
    await incrementFailure(tx, { tenant, scope: "source", key: attempt.source_key, now, windowMs: attempt.window_ms });
  }
  await tx.query(
    `DELETE FROM practice_relay_login_failures
     WHERE tenant_id = $1 AND reset_at <= to_timestamp($2 / 1000.0)`,
    [tenant, now],
  );
}

function parseLaunch(value: unknown, expiresAt: Date | string): PendingLtiLaunch {
  if (!value || typeof value !== "object") throw new Error("invalid stored LTI launch");
  const launch = validateLtiLaunch(value as Omit<PendingLtiLaunch, "expiresAt">);
  return { ...launch, expiresAt: new Date(expiresAt).getTime() };
}

/** Create PostgreSQL runtime state; checkHealth verifies migrations before traffic. */
export function createPostgresRuntimeState(options: PostgresRuntimeStateOptions): RuntimeState {
  const database = options.database;
  const tenant = resolveTenantId(options.tenantId);
  let migrationCheck: Promise<void> | undefined;
  const ready = (): Promise<void> => migrationCheck ??= requireRuntimeStateMigrations(database);

  return {
    async beginLogin(input) {
      await ready();
      const bounds = loginBounds(input);
      const now = Date.now();
      return database.transaction(async (tx) => {
        await lockTenant(tx, tenant);
        await settleExpiredAttempts(tx, tenant, now);
        const counts = await tx.query<{
          account_failures: string; source_failures: string; account_active: string; source_active: string;
          tracked_accounts: string; tracked_sources: string;
        }>(
          `SELECT
             COALESCE((SELECT failure_count FROM practice_relay_login_failures
               WHERE tenant_id = $1 AND failure_scope = 'account' AND failure_key = $2), 0) AS account_failures,
             COALESCE((SELECT failure_count FROM practice_relay_login_failures
               WHERE tenant_id = $1 AND failure_scope = 'source' AND failure_key = $3), 0) AS source_failures,
             (SELECT count(*) FROM practice_relay_login_attempts
               WHERE tenant_id = $1 AND account_key = $2) AS account_active,
             (SELECT count(*) FROM practice_relay_login_attempts
               WHERE tenant_id = $1 AND source_key = $3) AS source_active,
             (SELECT count(DISTINCT failure_key) FROM practice_relay_login_failures
               WHERE tenant_id = $1 AND failure_scope = 'account') +
             (SELECT count(DISTINCT account_key) FROM practice_relay_login_attempts a
               WHERE tenant_id = $1 AND NOT EXISTS (
                 SELECT 1 FROM practice_relay_login_failures f
                 WHERE f.tenant_id = $1 AND f.failure_scope = 'account' AND f.failure_key = a.account_key
               )) AS tracked_accounts,
             (SELECT count(DISTINCT failure_key) FROM practice_relay_login_failures
               WHERE tenant_id = $1 AND failure_scope = 'source') +
             (SELECT count(DISTINCT source_key) FROM practice_relay_login_attempts a
               WHERE tenant_id = $1 AND NOT EXISTS (
                 SELECT 1 FROM practice_relay_login_failures f
                 WHERE f.tenant_id = $1 AND f.failure_scope = 'source' AND f.failure_key = a.source_key
               )) AS tracked_sources`,
          [tenant, bounds.account, bounds.source],
        );
        const count = counts.rows[0];
        if (!count) throw new Error("unable to read login admission counters");
        const existingAccount = Number(count.account_failures) > 0 || Number(count.account_active) > 0;
        const existingSource = Number(count.source_failures) > 0 || Number(count.source_active) > 0;
        if (
          (!existingAccount && Number(count.tracked_accounts) >= MAX_TRACKED_LOGIN_KEYS) ||
          (!existingSource && Number(count.tracked_sources) >= MAX_TRACKED_LOGIN_KEYS) ||
          Number(count.account_failures) + Number(count.account_active) >= bounds.accountLimit ||
          Number(count.source_failures) + Number(count.source_active) >= bounds.sourceLimit
        ) return undefined;
        const attemptId = randomUUID();
        await tx.query(
          `INSERT INTO practice_relay_login_attempts
             (tenant_id, attempt_id, account_key, source_key, expires_at, window_ms)
           VALUES ($1, $2::uuid, $3, $4,
             to_timestamp($5 / 1000.0) + ($6 * interval '1 millisecond'), $6)`,
          [tenant, attemptId, bounds.account, bounds.source, now, bounds.windowMs],
        );
        return attemptId;
      });
    },
    async finishLogin(attemptId, success) {
      await ready();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(attemptId)) return;
      const now = Date.now();
      await database.transaction(async (tx) => {
        await lockTenant(tx, tenant);
        const result = await tx.query<AttemptRow>(
          `DELETE FROM practice_relay_login_attempts
           WHERE tenant_id = $1 AND attempt_id = $2::uuid
           RETURNING attempt_id, account_key, source_key, expires_at, window_ms`,
          [tenant, attemptId],
        );
        const attempt = result.rows[0];
        if (!attempt) return;
        const expired = new Date(attempt.expires_at).getTime() <= now;
        if (success === true && !expired) {
          await tx.query(
            `DELETE FROM practice_relay_login_failures
             WHERE tenant_id = $1 AND failure_scope = 'account' AND failure_key = $2`,
            [tenant, attempt.account_key],
          );
          return;
        }
        if (success === false || expired) {
          await incrementFailure(tx, { tenant, scope: "account", key: attempt.account_key, now, windowMs: attempt.window_ms });
          await incrementFailure(tx, { tenant, scope: "source", key: attempt.source_key, now, windowMs: attempt.window_ms });
        }
      });
    },
    async registerLtiLaunch(state, input, registrationOptions) {
      await ready();
      validateState(state);
      const launch = validateLtiLaunch(input);
      const now = registrationOptions?.now ?? Date.now();
      const ttlMs = boundedInteger(registrationOptions?.ttlMs, DEFAULT_LTI_TTL_MS, "ttlMs");
      const maxPending = boundedInteger(registrationOptions?.maxPending, DEFAULT_MAX_PENDING_LTI, "maxPending");
      await database.transaction(async (tx) => {
        await lockTenant(tx, tenant);
        await tx.query(
          `DELETE FROM practice_relay_lti_launches
           WHERE tenant_id = $1 AND expires_at <= to_timestamp($2 / 1000.0)`,
          [tenant, now],
        );
        const existing = await tx.query(
          `SELECT state FROM practice_relay_lti_launches
           WHERE tenant_id = $1 AND state = $2 FOR UPDATE`,
          [tenant, state],
        );
        if (existing.rowCount === 0) {
          const count = await tx.query<{ count: string }>(
            `SELECT count(*) AS count FROM practice_relay_lti_launches WHERE tenant_id = $1`,
            [tenant],
          );
          const overflow = Number(count.rows[0]?.count ?? 0) - maxPending + 1;
          if (overflow > 0) {
            await tx.query(
              `DELETE FROM practice_relay_lti_launches
               WHERE tenant_id = $1 AND state IN (
                 SELECT state FROM practice_relay_lti_launches
                 WHERE tenant_id = $1 ORDER BY created_at, state LIMIT $2
               )`,
              [tenant, overflow],
            );
          }
        }
        await tx.query(
          `INSERT INTO practice_relay_lti_launches
             (tenant_id, state, launch, expires_at, created_at)
           VALUES ($1, $2, $3::jsonb,
             to_timestamp($4 / 1000.0) + ($5 * interval '1 millisecond'),
             to_timestamp($4 / 1000.0))
           ON CONFLICT (tenant_id, state) DO UPDATE SET
             launch = EXCLUDED.launch, expires_at = EXCLUDED.expires_at,
             created_at = EXCLUDED.created_at`,
          [tenant, state, JSON.stringify(launch), now, ttlMs],
        );
      });
      return { ...launch, expiresAt: now + ttlMs };
    },
    async consumeLtiLaunch(state, now = Date.now()) {
      await ready();
      validateState(state);
      return database.transaction(async (tx) => {
        const result = await tx.query<{ launch: unknown; expires_at: Date | string }>(
          `DELETE FROM practice_relay_lti_launches
           WHERE tenant_id = $1 AND state = $2
           RETURNING launch, expires_at`,
          [tenant, state],
        );
        const row = result.rows[0];
        if (!row || new Date(row.expires_at).getTime() <= now) return undefined;
        return parseLaunch(row.launch, row.expires_at);
      });
    },
    async checkHealth() {
      await ready();
      await database.checkHealth();
      await database.query(
        `SELECT attempt_id FROM practice_relay_login_attempts WHERE tenant_id = $1 LIMIT 1`,
        [tenant],
      );
    },
    async close() {},
  };
}
