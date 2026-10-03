/** Prove session isolation, summary paging, and cancellation without a live API. */
import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspaceState } from "../src/data/workspace-state.mjs";
import { requestJson } from "../src/data/api-client.mjs";

const session = { token: "test", userId: "member", displayName: "Member", expiresAt: new Date(Date.now() + 60_000).toISOString() };
const record = { id: "one", title: "One", revision: 1, artifacts: [{ id: "a" }] };

test("summaries, server title/cursor, revision cache, and logout", async () => {
  const paths = [];
  const controller = createWorkspaceState("", { request: async (_base, path) => {
    paths.push(path);
    if (path === "/auth/login") return session;
    if (path.startsWith("/work-records?")) return { items: [{ id: "one", title: "One", revision: 1 }], nextCursor: "next" };
    return record;
  } });
  await controller.login("member", "secret");
  await controller.list("One");
  assert.match(paths.at(-1), /title=One/);
  await controller.list("One", true);
  assert.match(paths.at(-1), /cursor=next/);
  await controller.select(record);
  controller.state.selected.includedIds = [];
  await controller.select(record);
  assert.deepEqual(controller.state.selected.includedIds, []);
  assert.equal(paths.filter(path => path === "/work-records/one").length, 1);
  controller.logout();
  assert.equal(controller.state.selected, null);
  assert.equal(controller.state.session, null);
});

test("superseded requests cannot replace current summaries", async () => {
  const waiting = [];
  const controller = createWorkspaceState("", { request: async (_base, path) => {
    if (path === "/auth/login") return session;
    return new Promise(resolve => waiting.push(resolve));
  } });
  await controller.login("member", "secret");
  const old = controller.list("old");
  const latest = controller.list("new");
  waiting[1]({ items: [record], nextCursor: null });
  await latest;
  waiting[0]({ items: [], nextCursor: null });
  await assert.rejects(old, { name: "AbortError" });
  assert.equal(controller.state.summaries[0].id, "one");
  controller.logout();
});

test("authorization failure erases all private state", async () => {
  const controller = createWorkspaceState("", { request: async (_base, path) => {
    if (path === "/auth/login") return session;
    throw Object.assign(new Error("Denied"), { status: 403 });
  } });
  await controller.login("member", "secret");
  await assert.rejects(controller.list());
  assert.equal(controller.state.session, null);
  assert.deepEqual(controller.state.summaries, []);
});

test("record-operation 403 preserves the session while 401 expires it", async () => {
  let status = 403;
  const controller = createWorkspaceState("", { request: async (_base, path) => {
    if (path === "/auth/login") return session;
    if (path === "/work-records/one") return record;
    throw Object.assign(new Error("Record role denied"), { status });
  } });
  await controller.login("member", "secret");
  await controller.select(record);
  await assert.rejects(controller.request("/work-records/one/policies"), /Record role denied/);
  assert.equal(controller.state.session.userId, "member");
  assert.equal(controller.state.selected.id, "one");

  status = 401;
  await assert.rejects(controller.request("/work-records/one/policies"));
  assert.equal(controller.state.session, null);
  assert.equal(controller.state.selected, null);
});

test("logout invalidates operation responses even when a request ignores cancellation", async () => {
  let resolveOperation;
  const controller = createWorkspaceState("", { request: async (_base, path) => {
    if (path === "/auth/login") return session;
    return new Promise((resolve) => { resolveOperation = resolve; });
  } });
  await controller.login("member", "secret");
  const operation = controller.request("/work-records/one/exports", { body: {} });
  controller.logout();
  resolveOperation({ decision: { allowed: true } });
  await assert.rejects(operation, { name: "AbortError" });
  assert.equal(controller.state.session, null);
});

test("independent record operations do not supersede each other", async () => {
  const waiting = [];
  const controller = createWorkspaceState("", { request: async (_base, path) => {
    if (path === "/auth/login") return session;
    return new Promise((resolve) => waiting.push({ path, resolve }));
  } });
  await controller.login("member", "secret");
  const first = controller.request("/work-records/one/artifacts", { body: { id: "a" } });
  const second = controller.request("/work-records/one/policies", { body: { id: "p" } });
  waiting[1].resolve({ id: "second" });
  waiting[0].resolve({ id: "first" });
  assert.deepEqual(await Promise.all([first, second]), [{ id: "first" }, { id: "second" }]);
  controller.logout();
});

