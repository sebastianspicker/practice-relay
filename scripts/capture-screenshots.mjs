/**
 * Capture the maintained browser surfaces into documentation screenshots.
 * Why: the README tour and Pages preview need reproducible images that match the
 * shipped interface instead of hand-collected files that silently drift.
 *
 * Requires the `playwright-core` dependency and a Chromium-family browser. The
 * default channel is the locally installed Google Chrome; override it with
 * `PRACTICE_RELAY_SCREENSHOT_CHANNEL` or `PRACTICE_RELAY_SCREENSHOT_EXECUTABLE`.
 */
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { startStaticServer } from "./static-server.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const movementRoot = join(repoRoot, "packages", "movement");
const relayWebRoot = join(repoRoot, "apps", "relay-web", "src");
const schemaSiteRoot = join(repoRoot, "apps", "movement-schema-site");
const workbenchRoot = join(repoRoot, "apps", "movement-workbench", "src");
const movementMount = { urlPrefix: "/packages/movement/", root: movementRoot };

/** Browser surfaces captured for the documentation tour, in tour order. */
export const SURFACES = [
  {
    name: "relay-web-movement",
    label: "Practice Relay workspace",
    port: 5273,
    root: relayWebRoot,
    mounts: [movementMount],
    path: "/?demo=1",
  },
  {
    name: "relay-web-handoff",
    label: "Practice Relay handoff review",
    port: 5274,
    root: relayWebRoot,
    mounts: [movementMount],
    path: "/?demo=1",
    prepare: (page) => page.click('[data-tab="handoff"]'),
  },
  {
    name: "mvei-workbench",
    label: "MvEI Workbench",
    port: 5275,
    root: workbenchRoot,
    mounts: [movementMount],
    path: "/",
    fullPage: true,
  },
  {
    name: "mvei-schema-site",
    label: "MvEI schema site",
    port: 5276,
    root: schemaSiteRoot,
    mounts: [{ urlPrefix: "/packages/movement/", root: movementRoot }],
    path: "/",
    fullPage: true,
  },
];

/** Resolve the release version used to name the screenshot directory. */
async function releaseVersion() {
  const release = JSON.parse(await readFile(join(repoRoot, "release.json"), "utf8"));
  return release.version;
}

async function launchBrowser() {
  const executablePath = process.env.PRACTICE_RELAY_SCREENSHOT_EXECUTABLE;
  const channel = process.env.PRACTICE_RELAY_SCREENSHOT_CHANNEL ?? "chrome";
  return chromium.launch(
    executablePath ? { executablePath, headless: true } : { channel, headless: true },
  );
}

/** Capture one served surface to a PNG path. */
async function captureSurface(browser, surface, outputDir) {
  const server = await startStaticServer({
    root: surface.root,
    mounts: surface.mounts,
    port: surface.port,
    label: surface.label,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  try {
    await page.goto(`http://127.0.0.1:${surface.port}${surface.path}`, {
      waitUntil: "networkidle",
    });
    if (surface.prepare) await surface.prepare(page);
    await page.waitForTimeout(400);
    const file = join(outputDir, `${surface.name}.png`);
    await page.screenshot({ path: file, fullPage: surface.fullPage === true });
    console.log(`captured ${surface.name}: ${file}`);
  } finally {
    await page.close();
    await new Promise((done) => server.close(done));
  }
}

/** Capture every maintained surface into `docs/images/<version>`. */
export async function captureScreenshots(surfaces = SURFACES) {
  const outputDir = join(repoRoot, "docs", "images", await releaseVersion());
  await mkdir(outputDir, { recursive: true });
  const browser = await launchBrowser();
  try {
    for (const surface of surfaces) await captureSurface(browser, surface, outputDir);
  } finally {
    await browser.close();
  }
  return outputDir;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await captureScreenshots();
}
