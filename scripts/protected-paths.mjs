/**
 * Shared repository path boundary for local state and sensitive material.
 * Why: release validators must reject protected paths before opening files.
 */

const PROTECTED_DIRECTORIES = new Set([
  ".agents",
  ".claude",
  ".codacy",
  ".codegraph",
  ".codex",
  ".cursor",
  ".git",
  ".grok",
  ".idea",
  ".pnpm-store",
  ".scratch",
  ".serena",
  ".turbo",
  ".vite",
  ".vscode",
  "certificates",
  "data",
  "keys",
  "logs",
  "node_modules",
  "secrets",
  "tmp",
]);

const PROTECTED_SUFFIXES = [
  ".cer",
  ".crt",
  ".db",
  ".der",
  ".jks",
  ".jsonl",
  ".key",
  ".keystore",
  ".log",
  ".p12",
  ".pem",
  ".pfx",
  ".sqlite",
  ".sqlite3",
];

/** Return whether a repository-relative path must be skipped before file access. */
export function isProtectedRepositoryPath(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/").replace(/^\.\//u, "");
  const parts = normalized.split("/").filter(Boolean);
  const lowerParts = parts.map((part) => part.toLowerCase());
  const lowerPath = lowerParts.join("/");
  const name = (parts.at(-1) ?? "").toLowerCase();
  if (
    lowerPath === "deploy/secrets" ||
    lowerPath.startsWith("deploy/secrets/")
  ) {
    return true;
  }
  if (
    lowerParts.some(
      (part, index) =>
        PROTECTED_DIRECTORIES.has(part) &&
        !(part === "data" && lowerParts[index - 1] === "src"),
    )
  ) {
    return true;
  }
  if (name.startsWith(".env")) return true;
  return PROTECTED_SUFFIXES.some((suffix) => name.endsWith(suffix));
}
