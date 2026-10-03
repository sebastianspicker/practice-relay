/** Deterministic verification for maintained documentation command checks. */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkDocCommands, listMaintainedDocFiles } from "./check-doc-commands.mjs";

function write(root, path, contents) {
  const target = join(root, path);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, contents, "utf8");
}

function verifyFixture() {
  const root = mkdtempSync(join(tmpdir(), "practice-relay-doc-commands-"));
  try {
    write(root, "package.json", JSON.stringify({ scripts: { "check:docs": "node docs.js", "check:all": "pnpm check:docs" } }));
    write(root, "apps/relay-web/package.json", JSON.stringify({ name: "@practice-relay/relay-web" }));
    write(root, "packages/work-record/package.json", JSON.stringify({ name: "@practice-relay/work-record" }));
    write(root, "README.md", "Run `pnpm check:docs` and `pnpm --filter @practice-relay/relay-web dev`.\n");
    write(root, "docs/guide.md", "Run `pnpm release:check` and see `@practice-relay/work-record`.\n");
    write(root, ".github/PULL_REQUEST_TEMPLATE.md", "Use `@practice-relay/movement-encode` and `packages/movement-encode`.\n");
    write(root, ".github/ISSUE_TEMPLATE/feature_request.yml", "description: '`pnpm run check:all`'\n");

    assert.equal(listMaintainedDocFiles(root).length, 4, "fixture maintained file count");
    const result = checkDocCommands({ root });
    assert.equal(result.filesChecked, 4, "fixture checked file count");
    assert.equal(result.commandsChecked, 3, "fixture root command count");
    assert.equal(result.packageReferencesChecked, 3, "fixture package reference count");
    assert.deepEqual(
      result.findings
        .map(({ kind, value }) => ({ kind, value }))
        .sort((left, right) => `${left.kind}:${left.value}`.localeCompare(`${right.kind}:${right.value}`)),
      [
        { kind: "root-script", value: "release:check" },
        { kind: "package-name", value: "@practice-relay/movement-encode" },
        { kind: "package-path", value: "packages/movement-encode" },
      ].sort((left, right) => `${left.kind}:${left.value}`.localeCompare(`${right.kind}:${right.value}`)),
      "fixture stale references",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function verifyRepository() {
  const result = checkDocCommands({ root: join(dirname(fileURLToPath(import.meta.url)), "..") });
  assert.equal(result.findings.length, 0, "repository maintained docs are current");
}

verifyFixture();
verifyRepository();
console.log("Doc command checker verification passed.");
