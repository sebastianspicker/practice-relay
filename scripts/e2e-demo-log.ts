/** Stable text-log rendering for E2E evidence, apart from its timestamp. */
import type { DemoStep } from "./e2e-demo-types.ts";

function formatDataValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function formatStep(step: DemoStep): string[] {
  const lines = [`[${step.ok ? "OK" : "FAIL"}] ${step.id}: ${step.detail}`];
  for (const [key, value] of Object.entries(step.data ?? {})) {
    lines.push(`  ${key}=${formatDataValue(value)}`);
  }
  return lines;
}

/** Render the exact human-readable E2E log format for completed steps. */
export function formatLog(demoDir: string, steps: DemoStep[]): string {
  const lines = [
    "# Practice Relay alpha e2e demo log",
    `time: ${new Date().toISOString()}`,
    `demo_dir: ${demoDir}`,
    "",
    ...steps.flatMap(formatStep),
    "",
    `summary: ${steps.every((step) => step.ok ? true : false) ? "all steps ok" : "one or more steps failed"}`,
    `step_count: ${steps.length}`,
  ];
  return `${lines.join("\n")}\n`;
}
