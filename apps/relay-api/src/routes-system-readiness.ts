/** Readiness route for store, media, and secret prerequisites. */
import { sendJson } from "./api-http.ts";
import type { RequestContext, RouteResult } from "./request-context.ts";
import { checkReadiness } from "./application/readiness.ts";

/** Probe readiness and write the response for a previously matched request. */
export async function handleSystemReadinessRoute(
  ctx: RequestContext,
): Promise<RouteResult> {
  const { res, runtime } = ctx;
  const { ok: ready, checks } = await checkReadiness(runtime);
  sendJson(res, ready ? 200 : 503, {
    ok: ready,
    service: "practice-relay-api",
    checks,
  });
  return "handled";
}
