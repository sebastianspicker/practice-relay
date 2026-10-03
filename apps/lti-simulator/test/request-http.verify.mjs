/** Outbound mock-LMS requests must remain on the configured API origin. */
import assert from "node:assert/strict";
import test from "node:test";
import { apiFetch, MockRequestError, resolveApiUrl } from "../src/request-http.mjs";

function jsonResponse(body = { ok: true }) {
  return {
    status: 200,
    async text() { return JSON.stringify(body); },
  };
}

test("API URL resolution contains hostname suffixes under a portless origin", () => {
  const resolved = resolveApiUrl(
    "http://relay.internal",
    ".attacker.example/token",
  );
  assert.equal(resolved.origin, "http://relay.internal");
  assert.equal(resolved.pathname, "/.attacker.example/token");
});

test("API URL resolution rejects off-origin and credential-bearing targets", () => {
  for (const target of [
    "//attacker.example/token",
    "https://attacker.example/token",
    "http://user:password@relay.internal/token",
  ]) {
    assert.throws(
      () => resolveApiUrl("http://relay.internal", target),
      (error) => error instanceof MockRequestError && error.status === 400,
    );
  }
});

test("apiFetch uses the resolved same-origin URL and refuses redirects", async () => {
  let calledUrl;
  let calledOptions;
  const result = await apiFetch({
    apiBase: "http://relay.internal",
    async fetchImpl(url, options) {
      calledUrl = url;
      calledOptions = options;
      return jsonResponse();
    },
  }, "/lti/oauth/token", { method: "POST", body: { secret: "held" } });

  assert.equal(calledUrl, "http://relay.internal/lti/oauth/token");
  assert.equal(calledOptions.redirect, "error");
  assert.equal(result.url, calledUrl);
});
