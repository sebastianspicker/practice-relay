/**
 * Publish dry-run - validates package.json exports/files for MvEI packages
 * without publishing to npm.
 *
 * Packages checked:
 *   - packages/movement-encode
 *   - mvei/packages/validator
 *   - mvei/packages/engraver
 *   - mvei/packages/reference-reader
 *
 * Usage: node scripts/publish-dry-run.mjs
 * Exit 1 on any missing export target or files-entry path.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePackageEntry } from "./package-paths.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** @type {{ name: string, path: string }[]} */
const PACKAGES = [
  { name: "@practice-relay/movement-encode", path: "packages/movement-encode" },
  { name: "@practice-relay/mvei-validator", path: "mvei/packages/validator" },
  { name: "@practice-relay/mvei-engraver", path: "mvei/packages/engraver" },
  { name: "@practice-relay/mvei-reference-reader", path: "mvei/packages/reference-reader" },
];

/**
 * Expand package.json "exports" map into concrete relative file paths to check.
 * @param {Record<string, unknown>} exports
 * @param {string} pkgDir
 * @returns {string[]}
 */
function collectExportTargets(exports, pkgDir) {
  /** @type {string[]} */
  const targets = [];

  /**
   * @param {unknown} node
   * @param {string} [exportKey]
   */
  function walk(node, exportKey = ".") {
    if (node == null) return;
    if (typeof node === "string") {
      // Skip pure wildcards without a concrete base we can resolve
      if (node.includes("*")) {
        // Resolve directory prefix before *
        const prefix = node.split("*")[0] ?? "";
        let absPrefix;
        try {
          absPrefix = resolvePackageEntry(root, pkgDir, prefix);
        } catch {
          targets.push(`__invalid__:${prefix}`);
          return;
        }
        if (!existsSync(absPrefix)) {
          targets.push(node); // will fail exists check below with the pattern
        } else {
          // Directory exists - mark as ok via a sentinel that we skip later
          targets.push(`__dir_ok__:${prefix}`);
        }
        return;
      }
      targets.push(node);
      return;
    }
    if (typeof node === "object" && !Array.isArray(node)) {
      for (const [k, v] of Object.entries(node)) {
        // conditional exports: types/import/default/require
        if (["types", "import", "default", "require", "node", "browser"].includes(k)) {
          walk(v, exportKey);
        } else {
          walk(v, k);
        }
      }
    }
  }

  walk(exports);
  return targets;
}

/**
 * Check that each "files" entry exists under the package.
 * @param {string[]} files
 * @param {string} pkgDir
 * @returns {{ ok: boolean, missing: string[] }}
 */
function checkFilesField(files, pkgDir) {
  const missing = [];
  const invalid = [];
  for (const entry of files) {
    let abs;
    try {
      abs = resolvePackageEntry(root, pkgDir, entry);
    } catch {
      invalid.push(entry);
      continue;
    }
    if (!existsSync(abs)) missing.push(entry);
  }
  return { ok: missing.length === 0 && invalid.length === 0, missing, invalid };
}

/**
 * List top-level paths that would be included by "files".
 * @param {string} pkgDir
 * @param {string[]} files
 */
function listIncluded(pkgDir, files) {
  /** @type {string[]} */
  const out = [];
  for (const entry of files) {
    let abs;
    try {
      abs = resolvePackageEntry(root, pkgDir, entry);
    } catch {
      continue;
    }
    if (!existsSync(abs)) continue;
    const st = statSync(abs);
    if (st.isDirectory()) {
      try {
        const kids = readdirSync(abs).slice(0, 8);
        out.push(`${entry}/ (${kids.length >= 8 ? "8+" : kids.length} entries)`);
      } catch {
        out.push(`${entry}/`);
      }
    } else {
      out.push(entry);
    }
  }
  return out;
}

let failed = 0;

