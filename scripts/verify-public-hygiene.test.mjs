/** Public-hygiene unit tests keep local path and skip boundaries fail-closed. */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  findMissingLocalHtmlReferences,
  findUnsafePublicText,
  hasUnconfiguredConfidentialReporting,
  isSkippedPublicPath,
} from "./verify-public-hygiene.mjs";
import { findWorkspacePackageMetadataErrors } from "./workspace-package-metadata.mjs";

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

test("unsafe public text reports local homes and placeholder GitHub URLs", () => {
  const findings = findUnsafePublicText(
    "/Users/alice/work/file /home/bob/repo C:\\Users\\casey\\repo " +
      "https://github.com/local/practiceRelay",
  );
  assert.deepEqual(
    findings.map(({ label }) => label),
    [
      "macOS home path",
      "Linux home path",
      "Windows home path",
      "placeholder GitHub URL",
    ],
  );
});

test("portable repository-relative text is accepted", () => {
  assert.deepEqual(
    findUnsafePublicText("fixtures/demo/motif.json and docs/ALPHA.md"),
    [],
  );
});

test("confidential reporting blockers remain machine-detectable", () => {
  assert.equal(
    hasUnconfiguredConfidentialReporting("Confidential reporting is not configured."),
    true,
  );
  assert.equal(
    hasUnconfiguredConfidentialReporting("Confidential reporting uses GitHub private reports."),
    false,
  );
});

test("protected and local state paths are skipped before reading", () => {
  assert.equal(isSkippedPublicPath(".env"), true);
  assert.equal(isSkippedPublicPath(".env.example"), true);
  assert.equal(isSkippedPublicPath("deploy/secrets/README.md"), true);
  assert.equal(isSkippedPublicPath("deploy/secrets/example/config.txt"), true);
  assert.equal(isSkippedPublicPath("practice-relay/apps/api/.env.local"), true);
  assert.equal(isSkippedPublicPath("practice-relay/data/records.sqlite"), true);
  assert.equal(isSkippedPublicPath("local/server.log"), true);
  assert.equal(isSkippedPublicPath("certificates/signing.pem"), true);
  assert.equal(isSkippedPublicPath("tests/acceptance/node_modules/.bin/tsx"), true);
  assert.equal(isSkippedPublicPath(".serena/project.local.yml"), true);
  assert.equal(
    isSkippedPublicPath("practice-relay/apps/web/src/data/workspace-record.mjs"),
    false,
  );
  assert.equal(isSkippedPublicPath("docs/ALPHA.md"), false);
});

test("workspace package metadata accepts a consistent private alpha set", (context) => {
  const root = mkdtempSync(join(tmpdir(), "practice-relay-package-metadata-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "packages/core"), { recursive: true });
  writeFileSync(root + "/pnpm-workspace.yaml", 'packages:\n  - "packages/*"\n', "utf8");
  writeJson(join(root, "package.json"), {
    name: "practice-relay",
    version: "0.4.0-alpha.1",
    private: true,
    license: "Apache-2.0",
  });
  writeJson(join(root, "packages/core/package.json"), {
    name: "@practice-relay/core",
    version: "0.4.0-alpha.1",
    private: true,
    license: "Apache-2.0",
  });

  assert.deepEqual(
    findWorkspacePackageMetadataErrors(root, "0.4.0-alpha.1"),
    {
      errors: [],
      manifests: ["package.json", "packages/core/package.json"],
    },
  );
});

test("workspace package metadata rejects version, license, privacy, and scope drift", (context) => {
  const root = mkdtempSync(join(tmpdir(), "practice-relay-package-metadata-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "packages/core"), { recursive: true });
  writeFileSync(root + "/pnpm-workspace.yaml", 'packages:\n  - "packages/*"\n', "utf8");
  writeJson(join(root, "package.json"), {
    name: "practice-relay",
    version: "0.4.0-alpha.1",
    private: true,
    license: "Apache-2.0",
  });
  writeJson(join(root, "packages/core/package.json"), {
    name: "@legacy/core",
    version: "0.3.0",
    private: false,
    license: "UNLICENSED",
  });

  assert.deepEqual(
    findWorkspacePackageMetadataErrors(root, "0.4.0-alpha.1").errors,
    [
      "packages/core/package.json version must be 0.4.0-alpha.1",
      "packages/core/package.json license must be Apache-2.0",
      "packages/core/package.json must set private: true",
      "packages/core/package.json name must use the @practice-relay/* scope",
    ],
  );
});

test("HTML snapshot local references resolve from the repository root or source file", (context) => {
  const root = mkdtempSync(join(tmpdir(), "practice-relay-html-refs-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const gallery = join(root, "docs/images/release");
  const source = join(gallery, "surface.html");
  mkdirSync(join(root, "assets"), { recursive: true });
  mkdirSync(gallery, { recursive: true });
  writeFileSync(join(root, "assets/app.mjs"), "export {};\n", "utf8");
  assert.deepEqual(
    findMissingLocalHtmlReferences(
      '<a href="#main">Skip</a><img src="//cdn.example/app.png"><a href="mailto:team@example.test">Contact</a><link href="/assets/app.mjs?cache=1#bundle"><script src="../../../assets/app.mjs"></script>',
      source,
      root,
    ),
    [],
  );
});

test("HTML snapshot references reject missing and out-of-root local targets", (context) => {
  const root = mkdtempSync(join(tmpdir(), "practice-relay-html-refs-"));
  const prefixSibling = `${root}-outside`;
  context.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(prefixSibling, { recursive: true, force: true });
  });
  const gallery = join(root, "docs/images/release");
  const source = join(gallery, "surface.html");
  mkdirSync(gallery, { recursive: true });
  mkdirSync(prefixSibling, { recursive: true });
  writeFileSync(join(prefixSibling, "outside.png"), "outside\n", "utf8");
  symlinkSync(join(prefixSibling, "outside.png"), join(gallery, "linked.png"));
  assert.deepEqual(
    findMissingLocalHtmlReferences(
      '<link href="./missing.css"><img src="../../../../outside.png"><script src="/../outside.mjs"><img src="../../../../' +
        `${prefixSibling.split("/").at(-1)}/outside.png` +
        '"><img src="./linked.png">',
      source,
      root,
    ),
    [
      "./missing.css",
      "../../../../outside.png",
      "/../outside.mjs",
      `../../../../${prefixSibling.split("/").at(-1)}/outside.png`,
      "./linked.png",
    ],
  );
});

test("HTML snapshot references preserve root and raw percent-encoded path behavior", (context) => {
  const root = mkdtempSync(join(tmpdir(), "practice-relay-html-refs-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, "surface.html");
  writeFileSync(join(root, "%2e%2e.css"), "literal path\n", "utf8");

  assert.deepEqual(
    findMissingLocalHtmlReferences('<a href="/"></a><link href="./%2e%2e.css">', source, root),
    [],
  );
});
