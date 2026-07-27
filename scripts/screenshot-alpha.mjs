/**
 * Capture the five current alpha browser surfaces from loopback runtime URLs.
 * Why: release images must show loaded application assets, not detached HTML copies.
 */
import { mkdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { findChromeExecutable } from "./headless-chrome.mjs";
import { renderAlphaHtml } from "./render-alpha-html.mjs";
import { startStaticServer } from "./static-server.mjs";
import { createMockRequestHandler } from "../practice-relay/apps/lti-mock-platform/src/request-routes.mjs";
import { createToolRegistry } from "../practice-relay/apps/lti-mock-platform/src/platform.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const alphaDir = join(root, "docs/images/0.4.0-alpha.1");
mkdirSync(alphaDir, { recursive: true });

function configuredPort(name, fallback) {
  const raw = process.env[name] ?? String(fallback);
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }
  return port;
}

const ports = {
  practiceRelay: configuredPort("PRACTICE_RELAY_WEB_PORT", 5173),
  schemaSite: configuredPort("MVEI_SCHEMA_SITE_PORT", 5174),
  workbench: configuredPort("MVEI_WORKBENCH_PORT", 5175),
  corpusSite: configuredPort("MVEI_CORPUS_SITE_PORT", 5176),
  ltiMock: configuredPort("MOCK_PLATFORM_PORT", 8790),
};

const shots = [
  {
    name: "practice-relay-web",
    url: `http://127.0.0.1:${ports.practiceRelay}/`,
    ready: "#status[data-kind='error'], #status[data-kind='success']",
    out: join(alphaDir, "practice-relay-web.png"),
    width: 1280,
    height: 920,
  },
  {
    name: "mvei-schema-site",
    url: `http://127.0.0.1:${ports.schemaSite}/`,
    ready: "h1",
    out: join(alphaDir, "mvei-schema-site.png"),
    width: 1280,
    height: 1100,
  },
  {
    name: "mvei-workbench",
    url: `http://127.0.0.1:${ports.workbench}/`,
    ready: ".motif-canvas",
    out: join(alphaDir, "mvei-workbench.png"),
    width: 1280,
    height: 1000,
  },
  {
    name: "mvei-corpus-site",
    url: `http://127.0.0.1:${ports.corpusSite}/site/index.html`,
    ready: "#catalogue",
    out: join(alphaDir, "mvei-corpus-site.png"),
    width: 1280,
    height: 1000,
  },
  {
    name: "lti-mock-admin",
    url: `http://127.0.0.1:${ports.ltiMock}/`,
    ready: "#reg-form",
    out: join(alphaDir, "lti-mock-admin.png"),
    width: 1280,
    height: 1100,
  },
];

async function startLtiMockServer() {
  const registry = createToolRegistry();
  const handler = createMockRequestHandler({
    apiBase: "http://localhost:8787",
    dirname: join(root, "practice-relay/apps/lti-mock-platform/src"),
    port: ports.ltiMock,
    registry,
  });
  const server = createServer((req, res) => void handler(req, res));
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(ports.ltiMock, "127.0.0.1", resolveListen);
  });
  console.log(`LTI mock admin screenshot surface: http://127.0.0.1:${ports.ltiMock}/`);
  return server;
}

function assertPng(path) {
  const size = statSync(path).size;
  console.log(`OK  ${path} (${size} bytes)`);
  if (size < 10_000) {
    throw new Error(`PNG too small: ${path} (${size} bytes)`);
  }
}

