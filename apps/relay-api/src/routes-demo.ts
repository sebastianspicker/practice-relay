/**
 * Public Practice Relay demonstration export route.
 * Why: the sample work-record package evidence stays isolated from authenticated record routes.
 */
import { queryOf, sendBinary, sendJson } from "./api-http.ts";
import type { RequestContext, RouteResult } from "./request-context.ts";
import { demoPackageExport } from "./application/exports.ts";
import { demoRecord } from "./application/records.ts";

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
  const pkg = demoPackageExport(record, query.get("format") === "zip");
  if (pkg.format === "zip") {
    sendBinary(res, {
      status: 200,
      bytes: pkg.bytes,
      contentType: "application/zip",
      filename: pkg.filename,
    });
    return "handled";
  }
  sendJson(res, 200, {
    manifest: pkg.manifest,
    roCrateMetadata: pkg.roCrateMetadata,
    validated: pkg.validated,
  });
  return "handled";
}
