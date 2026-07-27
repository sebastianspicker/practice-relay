/**
 * Test-only resolver for newly added workspace packages before a local relink.
 * Why: verification must not require mutating node_modules or installing packages.
 */
import { registerHooks } from "node:module";

const workspacePackages = new Map([
  ["@practice-relay/work-record-core", "../../../../../packages/work-record-core/src/index.ts"],
  ["@practice-relay/work-record-package", "../../../../../packages/work-record-package/src/index.ts"],
  ["@practice-relay/interop", "../../../../../packages/interop/src/index.ts"],
  ["@practice-relay/auth", "../../../../packages/auth/src/index.ts"],
  ["@practice-relay/collaboration", "../../../../packages/collaboration/src/index.ts"],
  ["@practice-relay/media-store", "../../../../packages/media-store/src/index.ts"],
  ["@practice-relay/record-store", "../../../../packages/record-store/src/index.ts"],
].map(([name, path]) => [name, new URL(path, import.meta.url).href]));

registerHooks({
  resolve(specifier, context, nextResolve) {
    const url = workspacePackages.get(specifier);
    if (url) {
      return { url, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