async function verifyPrimaryInteraction(page, shot) {
  if (shot.name === "practice-relay-web") {
    // Quiet Dossier: package preview is opened via Prepare export / package actions.
    await page.locator('[data-action="export"]').first().click();
    if (!(await page.locator("#package-dialog").evaluate((dialog) => dialog.open))) {
      throw new Error("Practice Relay handoff review did not open its package preview");
    }
    const summary = await page.locator("#dialog-summary").textContent();
    if (!summary?.includes("RO-Crate 1.3")) {
      throw new Error("Practice Relay package preview omitted its package profile");
    }
    await page.locator("#dialog-close").click();
    const title = await page.locator("#record-title").textContent();
    if (!title?.trim()) {
      throw new Error("Practice Relay Quiet Dossier did not render a record title");
    }
    if (!(await page.locator(".path").count())) {
      throw new Error("Practice Relay Quiet Dossier omitted its handoff path");
    }
  }
  if (shot.name === "mvei-workbench") {
    await page.locator("[data-symbol='run']").click();
    const itemCount = await page.locator("#document p:not(.meta)").first().textContent();
    if (!itemCount?.includes("Items (7)")) {
      throw new Error("MvEI Workbench palette control did not update the Motif");
    }
    await page.locator("[data-mode='laban-subset']").click();
    if (!(await page.locator("#document").isHidden())) {
      throw new Error("MvEI Workbench mode control did not hide the Motif panel");
    }
    if (!(await page.locator("#laban-subset").isVisible())) {
      throw new Error("MvEI Workbench mode control did not show the laban-subset panel");
    }
    await page.locator("[data-action='session-save']").click();
    await page.locator("[data-action='session-load']").click();
    const announcement = await page.locator("#mvei-workbench-live").textContent();
    if (!announcement?.includes("Loaded Motif session")) {
      throw new Error("MvEI Workbench session controls did not restore the Motif");
    }
  }
  if (shot.name === "mvei-schema-site") {
    const corpusHref = await page.locator("a[href*='fixtures/corpus/index.json']").getAttribute("href");
    if (!corpusHref) throw new Error("MvEI schema site is missing its corpus index link");
    const corpusResponse = await page.request.get(new URL(corpusHref, shot.url).href);
    if (!corpusResponse.ok()) {
      throw new Error(`MvEI schema corpus link returned ${corpusResponse.status()}`);
    }
  }
  if (shot.name === "mvei-corpus-site") {
    const fixtureHref = await page.locator("a[href$='motif-sketch-01.json']").getAttribute("href");
    if (!fixtureHref) throw new Error("MvEI corpus site is missing its fixture link");
    const fixtureResponse = await page.request.get(new URL(fixtureHref, shot.url).href);
    if (!fixtureResponse.ok()) {
      throw new Error(`MvEI corpus fixture link returned ${fixtureResponse.status()}`);
    }
  }
  if (shot.name === "lti-mock-admin") {
    await page.locator("#reg-form button[type='submit']").click();
    await page.waitForFunction(() => document.querySelector("#ui-status")?.dataset.state === "success");
    await page.locator("#btn-fixture").click();
    await page.waitForFunction(() => document.querySelector("#log")?.textContent?.includes("registration"));
  }
}

async function verifyResponsiveLayouts(browser, shot) {
  const viewports = [
    { width: 768, height: 1024, label: "tablet" },
    { width: 375, height: 812, label: "mobile" },
  ];
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    try {
      if (shot.name === "practice-relay-web") {
        await page.route("http://localhost:8787/work-records", (route) =>
          route.fulfill({ status: 401, contentType: "application/json", body: "{}" }),
        );
      }
      await page.goto(shot.url, { waitUntil: "networkidle" });
      await page.waitForSelector(shot.ready);
      const widths = await page.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      if (widths.scroll > widths.client) {
        throw new Error(
          `${shot.name} overflows the ${viewport.label} viewport (${widths.scroll}px > ${widths.client}px)`,
        );
      }
    } finally {
      await page.close();
    }
  }
}