test("record switches ignore an older detail response", async () => {
  const detail = new Map();
  const controller = createWorkspaceState("", { request: async (_base, path) => {
    if (path === "/auth/login") return session;
    return new Promise((resolve) => detail.set(path, resolve));
  } });
  await controller.login("member", "secret");
  const first = controller.select({ id: "one", revision: 1 });
  const second = controller.select({ id: "two", revision: 1 });
  detail.get("/work-records/two")({ id: "two", title: "Two", revision: 1 });
  await second;
  detail.get("/work-records/one")({ id: "one", title: "One", revision: 1 });
  await assert.rejects(first, { name: "AbortError" });
  assert.equal(controller.state.selected.id, "two");
  controller.logout();
});

test("accept updates an old record summary without reviving its selection", async () => {
  const records = {
    one: { id: "one", title: "One", revision: 1 },
    two: { id: "two", title: "Two", revision: 1 },
  };
  const controller = createWorkspaceState("", { request: async (_base, path) => {
    if (path === "/auth/login") return session;
    return records[path.split("/").at(-1)];
  } });
  await controller.login("member", "secret");
  await controller.select(records.one);
  await controller.select(records.two);
  controller.accept({ ...records.one, title: "One updated", revision: 2 });
  assert.equal(controller.state.selected.id, "two");
  assert.equal(controller.state.summaries.find((item) => item.id === "one").title, "One updated");
  controller.logout();
});

test("request timeout uses an abort signal", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
  const keepAlive = setTimeout(() => {}, 100);
  try { await assert.rejects(requestJson("", "/", { timeoutMs: 5 }), { name: "TimeoutError" }); }
  finally { clearTimeout(keepAlive); globalThis.fetch = original; }
});

test("request client preserves problem details and supports raw and blob responses", async () => {
  const original = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith("/denied")) {
      return new Response(JSON.stringify({
        detail: "represented subject denied repository use",
        decision: { allowed: false, reasons: ["policy withdrawn"] },
      }), { status: 422, headers: { "Content-Type": "application/json" } });
    }
    if (url.endsWith("/media/key")) return new Response("motif", { status: 200 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  try {
    await assert.rejects(
      requestJson("https://relay.test", "/denied", { token: "private" }),
      (error) => {
        assert.equal(error.status, 422);
        assert.equal(error.message, "represented subject denied repository use");
        assert.deepEqual(error.payload.decision.reasons, ["policy withdrawn"]);
        return true;
      },
    );
    globalThis.fetch = async () => new Response(JSON.stringify({
      decision: { allowed: false, reasons: ["subject performer-1 withdrew repository permission"] },
    }), { status: 422 });
    await assert.rejects(
      requestJson("https://relay.test", "/denied"),
      /subject performer-1 withdrew repository permission/,
    );
    globalThis.fetch = async (url, options) => {
      requests.push({ url, options });
      return url.endsWith("/media/key")
        ? new Response("motif", { status: 200 })
        : new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    const blob = await requestJson("https://relay.test", "/media/key", {
      token: "private",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      rawBody: "{\"motif\":true}",
      responseType: "blob",
    });
    assert.equal(await blob.text(), "motif");
    assert.equal(requests.at(-1).options.headers.get("Authorization"), "Bearer private");
    assert.equal(requests.at(-1).options.body, "{\"motif\":true}");
    await requestJson("https://relay.test", "https://relay.test/same-origin", { token: "private" });
    assert.equal(requests.at(-1).options.headers.get("Authorization"), "Bearer private");
    await assert.rejects(
      requestJson("https://relay.test", "https://other.test/private", { token: "private" }),
      /another origin/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("session expiry clears private previews", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1000 });
  const controller = createWorkspaceState("", { request: async () => ({ ...session, expiresAt: new Date(2000).toISOString() }) });
  await controller.login("member", "secret");
  t.mock.timers.tick(1000);
  assert.equal(controller.state.session, null);
  assert.equal(controller.state.selected, null);
});
