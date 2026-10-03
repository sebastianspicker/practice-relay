/** Build the API runtime and place its canonical schema assets beside the bundle. */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const applicationDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceDirectory = resolve(applicationDirectory, "../..");
const outputDirectory = join(applicationDirectory, "dist");
const schemaDirectories = [
  {
    source: join(workspaceDirectory, "packages/work-record/schemas"),
    destination: join(outputDirectory, "schemas/work-record"),
  },
  {
    source: join(workspaceDirectory, "packages/handoff/schemas"),
    destination: join(outputDirectory, "schemas/handoff"),
  },
];

async function main() {
  rmSync(join(outputDirectory, "schemas"), { recursive: true, force: true });
  mkdirSync(outputDirectory, { recursive: true });
  await build({
    entryPoints: [join(applicationDirectory, "src/index.ts")],
    bundle: true,
    format: "esm",
    outfile: join(outputDirectory, "index.mjs"),
    platform: "node",
    target: "node24",
    banner: { js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' },
    external: ["pg-native"],
  });
  for (const schemaDirectory of schemaDirectories) {
    if (!existsSync(schemaDirectory.source)) {
      throw new Error(`canonical schema directory is missing: ${schemaDirectory.source}`);
    }
    cpSync(schemaDirectory.source, schemaDirectory.destination, { recursive: true });
  }
}

await main();