async function withPlaywright() {
  let browser;
  try {
    const { chromium } = await import("playwright");
    const executablePath =
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? findChromeExecutable();
    browser = await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    });
  } catch (error) {
    console.error(
      "playwright_unavailable:",
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
  try {
    for (const s of shots) {
      const runtimeErrors = [];
      const badResponses = [];
      const page = await browser.newPage({
        viewport: { width: s.width, height: s.height },
      });
      page.on("pageerror", (error) => runtimeErrors.push(error.message));
      page.on("response", (response) => {
        const responseUrl = new URL(response.url());
        const isExpectedFallback =
          s.name === "practice-relay-web" && responseUrl.pathname === "/work-records";
        const isIncidentalIcon = responseUrl.pathname === "/favicon.ico";
        if (response.status() >= 400 && !isExpectedFallback && !isIncidentalIcon) {
          badResponses.push(`${response.status()} ${response.url()}`);
        }
      });
      if (s.name === "practice-relay-web") {
        await page.route("http://localhost:8787/work-records", (route) =>
          route.fulfill({ status: 401, contentType: "application/json", body: "{}" }),
        );
      }
      await page.goto(s.url, {
        waitUntil: "networkidle",
      });
      await page.waitForSelector(s.ready);
      await page.screenshot({ path: s.out, fullPage: true });
      if (runtimeErrors.length > 0 || badResponses.length > 0) {
        throw new Error(
          `${s.name} browser errors: ${[...runtimeErrors, ...badResponses].join(" | ")}`,
        );
      }
      await verifyPrimaryInteraction(page, s);
      await page.close();
      await verifyResponsiveLayouts(browser, s);
      assertPng(s.out);
    }
  } finally {
    await browser.close();
  }
  console.log("tool=playwright");
  return true;
}

function withChromeHeadless() {
  const chrome = findChromeExecutable();
  if (!chrome) {
    throw new Error(
      "no Chrome/Chromium binary found for headless screenshots",
    );
  }
  console.log(`tool=chrome-headless path=${chrome}`);
  for (const s of shots) {
    const r = spawnSync(
      chrome,
      [
        "--headless",
        "--no-sandbox",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-gpu",
        "--disable-crash-reporter",
        "--disable-dev-shm-usage",
        "--disable-features=Crashpad",
        "--hide-scrollbars",
        "--virtual-time-budget=2500",
        `--user-data-dir=/private/tmp/practice-relay-alpha-chrome-${s.name}`,
        `--window-size=${s.width},${s.height}`,
        `--screenshot=${s.out}`,
        s.url,
      ],
      { encoding: "utf8" },
    );
    if (r.status !== 0) {
      const processDetail = [
        r.error?.message,
        r.signal ? `signal=${r.signal}` : undefined,
        r.status !== null ? `status=${r.status}` : undefined,
      ].filter(Boolean).join(" ");
      throw new Error(
        `chrome failed for ${s.name}: ${r.stderr || r.stdout || processDetail || "unknown process failure"}`,
      );
    }
    assertPng(s.out);
  }
}

async function main() {
  const corpusBuild = spawnSync(process.execPath, [
    join(root, "packages/movement-encode/scripts/generate-corpus-site.mjs"),
  ], { encoding: "utf8" });
  if (corpusBuild.status !== 0) {
    throw new Error(`corpus site generation failed: ${corpusBuild.stderr || corpusBuild.stdout}`);
  }
  renderAlphaHtml();
  const servers = await Promise.all([
    startStaticServer({
      root: join(root, "practice-relay/apps/web/src"),
      port: ports.practiceRelay,
      label: "Practice Relay screenshot surface",
    }),
    startStaticServer({
      root: join(root, "mvei/apps/schema-site"),
      port: ports.schemaSite,
      label: "MvEI schema-site screenshot surface",
      mounts: [
        {
          urlPrefix: "/packages/movement-encode/fixtures/corpus/",
          root: join(root, "packages/movement-encode/fixtures/corpus"),
        },
      ],
    }),
    startStaticServer({
      root: join(root, "mvei/apps/workbench/src"),
      port: ports.workbench,
      label: "MvEI Workbench screenshot surface",
      mounts: [
        {
          urlPrefix: "/packages/movement-encode/vocab/",
          root: join(root, "packages/movement-encode/vocab"),
        },
      ],
    }),
    startStaticServer({
      root: join(root, "packages/movement-encode/fixtures/corpus"),
      port: ports.corpusSite,
      label: "MvEI corpus screenshot surface",
    }),
    startLtiMockServer(),
  ]);
  try {
    if (!(await withPlaywright())) {
      console.error("falling_back: chrome/chromium headless");
      withChromeHeadless();
    }
    console.log("All alpha runtime screenshots regenerated.");
  } finally {
    await Promise.all(servers.map((server) => new Promise((done) => server.close(done))));
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error("screenshot_failed:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
