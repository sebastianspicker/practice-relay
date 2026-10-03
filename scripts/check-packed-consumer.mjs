/**
 * Verify the published movement packages work for an isolated Node consumer.
 *
 * Why: workspace links can hide omitted files or broken package exports. This
 * check creates workspace-aware pnpm tarballs, installs only those tarballs
 * offline in a temporary consumer, and exercises its declarations and bins.
 *
 * Usage: node scripts/check-packed-consumer.mjs
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageSpecs = [
  { name: "@practice-relay/movement", directory: "packages/movement" },
  { name: "@practice-relay/movement-toolkit", directory: "packages/movement-toolkit" },
];
const runtimeDependencyNames = [
  "ajv",
  "ajv-formats",
  "fast-deep-equal",
  "fast-uri",
  "json-schema-traverse",
  "require-from-string",
];
const localRequire = createRequire(import.meta.url);
const expectedToolkitBins = [
  "mvei-validate",
  "mvei-engrave",
  "mvei-labanwriter-import",
  "mvei-reference-read",
];

function assertNodeVersion() {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "", 10);
  assert.ok(major === 24, "check:packages requires the Node.js 24 baseline");
}

function commandLine(command, args) {
  return [command, ...args].map((part) => JSON.stringify(part)).join(" ");
}

function execute(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error) throw result.error;
  return result;
}

function run(command, args, options = {}) {
  const result = execute(command, args, options);
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${commandLine(command, args)} failed${output ? `:\n${output}` : ""}`);
  }
  return result;
}

function pathEscapes(base, candidate) {
  const path = relative(base, candidate);
  return path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path);
}

function readTarballFile(tarball, path) {
  return run("tar", ["-xOzf", tarball, path]).stdout;
}

function assertPackedTextIsPortable(contents, description) {
  assert.doesNotMatch(contents, /workspace:/u, `${description} retains a workspace protocol`);
  for (const forbiddenPath of [root, ...packageSpecs.map(({ directory }) => resolve(root, directory))]) {
    assert.ok(!contents.includes(forbiddenPath), `${description} contains repository path ${forbiddenPath}`);
  }
  assert.doesNotMatch(
    contents,
    /(?:^|["'])\.\.?[/\\](?:src|packages)[/\\]/mu,
    `${description} contains a repository source path`,
  );
}

function inspectTarball(packageSpec, tarball) {
  const paths = run("tar", ["-tzf", tarball]).stdout.trim().split("\n").filter(Boolean);
  assert.ok(paths.length > 0, `${packageSpec.name} tarball is empty`);
  assert.ok(paths.every((path) => path.startsWith("package/")), `${packageSpec.name} tarball has an invalid root`);
  assert.ok(!paths.some((path) => path.startsWith("package/src/")), `${packageSpec.name} tarball contains source files`);
  assert.ok(
    !paths.some((path) => /\.tsx?$/u.test(path) && !/\.d\.tsx?$/u.test(path)),
    `${packageSpec.name} tarball contains TypeScript source`,
  );
  assert.ok(paths.includes("package/package.json"), `${packageSpec.name} tarball lacks package.json`);

  const manifestText = readTarballFile(tarball, "package/package.json");
  assertPackedTextIsPortable(manifestText, `${packageSpec.name} packed manifest`);
  const manifest = JSON.parse(manifestText);
  const declarations = paths.filter((path) => /\.d\.(?:ts|mts)$/u.test(path));
  assert.ok(declarations.length > 0, `${packageSpec.name} tarball lacks declarations`);
  for (const declaration of declarations) {
    assertPackedTextIsPortable(
      readTarballFile(tarball, declaration),
      `${packageSpec.name} packed declaration ${declaration}`,
    );
  }
  return manifest;
}

function packageFromTarball(packageSpec, tarballsDirectory) {
  const packageDirectory = join(root, packageSpec.directory);
  const output = run(
    "pnpm",
    ["--dir", packageDirectory, "pack", "--pack-destination", tarballsDirectory, "--json"],
    { cwd: root },
  ).stdout;
  const packed = JSON.parse(output);
  assert.equal(packed.name, packageSpec.name, `pnpm pack must report ${packageSpec.name}`);
  assert.equal(typeof packed.filename, "string", `pnpm pack must report ${packageSpec.name} filename`);
  const tarball = resolve(tarballsDirectory, packed.filename);
  assert.ok(!pathEscapes(tarballsDirectory, tarball), "pnpm pack tarball escapes temporary directory");
  assert.ok(existsSync(tarball), `missing ${packageSpec.name} tarball`);
  return { tarball, manifest: inspectTarball(packageSpec, tarball) };
}

function packageInstalledDependency(name, tarballsDirectory) {
  let packageDirectory;
  try {
    packageDirectory = dirname(localRequire.resolve(`${name}/package.json`));
  } catch {
    const storeDirectory = join(root, "node_modules", ".pnpm");
    packageDirectory = readdirSync(storeDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(storeDirectory, entry.name, "node_modules", name))
      .find((candidate) => existsSync(join(candidate, "package.json")));
  }
  assert.equal(typeof packageDirectory, "string", `cannot find installed runtime dependency ${name}`);
  const output = run(
    "npm",
    ["pack", `file:${packageDirectory}`, "--ignore-scripts", "--pack-destination", tarballsDirectory, "--json"],
    { cwd: root },
  ).stdout;
  const packed = JSON.parse(output);
  assert.equal(packed.length, 1, `npm pack must produce one ${name} tarball`);
  assert.equal(packed[0]?.name, name, `npm pack must report ${name}`);
  assert.equal(typeof packed[0]?.filename, "string", `npm pack must report ${name} filename`);
  const tarball = resolve(tarballsDirectory, packed[0].filename);
  assert.ok(!pathEscapes(tarballsDirectory, tarball), `${name} tarball escapes temporary directory`);
  assert.ok(existsSync(tarball), `missing ${name} tarball`);
  return { name, tarball };
}

function writeConsumerManifest(consumerDirectory, tarballs) {
  const relativeTarball = (tarball) => `file:${relative(consumerDirectory, tarball)}`;
  writeFileSync(
    join(consumerDirectory, "package.json"),
    `${JSON.stringify(
      {
        name: "practice-relay-packed-consumer-probe",
        private: true,
        type: "module",
        dependencies: Object.fromEntries(tarballs.map(({ name, tarball }) => [name, relativeTarball(tarball)])),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  writeFileSync(
    join(consumerDirectory, "pnpm-workspace.yaml"),
    `packages:\n  - .\noverrides:\n${tarballs.map(({ name, tarball }) => `  '${name}': ${relativeTarball(tarball)}`).join("\n")}\n`,
    "utf8",
  );
}

function installConsumer(consumerDirectory) {
  const environment = { ...process.env };
  delete environment.PNPM_PACKAGE_NAME;
  delete environment.npm_command;
  delete environment.npm_config_manage_package_manager_versions;
  delete environment.npm_config_user_agent;
  environment.PATH = (environment.PATH ?? "")
    .split(delimiter)
    .filter((path) => !/[/\\]links[/\\]@[/\\]pnpm[/\\]/u.test(path))
    .join(delimiter);
  run(
    "pnpm",
    [
      "install",
      "--offline",
      "--ignore-scripts",
      "--no-frozen-lockfile",
      "--config.audit=false",
      "--config.fund=false",
    ],
    {
      cwd: consumerDirectory,
      env: environment,
    },
  );
}

function assertNoRepositorySymlinks(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      assert.ok(
        pathEscapes(root, realpathSync(target)),
        `consumer node_modules symlink points into repository: ${target}`,
      );
      continue;
    }
    if (entry.isDirectory()) assertNoRepositorySymlinks(target);
  }
}

function assertInstalledPackagesAreIsolated(consumerDirectory) {
  const consumerRequire = createRequire(join(consumerDirectory, "package.json"));
  for (const { name } of packageSpecs) {
    const installedManifest = consumerRequire.resolve(`${name}/package.json`);
    assert.ok(
      pathEscapes(root, realpathSync(installedManifest)),
      `${name} resolves from the repository instead of the isolated consumer`,
    );
  }
  assertNoRepositorySymlinks(join(consumerDirectory, "node_modules"));
}

function writeImportProbes(consumerDirectory) {
  const runtimeProbe = join(consumerDirectory, "imports.mjs");
  const typeProbe = join(consumerDirectory, "imports.ts");
  const imports = `import * as movement from "@practice-relay/movement";
import * as glyphs from "@practice-relay/movement/glyphs";
import * as toolkit from "@practice-relay/movement-toolkit";
import * as capture from "@practice-relay/movement-toolkit/capture";
import * as engraver from "@practice-relay/movement-toolkit/engraver";
import * as labanwriter from "@practice-relay/movement-toolkit/labanwriter-import";
import * as reader from "@practice-relay/movement-toolkit/reference-reader";
import * as validator from "@practice-relay/movement-toolkit/validator";
`;
  writeFileSync(typeProbe, `${imports}\nvoid [movement, glyphs, toolkit, capture, engraver, labanwriter, reader, validator];\n`, "utf8");
  writeFileSync(
    join(consumerDirectory, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          module: "NodeNext",
          moduleResolution: "NodeNext",
          noEmit: true,
          skipLibCheck: false,
          strict: true,
          target: "ES2022",
        },
        files: ["imports.ts"],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  writeFileSync(
    runtimeProbe,
    `import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
${imports}
const require = createRequire(import.meta.url);
for (const specifier of [
  "@practice-relay/movement/package.json",
  "@practice-relay/movement/schemas/mvei-motif.schema.json",
  "@practice-relay/movement/fixtures/corpus/motif-sketch-01.json",
  "@practice-relay/movement-toolkit/package.json",
  "@practice-relay/movement-toolkit/fixtures/labanwriter-import/lw-intermediate-01.json",
]) {
  const path = require.resolve(specifier);
  assert.ok(JSON.parse(readFileSync(path, "utf8")), specifier);
}
assert.equal(movement.PACKAGE, "@practice-relay/movement");
assert.equal(typeof movement.motifToLabanSubset, "function");
assert.match(glyphs.renderGlyphSvg("walk"), /<svg/);
assert.equal(typeof toolkit.landmarksToAnnotation, "function");
assert.equal(typeof capture.annotationToMotifSketch, "function");
assert.equal(typeof engraver.renderMotifToSvg, "function");
assert.equal(typeof labanwriter.importLabanWriterIntermediate, "function");
assert.equal(typeof reader.readMotifSummaryText, "function");
assert.equal(typeof validator.validateMveiDocument, "function");
`,
    "utf8",
  );
  return runtimeProbe;
}

function runInstalledBin(consumerDirectory, name, args) {
  const result = executeInstalledBin(consumerDirectory, name, args);
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(
      `${name} failed${output ? `:\n${output}` : ""}`,
    );
  }
  return result;
}

function executeInstalledBin(consumerDirectory, name, args) {
  const executable = join(consumerDirectory, "node_modules", ".bin", name);
  assert.ok(existsSync(executable), `${name} is absent from installed .bin`);
  assert.ok(
    pathEscapes(root, realpathSync(executable)),
    `${name} installed .bin resolves into the repository`,
  );
  return execute(executable, args, { cwd: consumerDirectory });
}

function runCliProbes(consumerDirectory) {
  const require = createRequire(join(consumerDirectory, "imports.mjs"));
  const motif = require.resolve("@practice-relay/movement/fixtures/corpus/motif-sketch-01.json");
  const intermediate = require.resolve(
    "@practice-relay/movement-toolkit/fixtures/labanwriter-import/lw-intermediate-01.json",
  );
  const outputDirectory = join(consumerDirectory, "output");
  mkdirSync(outputDirectory);

  const validationUsage = executeInstalledBin(consumerDirectory, "mvei-validate", []);
  assert.equal(validationUsage.status, 2);
  assert.equal(validationUsage.stdout, "");
  assert.equal(validationUsage.stderr, "Usage: mvei-validate <file.json>\n");
  runInstalledBin(consumerDirectory, "mvei-validate", [motif]);
  const svg = join(outputDirectory, "motif.svg");
  const engraved = runInstalledBin(consumerDirectory, "mvei-engrave", [motif, svg]);
  assert.ok(
    existsSync(svg),
    `mvei-engrave did not create output: ${[engraved.stdout, engraved.stderr].filter(Boolean).join(" ")}`,
  );
  assert.match(readFileSync(svg, "utf8"), /^<\?xml version="1\.0"/);
  const laban = join(outputDirectory, "laban.json");
  runInstalledBin(consumerDirectory, "mvei-labanwriter-import", [intermediate, laban]);
  assert.equal(JSON.parse(readFileSync(laban, "utf8")).profile, "mvei-laban-subset");
  const reference = runInstalledBin(consumerDirectory, "mvei-reference-read", [motif]);
  assert.match(reference.stdout, /^MvEI Motif summary \(reference-reader/);
  const referenceUsage = executeInstalledBin(
    consumerDirectory,
    "mvei-reference-read",
    [],
  );
  assert.equal(referenceUsage.status, 2);
  assert.equal(referenceUsage.stdout, "");
  assert.equal(
    referenceUsage.stderr,
    "Usage: mvei-reference-read <motif.json>\n",
  );
  const invalid = join(outputDirectory, "invalid.json");
  writeFileSync(invalid, "{}", "utf8");
  const validationFailure = executeInstalledBin(
    consumerDirectory,
    "mvei-validate",
    [invalid],
  );
  assert.equal(validationFailure.status, 1);
  assert.match(validationFailure.stderr, /Unknown document type/);
}

function main() {
  assertNodeVersion();
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "practice-relay-packed-consumer-"));
  try {
    const tarballsDirectory = join(temporaryDirectory, "tarballs");
    const consumerDirectory = join(temporaryDirectory, "consumer");
    mkdirSync(tarballsDirectory, { recursive: true });
    mkdirSync(consumerDirectory, { recursive: true });

    const tarballs = packageSpecs.map((packageSpec) => ({
      ...packageSpec,
      ...packageFromTarball(packageSpec, tarballsDirectory),
    }));
    tarballs.push(...runtimeDependencyNames.map((name) => packageInstalledDependency(name, tarballsDirectory)));
    const movement = tarballs.find(({ name }) => name === "@practice-relay/movement");
    const toolkit = tarballs.find(({ name }) => name === "@practice-relay/movement-toolkit");
    assert.ok(movement && toolkit, "both movement tarballs must be created");
    assert.equal(
      toolkit.manifest.dependencies?.[movement.name],
      movement.manifest.version,
      "workspace dependency must pack as the concrete movement version",
    );
    assert.deepEqual(Object.keys(toolkit.manifest.bin ?? {}).sort(), [...expectedToolkitBins].sort());

    writeConsumerManifest(consumerDirectory, tarballs);
    installConsumer(consumerDirectory);
    assertInstalledPackagesAreIsolated(consumerDirectory);
    const runtimeProbe = writeImportProbes(consumerDirectory);
    run(join(root, "node_modules", ".bin", "tsc"), ["--project", "tsconfig.json"], { cwd: consumerDirectory });
    run(process.execPath, [runtimeProbe], { cwd: consumerDirectory });
    runCliProbes(consumerDirectory);
    console.log("OK packed movement and movement-toolkit isolated consumer checks");
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}

main();
