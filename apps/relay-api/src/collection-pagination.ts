/** Signed keyset cursors scoped to a bearer actor, tenant, and title filter. */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { RequestContext } from "./request-context.ts";
import { queryOf } from "./api-http.ts";

/** Validated collection request parameters. */
export type CollectionQuery = { limit: number; title: string; after?: string };

function signature(ctx: RequestContext, body: string): Buffer {
  return createHmac("sha256", ctx.runtime.opsSecrets.authSecret).update(body).digest();
}

/** Validate pagination bounds and authenticate the cursor before querying storage. */
export function parseCollectionQuery(ctx: RequestContext, actor: string): CollectionQuery {
  const query = queryOf(ctx.req);
  const rawLimit = query.get("limit");
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  if ((rawLimit !== null && !/^[0-9]+$/.test(rawLimit)) || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("limit must be an integer from 1 to 100");
  }
  const title = (query.get("title") ?? "").trim();
  if (title.length > 500) throw new Error("title filter exceeds 500 characters");
  const cursor = query.get("cursor");
  if (!cursor) return { limit, title };
  if (cursor.length > 4096) throw new Error("invalid cursor");
  try {
    const [body, mac, extra] = cursor.split(".");
    const expected = signature(ctx, body);
    const received = Buffer.from(mac, "base64url");
    if (extra || received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error();
    const value = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (value.v !== 1 || value.actor !== actor || value.title !== title || value.tenant !== (ctx.runtime.recordStore.tenantId ?? "") || typeof value.after !== "string") throw new Error();
    return { limit, title, after: value.after };
  } catch { throw new Error("invalid cursor for this actor and filter"); }
}

/** Emit a cursor only for the last returned summary when a later row exists. */
export function collectionCursor(ctx: RequestContext, actor: string, title: string, after: string): string {
  const body = Buffer.from(JSON.stringify({ v: 1, actor, title, after, tenant: ctx.runtime.recordStore.tenantId ?? "" })).toString("base64url");
  return `${body}.${signature(ctx, body).toString("base64url")}`;
}
