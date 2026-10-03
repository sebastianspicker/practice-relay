/** Deterministic verification for the repository boundary checker. */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkBoundaries } from "./check-boundaries.mjs";

function write(root, path, contents) {
  const target = join(root, path);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, contents, "utf8");
}

function baseFixture() {
  const root = mkdtempSync(join(tmpdir(), "practice-relay-boundaries-"));
  write(root, "apps/relay-api/package.json", '{"name":"@practice-relay/relay-api","dependencies":{"@practice-relay/work-record":"workspace:*"}}');
  write(root, "packages/work-record/package.json", '{"name":"@practice-relay/work-record"}');
  for (const packageName of ["handoff", "record-store"]) {
    write(root, `packages/${packageName}/package.json`, `{"name":"@practice-relay/${packageName}","dependencies":{"@practice-relay/work-record":"workspace:*"}}`);
  }
  write(root, "packages/movement-toolkit/package.json", '{"name":"@practice-relay/movement-toolkit","dependencies":{"@practice-relay/movement":"workspace:*"}}');
  write(root, "packages/lti/package.json", '{"name":"@practice-relay/lti"}');
  write(root, "apps/relay-api/src/index.ts", 'import { createEmptyRecord } from "@practice-relay/work-record";\n');
  write(root, "packages/movement/src/index.ts", "export const ok = true;\n");
  write(root, "packages/lti/src/index.d.mts", 'import type { WorkRecord } from "@practice-relay/lti";\n');
  return root;
}

const root = baseFixture();
try {
  assert.deepEqual(checkBoundaries(root), [], "valid fixture passes");

  write(root, "apps/relay-api/src/types.d.mts", 'import type { LTI_STATUS } from "@practice-relay/lti";\n');
  assert.match(checkBoundaries(root).join("\n"), /apps\/relay-api\/src\/types\.d\.mts: source import @practice-relay\/lti is not declared/u);
  rmSync(join(root, "apps/relay-api/src/types.d.mts"));

  write(root, "apps/relay-api/src/unknown.d.mts", 'import type { Unknown } from "@practice-relay/not-a-workspace";\n');
  assert.match(checkBoundaries(root).join("\n"), /apps\/relay-api\/src\/unknown\.d\.mts: source import @practice-relay\/not-a-workspace is not declared/u);
  rmSync(join(root, "apps/relay-api/src/unknown.d.mts"));

  write(root, "packages/movement/src/bad.ts", 'import { createEmptyRecord } from "@practice-relay/work-record";\n');
  assert.match(checkBoundaries(root).join("\n"), /movement must not import work-record/u);
  rmSync(join(root, "packages/movement/src/bad.ts"));

  write(root, "packages/movement/browser/bad.mjs", 'import { readFileSync } from "node:fs";\nimport path from "path";\n');
  const browserErrors = checkBoundaries(root).join("\n");
  assert.match(browserErrors, /packages\/movement\/browser\/bad\.mjs: browser-safe source imports Node builtin node:fs/u);
  assert.match(browserErrors, /packages\/movement\/browser\/bad\.mjs: browser-safe source imports Node builtin path/u);
  rmSync(join(root, "packages/movement/browser/bad.mjs"));
  write(root, "packages/movement/browser/ok.mjs", 'import { helper } from "./helper.mjs";\n');
  assert.deepEqual(checkBoundaries(root), [], "browser-safe relative imports pass");
  rmSync(join(root, "packages/movement/browser/ok.mjs"));

  write(root, "apps/relay-api/src/escape.ts", 'import { x } from "../../../scripts/anything.mjs";\n');
  assert.match(checkBoundaries(root).join("\n"), /apps\/relay-api\/src\/escape\.ts: relative import \.\.\/\.\.\/\.\.\/scripts\/anything\.mjs leaves workspace apps\/relay-api/u);
  rmSync(join(root, "apps/relay-api/src/escape.ts"));
  write(root, "apps/relay-web/src/dev.mjs", 'import { startStaticServer } from "../../../scripts/static-server.mjs";\n');
  assert.deepEqual(checkBoundaries(root), [], "allowlisted dev helper import passes");
  write(root, "apps/relay-web/src/dev.mjs", 'import { other } from "../../../scripts/other.mjs";\n');
  assert.match(checkBoundaries(root).join("\n"), /apps\/relay-web\/src\/dev\.mjs: relative import .* leaves workspace apps\/relay-web/u);
  rmSync(join(root, "apps/relay-web/src/dev.mjs"));

  write(root, "packages/work-record/package.json", '{"name":"@practice-relay/work-record","dependencies":{"@practice-relay/handoff":"workspace:*"}}');
  assert.match(
    checkBoundaries(root).join("\n"),
    /package dependency cycle: @practice-relay\/handoff -> @practice-relay\/work-record -> @practice-relay\/handoff/u,
  );
  write(root, "packages/work-record/package.json", '{"name":"@practice-relay/work-record"}');

  write(root, "packages/movement/schemas/legacy.schema.json", '{"$id":"https://mac-research.local/schemas/legacy/0.1.json"}\n');
  assert.match(checkBoundaries(root).join("\n"), /obsolete schema host mac-research\.local/u);
  rmSync(join(root, "packages/movement/schemas/legacy.schema.json"));

  write(root, "packages/work-record/src/bad.ts", 'import { x } from "@practice-relay/relay-api";\n');
  assert.match(checkBoundaries(root).join("\n"), /package imports app/u);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("Boundary checker verification passed.");
