/** Public process-health route for the Practice Relay API. */
import packageMetadata from "../package.json" with { type: "json" };
import { LTI_STATUS } from "@practice-relay/lti";
import { sendJson } from "./api-http.ts";
import type { RequestContext, RouteResult } from "./request-context.ts";
import { storeBackendLabel } from "./application/records.ts";

/** Write the public health response for a previously matched request. */
export function handleSystemHealthRoute(ctx: RequestContext): RouteResult {
  const { res, runtime } = ctx;
  sendJson(res, 200, {
    ok: true,
    service: "practice-relay-api",
    version: packageMetadata.version,
    productTier: "lab-only",
    lti: LTI_STATUS,
    ltiAlg: runtime.labRsaKeys ? "RS256" : "HS256",
    durable: runtime.recordStore.durable,
    storeBackend: storeBackendLabel(runtime),
    objectStore: runtime.objectStoreMode,
  });
  return "handled";
}
