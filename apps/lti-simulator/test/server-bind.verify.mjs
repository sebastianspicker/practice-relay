/** Local-mock listener boundary regressions. */
import assert from "node:assert/strict";
import test from "node:test";
import { assertSafeMockPlatformBind, isLoopbackHost } from "../src/server.mjs";

test("mock platform only permits loopback binds without an explicit lab opt-in", () => {
  for (const host of ["localhost", "127.0.0.1", "127.1.2.3", "::1", "[::1]"]) {
    assert.equal(isLoopbackHost(host), true, host);
    assert.doesNotThrow(() => assertSafeMockPlatformBind(host, false));
  }
  for (const host of ["0.0.0.0", "192.168.1.12", "example.test"]) {
    assert.equal(isLoopbackHost(host), false, host);
    assert.throws(() => assertSafeMockPlatformBind(host, false), /ALLOW_NON_LOOPBACK=1/);
    assert.doesNotThrow(() => assertSafeMockPlatformBind(host, true));
  }
});
