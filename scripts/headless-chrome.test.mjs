/**
 * Tests for shared headless Chrome discovery.
 * Why: screenshot tools must honor explicit configuration before platform defaults.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chromeCandidates,
  findChromeExecutable,
} from "./headless-chrome.mjs";

test("explicit Chrome path is first and Linux fallbacks remain available", () => {
  const candidates = chromeCandidates({ CHROME_PATH: "/custom/chrome" });
  assert.equal(candidates[0], "/custom/chrome");
  assert.ok(candidates.includes("/usr/bin/chromium"));
});

test("discovery returns the first existing candidate", () => {
  const found = findChromeExecutable({
    env: { CHROME_PATH: "/missing" },
    exists: (candidate) => candidate === "/usr/bin/google-chrome",
  });
  assert.equal(found, "/usr/bin/google-chrome");
});
