/**
 * Process-local OIDC launch-state lifecycle for Practice Relay's lab LTI tier.
 * Why: state must be bounded, expiring, and consumed exactly once.
 */
import type { ApiRuntime, PendingLtiLaunch } from "./runtime.ts";

const LTI_STATE_TTL_MS = 5 * 60 * 1000;
const MAX_PENDING_LTI_LAUNCHES = 1024;

/** Remove expired launch state and enforce the process-local cardinality bound. */
export function prunePendingLtiLaunches(
  runtime: ApiRuntime,
  now = Date.now(),
): void {
  for (const [state, pending] of runtime.pendingLtiLaunches) {
    if (pending.expiresAt <= now) runtime.pendingLtiLaunches.delete(state);
  }
  while (runtime.pendingLtiLaunches.size >= MAX_PENDING_LTI_LAUNCHES) {
    const oldest = runtime.pendingLtiLaunches.keys().next().value as
      | string
      | undefined;
    if (!oldest) break;
    runtime.pendingLtiLaunches.delete(oldest);
  }
}

/** Register an OIDC launch state with the fixed lab-tier expiry. */
export function registerPendingLtiLaunch(
  runtime: ApiRuntime,
  state: string,
  pending: Omit<PendingLtiLaunch, "expiresAt">,
): void {
  prunePendingLtiLaunches(runtime);
  runtime.pendingLtiLaunches.set(state, {
    ...pending,
    expiresAt: Date.now() + LTI_STATE_TTL_MS,
  });
}

/** Consume one launch state even if the subsequent token verification fails. */
export function consumePendingLtiLaunch(
  runtime: ApiRuntime,
  state: string,
): PendingLtiLaunch | undefined {
  prunePendingLtiLaunches(runtime);
  const pending = runtime.pendingLtiLaunches.get(state);
  runtime.pendingLtiLaunches.delete(state);
  return pending;
}
