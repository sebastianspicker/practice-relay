/** Verify static delivery at a repository subpath, including transitive module imports. */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildStaticWorkspace } from "../scripts/build.mjs";

const base = new URL("https://example.github.io/practice-relay/");

async function readPublished(output, url) {
  assert.equal(url.origin, base.origin, "dependencies stay on the static origin");
  assert.ok(url.pathname.startsWith(base.pathname), "dependencies retain the repository subpath");
  return readFile(join(output, url.pathname.slice(base.pathname.length)), "utf8");
}

function moduleSpecifiers(source) {
  const patterns = [
    /\b(?:import|export)\s+(?:[^;]*?\s+from\s*)?["']([^"']+)["']/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  ];
  return patterns.flatMap((pattern) => [...source.matchAll(pattern)].map((match) => match[1]));
}

async function verifyModules(output, imports, entries) {
  const pending = entries.map((entry) => new URL(entry, base));
  const seen = new Set();
  while (pending.length) {
    const url = pending.pop();
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    const source = await readPublished(output, url);
    if (!url.pathname.endsWith(".mjs")) continue;
    for (const specifier of moduleSpecifiers(source)) {
      const target = imports[specifier];
      assert.ok(target || specifier.startsWith("."), `browser import resolves: ${specifier}`);
      pending.push(target ? new URL(target, base) : new URL(specifier, url));
    }
  }
  return seen;
}

test("staged application resolves its complete browser import graph below a Pages subpath", async () => {
  const output = await mkdtemp(join(tmpdir(), "relay-static-"));
  try {
    await buildStaticWorkspace(output);
    const html = await readFile(join(output, "index.html"), "utf8");
    const { imports } = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
    const entries = [...html.matchAll(/<script type="module" src="([^"]+)"/g)].map((match) => match[1]);
    const seen = await verifyModules(output, imports, [...entries, ...Object.values(imports), "./studio/movement-editor.mjs", "./packages/movement/browser/index.mjs"]);
    assert.ok([...seen].some((url) => url.endsWith("mvei-motif.schema.json")));
    assert.ok([...seen].some((url) => url.endsWith("music-co-timeline-annex.schema.json")));
    assert.ok([...seen].some((url) => url.endsWith("motif-vocabulary.mjs")));
    for (const link of html.matchAll(/<link[^>]+href="([^"]+)"/g)) await readPublished(output, new URL(link[1], base));
    await assert.rejects(stat(join(output, "dev.mjs")), { code: "ENOENT" });
  } finally { await rm(output, { recursive: true, force: true }); }
});

test("Pages uploads staged output and rebuilds when shared movement sources change", async () => {
  const workflow = await readFile(new URL("../../../.github/workflows/pages.yml", import.meta.url), "utf8");
  assert.match(workflow, /node apps\/relay-web\/scripts\/build\.mjs/);
  assert.match(workflow, /path: apps\/relay-web\/dist/);
  assert.match(workflow, /packages\/movement\/browser\/\*\*/);
  assert.match(workflow, /packages\/movement\/schemas\/\*\*/);
});
