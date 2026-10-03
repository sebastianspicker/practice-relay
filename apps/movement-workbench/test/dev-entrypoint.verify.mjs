/** Exercise the Workbench development entrypoint without changing its shipped HTML. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadDemoMotif, renderShellHtml } from "../src/shell.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const workbenchDirectory = dirname(testDirectory);
const sourceDirectory = join(workbenchDirectory, "src");
const entrypoint = join(sourceDirectory, "dev.mjs");
const indexPath = join(sourceDirectory, "index.html");
const vocabularyPath = join(
  workbenchDirectory,
  "../../packages/movement/vocabulary/motif-vocabulary.json",
);
const readinessTimeoutMs = 10_000;

function temporaryOutputs(directory) {
  return readdirSync(directory)
    .filter((name) => name.startsWith(".contained-output-"))
    .sort();
}

function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const reservation = createServer();
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", () => {
      const address = reservation.address();
      if (!address || typeof address === "string") {
        reservation.close();
        reject(new Error("unable to reserve a loopback port"));
        return;
      }
      reservation.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

function waitForReadiness(child, expectedUrl, output) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Workbench dev server did not announce ${expectedUrl}: ${output.stdout}${output.stderr}`));
    }, readinessTimeoutMs);
    const settle = (callback) => (value) => {
      clearTimeout(timeout);
      child.off("error", onError);
      child.off("exit", onExit);
      callback(value);
    };
    const ready = settle(resolve);
    const failed = settle(reject);
    const onOutput = () => {
      if (output.stdout.includes(expectedUrl)) ready();
    };
    const onError = (error) => failed(error);
    const onExit = (code, signal) => {
      failed(new Error(`Workbench dev server exited before readiness (code ${code}, signal ${signal}): ${output.stderr}`));
    };
    child.stdout.on("data", onOutput);
    child.once("error", onError);
    child.once("exit", onExit);
    onOutput();
  });
}

function waitForChildExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true);
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeout;
    const cleanup = () => {
      clearTimeout(timeout);
      child.off("close", onExit);
      child.off("error", onError);
      child.off("exit", onExit);
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const onExit = () => finish(resolve, true);
    const onError = (error) => finish(reject, error);
    child.once("close", onExit);
    child.once("error", onError);
    child.once("exit", onExit);
    timeout = setTimeout(() => finish(resolve, false), readinessTimeoutMs);
    if (child.exitCode !== null || child.signalCode !== null) finish(resolve, true);
  });
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  if (await waitForChildExit(child)) return;
  child.kill("SIGKILL");
  if (await waitForChildExit(child)) return;
  throw new Error("Workbench dev server did not stop after SIGTERM and SIGKILL");
}

async function fetchBytes(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(readinessTimeoutMs) });
  assert.equal(response.status, 200, `${url} status`);
  return Buffer.from(await response.arrayBuffer());
}

test("Workbench dev entrypoint preserves HTML and serves loopback assets", async (t) => {
  const source = readFileSync(entrypoint, "utf8");
  assert.doesNotMatch(source, /writeFileSync/);
  assert.doesNotMatch(source, /readContainedText/);
  assert.match(source, /renderShellHtml/);
  assert.match(source, /writeContainedText/);
  assert.match(source, /env\.MVEI_WORKBENCH_PORT \?\? 5175/);
  assert.ok(
    source.includes('String(value).replaceAll(/[\\r\\n]/g, "")'),
    "status helper neutralizes carriage returns and newlines",
  );
  assert.match(source, /stdout\.write/);

  const indexBefore = readFileSync(indexPath);
  const modeBefore = statSync(indexPath).mode & 0o777;
  const temporaryOutputsBefore = temporaryOutputs(sourceDirectory);
  const vocabularyBefore = readFileSync(vocabularyPath);
  const motif = loadDemoMotif();
  assert.deepEqual(
    Buffer.from(renderShellHtml(motif)),
    indexBefore,
    "freshly rendered Workbench HTML bytes",
  );

  await t.test("real loopback server", async (serverTest) => {
    let port;
    try {
      port = await reserveLoopbackPort();
    } catch (error) {
      if (error?.code === "EPERM" || error?.code === "EACCES") {
        serverTest.skip(`loopback bind unavailable: ${error.code}`);
        return;
      }
      throw error;
    }
    const expectedUrl = `http://127.0.0.1:${port}/`;
    const output = { stdout: "", stderr: "" };
    let child;

    try {
      child = spawn(process.execPath, [entrypoint], {
        cwd: workbenchDirectory,
        env: { ...process.env, MVEI_WORKBENCH_PORT: String(port) },
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        output.stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        output.stderr += chunk;
      });

      await waitForReadiness(child, expectedUrl, output);
      const pageBytes = await fetchBytes(expectedUrl);
      assert.deepEqual(pageBytes, indexBefore, "root HTML bytes");
      assert.match(
        pageBytes.toString("utf8"),
        /"@practice-relay\/movement\/browser":"\/packages\/movement\/browser\/index\.mjs"/,
        "browser parser import map",
      );
      assert.deepEqual(
        await fetchBytes(`${expectedUrl}packages/movement/vocabulary/motif-vocabulary.json`),
        vocabularyBefore,
        "mounted vocabulary bytes",
      );
      assert.match(
        (await fetchBytes(`${expectedUrl}packages/movement/browser/parser.mjs`)).toString("utf8"),
        /parseMovementDocument/,
        "mounted browser parser module",
      );
      assert.equal(output.stderr, "", "development server stderr");
      assert.equal(output.stdout.includes("\r"), false, "status output carriage returns");
      assert.deepEqual(output.stdout.split("\n").slice(0, 7), [
        "MvEI Workbench Motif editor: authoring UI for MvEI (Movement Encoding Initiative) Motif documents.",
        "Partial Motif documents must validate against the current schema.",
        "Brand: MvEI Workbench · Standard: MvEI (Movement Encoding Initiative).",
        "",
        `MvEI Workbench Motif surface written: ${indexPath}`,
        `Standard: MvEI (Movement Encoding Initiative) · Motif id: ${motif.id} · items: ${motif.items.length}`,
        `MvEI Workbench: ${expectedUrl}`,
      ], "banner and sanitized dynamic status output");
    } finally {
      if (child) await stopChild(child);
    }
  });
  assert.deepEqual(readFileSync(indexPath), indexBefore, "preserved root HTML bytes");
  assert.equal(statSync(indexPath).mode & 0o777, modeBefore, "preserved root HTML mode");
  assert.deepEqual(
    temporaryOutputs(sourceDirectory),
    temporaryOutputsBefore,
    "contained publication residue",
  );
});
