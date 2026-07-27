/**
 * Tests for the shared alpha static server helpers.
 * Why: package scripts must not expose files outside their selected app roots.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import {
  contentTypeFor,
  parseStaticPort,
  resolveStaticPath,
  selectStaticRoot,
  startStaticServer,
} from "./static-server.mjs";

test("static content types cover browser application assets", () => {
  assert.equal(contentTypeFor("index.html"), "text/html; charset=utf-8");
  assert.equal(contentTypeFor("app.mjs"), "text/javascript; charset=utf-8");
  assert.equal(contentTypeFor("workbench.css"), "text/css; charset=utf-8");
  assert.equal(contentTypeFor("unknown.bin"), "application/octet-stream");
});

test("static ports reject invalid values", () => {
  assert.equal(parseStaticPort(undefined, 5173), 5173);
  assert.throws(() => parseStaticPort("0", 5173), /invalid static server port/u);
  assert.throws(() => parseStaticPort("5173.5", 5173), /invalid static server port/u);
});

test("static paths remain inside the configured root", () => {
  const root = resolve("/tmp/practice-relay-static-root");
  assert.equal(resolveStaticPath(root, "/"), resolve(root, "index.html"));
  assert.equal(resolveStaticPath(root, "/src/app.mjs"), resolve(root, "src/app.mjs"));
  assert.throws(
    () => resolveStaticPath(root, "/../../outside.txt"),
    /leaves the static root/u,
  );
  assert.throws(() => resolveStaticPath(root, "/%E0%A4%A"), /malformed URL path/u);
});

test("static mounts expose only their explicit URL prefix", () => {
  const primary = "/repo/app";
  const mounts = [{ urlPrefix: "/shared/vocab/", root: "/repo/shared/vocab" }];
  assert.deepEqual(selectStaticRoot(primary, mounts, "/index.html"), {
    root: primary,
    requestPath: "/index.html",
  });
  assert.deepEqual(selectStaticRoot(primary, mounts, "/shared/vocab/symbols.mjs"), {
    root: "/repo/shared/vocab",
    requestPath: "/symbols.mjs",
  });
  assert.throws(
    () => selectStaticRoot(primary, [{ urlPrefix: "/unsafe", root: "/repo" }], "/unsafe"),
    /must start and end with a slash/u,
  );
});

test("static server refuses non-loopback hosts before listening", async () => {
  await assert.rejects(
    startStaticServer({ root: ".", host: "0.0.0.0", port: 5173 }),
    /requires a loopback host/u,
  );
});
