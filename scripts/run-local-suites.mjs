/**
 * Run the maintainer-local test suites that are kept out of the published tree.
 * Why: those directories are gitignored, so `pnpm -r run test` never sees them;
 * a fresh clone reports each one as skipped instead of failing.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Each local suite: its workspace, its gitignored test directory, and its run command. */
export const LOCAL_SUITES = [
  { workspace: "packages/work-record", tests: "tests", command: "node --import tsx --test tests/*.test.ts" },
  { workspace: "packages/handoff", tests: "tests", command: "node --import tsx --test tests/*.test.ts" },
  { workspace: "packages/movement", tests: "tests", command: "node scripts/generate-motif-contract.mjs --check && node --import tsx --test tests/*.test.ts" },
  { workspace: "packages/movement-toolkit", tests: "tests", command: "node --import tsx --test tests/*.test.*" },
  { workspace: "apps/relay-web", tests: "test", command: "node --test test/*.verify.mjs && node --import tsx --test test/role-parity.test.mjs" },
  { workspace: "apps/lti-simulator", tests: "test", command: "node --test test/*.verify.mjs" },
  { workspace: "apps/movement-workbench", tests: "test", command: "node --test test/*.verify.mjs" },
  { workspace: "apps/movement-schema-site", tests: "test", command: "node --import tsx --test test/*.verify.mjs" },
];

/** Split suites into those present in this checkout and those to report as skipped. */
export function selectLocalSuites(root, exists = existsSync) {
  const present = LOCAL_SUITES.filter((suite) => exists(join(root, suite.workspace, suite.tests)));
  return { present, skipped: LOCAL_SUITES.filter((suite) => !present.includes(suite)) };
}

/** Run every present suite and return the workspaces that failed. */
function runLocalSuites(root) {
  const { present, skipped } = selectLocalSuites(root);
  for (const suite of skipped) console.log(`check:local: skipped ${suite.workspace} (no ${suite.tests}/ in this checkout)`);
  return present
    .filter((suite) => {
      console.log(`check:local: ${suite.workspace}`);
      return spawnSync(suite.command, { cwd: join(root, suite.workspace), shell: true, stdio: "inherit" }).status !== 0;
    })
    .map((suite) => suite.workspace);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const failed = runLocalSuites(join(dirname(fileURLToPath(import.meta.url)), ".."));
  if (failed.length > 0) {
    console.error(`check:local: failed in ${failed.join(", ")}`);
    process.exitCode = 1;
  }
}
