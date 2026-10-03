/** Acceptance coverage for the real Node TCP listener, not an in-process response mock. */
import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import { test } from "node:test";
import { createAppServer } from "./index.ts";

test("the application server accepts a TCP health request with request metadata", async () => {
  const server = createAppServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const response = await new Promise<{ status: number; requestId: string | undefined; body: string }>((resolve, reject) => {
      const client = request({ host: "127.0.0.1", port: address.port, path: "/health", headers: { "x-request-id": "tcp-health" } }, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => { body += chunk; });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, requestId: res.headers["x-request-id"] as string | undefined, body }));
      });
      client.once("error", reject);
      client.end();
    });
    assert.equal(response.status, 200);
    assert.equal(response.requestId, "tcp-health");
    assert.equal((JSON.parse(response.body) as { service: string }).service, "practice-relay-api");
  } finally {
    server.close();
    await once(server, "close");
  }
});