for (const pkg of PACKAGES) {
  console.log(`\n== ${pkg.name} (${pkg.path}) ==`);

  let pkgDir;
  try {
    pkgDir = resolvePackageEntry(root, root, pkg.path);
  } catch {
    console.error("  FAIL package directory is unsafe");
    failed++;
    continue;
  }
  if (!existsSync(pkgDir) || !statSync(pkgDir).isDirectory()) {
    console.error("  FAIL missing package directory");
    failed++;
    continue;
  }

  let pjPath;
  try {
    pjPath = resolvePackageEntry(root, pkgDir, "package.json");
  } catch {
    console.error("  FAIL package.json is unsafe");
    failed++;
    continue;
  }
  if (!existsSync(pjPath) || !statSync(pjPath).isFile()) {
    console.error(`  FAIL missing package.json`);
    failed++;
    continue;
  }

  /** @type {Record<string, unknown>} */
  const pj = JSON.parse(readFileSync(pjPath, "utf8"));

  if (pj.name !== pkg.name) {
    console.error(`  FAIL name mismatch: expected ${pkg.name}, got ${pj.name}`);
    failed++;
  } else {
    console.log(`  OK   name ${pj.name}`);
  }

  if (!pj.exports || typeof pj.exports !== "object") {
    console.error(`  FAIL missing exports map`);
    failed++;
  } else {
    const targets = collectExportTargets(/** @type {Record<string, unknown>} */ (pj.exports), pkgDir);
    for (const t of targets) {
      if (t.startsWith("__invalid__:")) {
        console.error(`  FAIL export target is unsafe: ${t.slice("__invalid__:".length)}`);
        failed++;
        continue;
      }
      if (t.startsWith("__dir_ok__:")) {
        console.log(`  OK   export dir ${t.slice("__dir_ok__:".length)}*`);
        continue;
      }
      let abs;
      try {
        abs = resolvePackageEntry(root, pkgDir, t);
      } catch {
        console.error(`  FAIL export target is unsafe: ${t}`);
        failed++;
        continue;
      }
      if (!existsSync(abs)) {
        console.error(`  FAIL export target missing: ${t}`);
        failed++;
      } else {
        console.log(`  OK   export → ${t}`);
      }
    }
  }

  if (!Array.isArray(pj.files) || pj.files.length === 0) {
    console.error(`  FAIL missing or empty "files" field`);
    failed++;
  } else {
    const check = checkFilesField(/** @type {string[]} */ (pj.files), pkgDir);
    if (!check.ok) {
      for (const invalid of check.invalid) {
        console.error(`  FAIL files entry is unsafe: ${invalid}`);
        failed++;
      }
      for (const m of check.missing) {
        console.error(`  FAIL files entry missing: ${m}`);
        failed++;
      }
    } else {
      console.log(`  OK   files: ${/** @type {string[]} */ (pj.files).join(", ")}`);
      for (const line of listIncluded(pkgDir, /** @type {string[]} */ (pj.files))) {
        console.log(`       · ${line}`);
      }
    }
  }

  // Bin targets if present
  if (pj.bin && typeof pj.bin === "object") {
    for (const [binName, binPath] of Object.entries(/** @type {Record<string, string>} */ (pj.bin))) {
      let abs;
      try {
        abs = resolvePackageEntry(root, pkgDir, binPath);
      } catch {
        console.error(`  FAIL bin ${binName} is unsafe: ${binPath}`);
        failed++;
        continue;
      }
      if (!existsSync(abs)) {
        console.error(`  FAIL bin ${binName} missing: ${binPath}`);
        failed++;
      } else {
        console.log(`  OK   bin ${binName} → ${binPath}`);
      }
    }
  }

  // Honesty: private packages should not claim they are published
  if (pj.private === true) {
    console.log(`  OK   private:true (dry-run only; not published)`);
  }
}

console.log("");
if (failed > 0) {
  console.error(`${failed} publish dry-run error(s)`);
  process.exit(1);
}
console.log("Publish dry-run OK - exports/files resolve for all checked packages.");
console.log(`Checked from ${relative(process.cwd(), root) || "."}`);
