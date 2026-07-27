/**
 * Public Practice Relay demonstration export route.
 * Why: the sample work-record package evidence stays isolated from authenticated record routes.
 */
import {
  exportWorkRecordPackage,
  exportWorkRecordPackageZip,
} from "@practice-relay/work-record-package";
import { queryOf, sendBinary, sendJson } from "./api-http.ts";
import type { RequestContext, RouteResult } from "./request-context.ts";
import { demoRecord } from "./record-service.ts";

/** Handle the public demo export without consuming unmatched request bodies. */
export async function handleDemoRoutes(
  ctx: RequestContext,
): Promise<RouteResult> {
  const { method, pathname, req, res } = ctx;
  if (pathname !== "/demo/export" || method !== "GET") {
    return "unmatched";
  }

  const record = demoRecord();
  const query = queryOf(req);
  if (query.get("format") === "zip") {
    const pkg = exportWorkRecordPackageZip(record, { consentAllTagged: true });
    sendBinary(res, {
      status: 200,
      bytes: pkg.zipBytes,
      contentType: "application/zip",
      filename: "ps-demo.work-record.zip",
    });
    return "handled";
  }
  const pkg = exportWorkRecordPackage(record, {
    consentAllTagged: true,
    purposes: ["course_assessment"],
  });
  sendJson(res, 200, {
    manifest: pkg.manifest,
    roCrateMetadata: pkg.roCrateMetadata,
    validated: pkg.validated,
  });
  return "handled";
}
