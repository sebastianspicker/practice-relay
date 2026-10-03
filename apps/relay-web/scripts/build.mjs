/** Stage a self-contained static workspace with its shared browser movement package. */
import { existsSync } from "node:fs";
import { cp, lstat, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const movementRoot = resolve(appRoot, "../../packages/movement");
const repositoryRoot = resolve(appRoot, "../..");
const SCREENSHOT_DIRECTORY = join(repositoryRoot, "docs", "images");

/** Copy the maintained documentation screenshots into the static tour directory. */
export async function stageScreenshotTour(destination) {
  const release = JSON.parse(await readFile(join(repositoryRoot, "release.json"), "utf8"));
  const source = join(SCREENSHOT_DIRECTORY, release.version);
  if (!existsSync(source)) return null;
  const screenshots = (await readdir(source)).filter((name) => name.endsWith(".png"));
  if (screenshots.length === 0) return null;
  const target = join(destination, "screenshots");
  await mkdir(target, { recursive: true });
  for (const name of screenshots) await cp(join(source, name), join(target, name));
  return target;
}

/** Copy the complete browser delivery graph into an explicitly owned output directory. */
export async function buildStaticWorkspace(output = join(appRoot, "dist")) {
  const destination = resolve(output);
  await mkdir(destination, { recursive: true });
  const info = await lstat(destination);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Static output must be a real directory.");
  await cp(join(appRoot, "src"), destination, {
    recursive: true,
    filter: (path) => !path.endsWith("/dev.mjs"),
  });
  await rm(join(destination, "dev.mjs"), { force: true });
  for (const subtree of ["browser", "schemas", "vocabulary", "fixtures/corpus"]) {
    await cp(join(movementRoot, subtree), join(destination, "packages/movement", subtree), { recursive: true });
  }
  await stageScreenshotTour(destination);
  return destination;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(`Static workspace staged: ${await buildStaticWorkspace()}`);
}
