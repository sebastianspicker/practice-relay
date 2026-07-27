/**
 * Workspace package metadata validation for release hygiene.
 * Why: every configured package must share one private alpha identity.
 */
import { readdirSync } from "node:fs";
import {
  hasSafeRepositoryPath,
  readRepositoryText,
  resolveExistingRepositoryPath,
} from "./repository-files.mjs";

function workspacePatterns(root, errors) {
  const patterns = [];
  const workspace = readRepositoryText(root, "pnpm-workspace.yaml");
  for (const line of workspace.split(/\r?\n/u)) {
    const match = line.match(/^\s*-\s*["']?([^"'#\s]+)["']?\s*(?:#.*)?$/u);
    if (match) patterns.push(match[1]);
  }
  if (patterns.length === 0) {
    errors.push("pnpm-workspace.yaml declares no workspace package paths");
  }
  return patterns;
}

function addWildcardManifests(root, pattern, manifests, errors) {
  const base = pattern.slice(0, -2);
  if (!hasSafeRepositoryPath(root, base)) {
    errors.push(`missing or unsafe workspace directory: ${base}`);
    return;
  }
  const { absolute, info } = resolveExistingRepositoryPath(root, base);
  if (!info.isDirectory()) {
    errors.push(`workspace path is not a directory: ${base}`);
    return;
  }
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const entryPath = `${base}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      errors.push(`workspace entry must not be a symbolic link: ${entryPath}`);
      continue;
    }
    if (!entry.isDirectory()) continue;
    const manifest = `${entryPath}/package.json`;
    if (hasSafeRepositoryPath(root, manifest)) manifests.add(manifest);
  }
}

function workspaceManifestPaths(root, errors) {
  const manifests = new Set(["package.json"]);
  for (const pattern of workspacePatterns(root, errors)) {
    if (pattern.endsWith("/*") && !pattern.slice(0, -2).includes("*")) {
      addWildcardManifests(root, pattern, manifests, errors);
      continue;
    }
    if (pattern.includes("*")) {
      errors.push(`unsupported workspace pattern in public-hygiene check: ${pattern}`);
      continue;
    }
    const manifest = `${pattern.replace(/\/$/u, "")}/package.json`;
    if (!hasSafeRepositoryPath(root, manifest)) {
      errors.push(`missing or unsafe workspace manifest: ${manifest}`);
    } else {
      manifests.add(manifest);
    }
  }
  return [...manifests].sort();
}

/** Find release metadata drift across the root and every pnpm workspace package. */
export function findWorkspacePackageMetadataErrors(root, expectedVersion) {
  const errors = [];
  const names = new Map();
  const manifests = workspaceManifestPaths(root, errors);
  for (const path of manifests) {
    let packageJson;
    try {
      packageJson = JSON.parse(readRepositoryText(root, path));
    } catch (error) {
      errors.push(`${path} is not valid JSON: ${error.message}`);
      continue;
    }
    if (packageJson.version !== expectedVersion) {
      errors.push(`${path} version must be ${expectedVersion}`);
    }
    if (packageJson.license !== "Apache-2.0") {
      errors.push(`${path} license must be Apache-2.0`);
    }
    if (packageJson.private !== true) {
      errors.push(`${path} must set private: true`);
    }
    if (path === "package.json") continue;
    if (typeof packageJson.name !== "string" || !packageJson.name.startsWith("@practice-relay/")) {
      errors.push(`${path} name must use the @practice-relay/* scope`);
    }
    const previous = names.get(packageJson.name);
    if (previous) {
      errors.push(`${path} duplicates package name from ${previous}: ${packageJson.name}`);
    } else if (typeof packageJson.name === "string") {
      names.set(packageJson.name, path);
    }
  }
  return { errors, manifests };
}
