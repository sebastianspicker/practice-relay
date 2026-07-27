/**
 * Shared Chrome/Chromium discovery for screenshot scripts.
 * Why: every evidence renderer should use the same cross-platform binary order.
 */
import { existsSync } from "node:fs";

/** Return ordered Chrome candidates, honoring an explicit CHROME_PATH first. */
export function chromeCandidates(env = process.env) {
  return [
    env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
}

/** Find the first installed headless Chrome candidate. */
export function findChromeExecutable(opts = {}) {
  const env = opts.env ?? process.env;
  const exists = opts.exists ?? existsSync;
  return chromeCandidates(env).find((candidate) => exists(candidate));
}
