/**
 * Shared maturity-check process helpers.
 *
 * This isolates repository I/O and command execution so scorecard rules remain
 * declarative and retain the same local-only evidence boundary.
 */
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { delimiter, join } from "node:path";
import { relative } from "node:path";
import { isProtectedRepositoryPath } from "./protected-paths.mjs";
import {
  readRepositoryText,
  resolveExistingRepositoryPath,
} from "./repository-files.mjs";

function deterministicChildEnv(root) {
  const env = {
    PATH: `${join(root, "node_modules", ".bin")}${delimiter}${process.env.PATH ?? ""}`,
    NODE_PATH: join(root, "node_modules"),
  };
  for (const name of ["CI", "LANG", "LC_ALL", "NO_COLOR", "TEMP", "TMP", "TMPDIR", "TZ"]) {
    if (process.env[name] !== undefined) env[name] = process.env[name];
  }
  return env;
}

const ROOT_SCRIPT_COMMANDS = Object.freeze({
  "demo:pilot-dry-run": Object.freeze([
    process.execPath,
    Object.freeze(["--import", "tsx", "scripts/pilot-dry-run.mjs"]),
  ]),
  "publish:dry-run": Object.freeze([
    process.execPath,
    Object.freeze(["scripts/publish-dry-run.mjs"]),
  ]),
  "test:kill-switches": Object.freeze([
    process.execPath,
    Object.freeze(["scripts/assert-kill-switches.mjs"]),
  ]),
  "test:lab-only-claims": Object.freeze([
    process.execPath,
    Object.freeze(["scripts/assert-lab-only-procurement.mjs"]),
  ]),
  "test:ops-restore": Object.freeze([
    process.execPath,
    Object.freeze(["--import", "tsx", "scripts/ops-restore-drill.mjs"]),
  ]),
  "test:ops-slo": Object.freeze([
    process.execPath,
    Object.freeze(["--import", "tsx", "scripts/ops-slo-check.mjs", "--unit"]),
  ]),
  "test:osc-stage": Object.freeze([
    process.execPath,
    Object.freeze(["--import", "tsx", "scripts/osc-stage-validate.mjs"]),
  ]),
  "validate:schemas": Object.freeze([
    process.execPath,
    Object.freeze(["--import", "tsx", "scripts/validate-schemas.ts"]),
  ]),
});

/** Run one fixed maturity gate after confirming its manifest declaration exists. */
export function runRootScript({ root, scripts, script, timeoutMs = 180000 }) {
  const manifestCommand = scripts?.[script];
  const command = ROOT_SCRIPT_COMMANDS[script];
  if (
    !command ||
    typeof manifestCommand !== "string" ||
    !manifestCommand.trim()
  ) {
    return { ok: false, out: `missing root script: ${script}`, status: 1 };
  }
  const [executable, args] = command;
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    timeout: timeoutMs,
    env: deterministicChildEnv(root),
    shell: false,
  });
  return {
    ok: result.status === 0,
    out: `${result.stdout || ""}${result.stderr || ""}`,
    status: result.status ?? 1,
  };
}

/** Execute an inline TypeScript-aware functional probe from the repository root. */
export function runTsx({ root, code, timeoutMs = 60000 }) {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", code],
    {
      cwd: root,
      encoding: "utf8",
      timeout: timeoutMs,
      env: deterministicChildEnv(root),
    },
  );
  return {
    ok: result.status === 0,
    out: `${result.stdout || ""}${result.stderr || ""}`.trim(),
    status: result.status ?? 1,
  };
}

/** Load declared root scripts once so functional gates match package entrypoints. */
export function readRootScripts({ root }) {
  return JSON.parse(readRepositoryText(root, "package.json")).scripts;
}

function collectSourceFiles({ root, directory, files = [] }) {
  const { absolute, info } = resolveExistingRepositoryPath(root, directory);
  if (!info.isDirectory()) throw new Error("repository source path is not a directory");
  for (const entry of readdirSync(absolute, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(absolute, entry.name);
    const relativePath = relative(root, path).replaceAll("\\", "/");
    if (entry.isSymbolicLink() || isProtectedRepositoryPath(relativePath)) continue;
    if (entry.isDirectory()) {
      if (entry.name !== "dist" && entry.name !== "generated") {
        collectSourceFiles({ root, directory: path, files });
      }
    } else if (/\.(?:mjs|ts)$/.test(entry.name) && !/\.(?:test|spec)\.(?:mjs|ts)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      files.push(path);
    }
  }
  return files;
}

/** Read an ordered, non-generated source family so facade splits retain structural evidence. */
export function readSourceFamily({ root, relativeDirectory }) {
  const directory = join(root, relativeDirectory);
  return collectSourceFiles({ root, directory })
    .map((path) => readRepositoryText(root, path))
    .join("\n");
}
