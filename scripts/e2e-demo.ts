/**
 * Practice Relay alpha e2e demo - drives shipped entry points only.
 *
 * Scenario: fixtures/demo (multi-asset WorkRecord + MvEI Motif).
 * Steps: Practice Relay lifecycle → WorkRecord package + RO-Crate export → multi-asset assignment →
 *        Motif validate accept/reject → MvEI Workbench load/emit/edit of the same Motif.
 *
 * Usage:
 *   pnpm demo:e2e
 *   pnpm demo:e2e -- --log fixtures/demo/last-e2e-demo.txt
 *
 * Exports runE2eDemo() for acceptance tests (no process.exit when imported).
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { writeContainedText } from "./contained-output.mjs";
import { DEMO_DIR, loadSeed, root } from "./e2e-demo-fixtures.ts";
import { formatLog } from "./e2e-demo-log.ts";
export { buildDemoScoreFromSeed } from "./e2e-demo-record.ts";
import {
  runInvalidMotifValidation,
  runLifecycle,
  runMultiAssetAssignment,
  runPackageExport,
  runValidMotifValidation,
  runWorkbenchLoadEmit,
  runWorkbenchMotifEdit,
} from "./e2e-demo-scenario.ts";
export type { DemoResult, DemoStep } from "./e2e-demo-types.ts";
import type { DemoResult, DemoStep } from "./e2e-demo-types.ts";

function complete(steps: DemoStep[], logPath?: string): DemoResult {
  const logText = formatLog(DEMO_DIR, steps);
  if (logPath) {
    writeContainedText(root, logPath, logText);
  }
  return { ok: steps.every((step) => step.ok), steps, logText };
}

/**
 * Run the full e2e demo against shipped modules.
 * Writes structured log when logPath is set.
 */
export function runE2eDemo(opts: { logPath?: string } = {}): DemoResult {
  const steps: DemoStep[] = [];
  const lifecycle = runLifecycle(loadSeed());
  steps.push(lifecycle.step);
  if (!("score" in lifecycle)) return complete(steps, opts.logPath);

  const { score } = lifecycle;
  steps.push(runPackageExport(score));
  steps.push(runMultiAssetAssignment(score));
  steps.push(runValidMotifValidation());
  steps.push(runInvalidMotifValidation());
  steps.push(runWorkbenchLoadEmit());
  steps.push(runWorkbenchMotifEdit());
  return complete(steps, opts.logPath);
}

function parseLogArg(argv: string[]): string | undefined {
  const i = argv.indexOf("--log");
  if (i >= 0 && argv[i + 1]) return resolve(argv[i + 1]);
  const eq = argv.find((arg) => arg.startsWith("--log="));
  if (eq) return resolve(eq.slice("--log=".length));
  return undefined;
}

function main(): void {
  const logPath = parseLogArg(process.argv.slice(2));
  const result = runE2eDemo(logPath ? { logPath } : {});
  process.stdout.write(result.logText);
  if (logPath) console.log(`log written: ${logPath}`);
  process.exit(result.ok ? 0 : 1);
}

const entryHref = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (import.meta.url === entryHref) {
  main();
}
