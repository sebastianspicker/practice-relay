/** Shared, expiring, single-use OIDC launch state. */
import type { ApiRuntime, PendingLtiLaunch } from "./runtime.ts";

/** Register pending launch state before returning the authorization redirect. */
export async function registerPendingLtiLaunch(runtime: ApiRuntime, state: string, pending: Omit<PendingLtiLaunch, "expiresAt">): Promise<void> {
  await runtime.coordination.registerLtiLaunch(state, pending);
}

/** Consume state before any token validation, including an invalid-token attempt. */
export function consumePendingLtiLaunch(runtime: ApiRuntime, state: string): Promise<PendingLtiLaunch | undefined> {
  return runtime.coordination.consumeLtiLaunch(state);
}
