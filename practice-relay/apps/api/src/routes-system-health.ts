/** Public process-health route for the Practice Relay API. */
import packageMetadata from "../../../../package.json" with { type: "json" };
import { collabEnabled } from "@practice-relay/collaboration";
import { LTI_STATUS } from "../../lti/src/index.mjs";
import { sendJson } from "./api-http.ts";
import type { RequestContext, RouteResult } from "./request-context.ts";
import { storeBackendLabel } from "./record-service.ts";

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
    collab: collabEnabled(),
    durable: Boolean(process.env.PRACTICE_RELAY_DATA),
    storeBackend: storeBackendLabel(runtime),
    objectStore: runtime.objectStoreMode,
  });
  return "handled";
}
