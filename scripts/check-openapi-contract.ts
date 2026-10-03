/** Verify the public runtime route registry and OpenAPI operation surface agree. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PUBLIC_ROUTE_TEMPLATES } from "../apps/relay-api/src/public-routes.ts";

const HTTP_METHOD = /^    (get|post|put|patch|delete):\s*$/u;
const PATH = /^  (\/[^:]+):\s*$/u;

/** Extract normalized method-and-path operation keys from an OpenAPI document. */
export function openApiOperations(source: string): Set<string> {
  const operations = new Set<string>();
  let currentPath: string | undefined;
  let insidePaths = false;
  for (const line of source.split(/\r?\n/u)) {
    if (line === "paths:") {
      insidePaths = true;
      continue;
    }
    if (insidePaths && /^\S/u.test(line)) {
      insidePaths = false;
      currentPath = undefined;
    }
    if (!insidePaths) continue;
    const pathMatch = PATH.exec(line);
    if (pathMatch) {
      currentPath = pathMatch[1];
      continue;
    }
    const methodMatch = HTTP_METHOD.exec(line);
    if (methodMatch && currentPath) {
      operations.add(`${methodMatch[1]!.toUpperCase()} ${currentPath}`);
    }
  }
  return operations;
}

/** Materialize the normalized operation keys declared by the runtime registry. */
export function runtimeOperations(): Set<string> {
  return new Set(
    PUBLIC_ROUTE_TEMPLATES.flatMap((route) =>
      route.methods.map((method) => `${method} ${route.path}`),
    ),
  );
}

/** Return the operations that exist on only one side of the contract. */
export function operationDifference(
  documented: ReadonlySet<string>,
  runtime: ReadonlySet<string>,
): { missingFromOpenApi: string[]; missingFromRuntime: string[] } {
  return {
    missingFromOpenApi: [...runtime].filter((item) => !documented.has(item)).sort(),
    missingFromRuntime: [...documented].filter((item) => !runtime.has(item)).sort(),
  };
}

/** Throw a diagnostic when the supplied OpenAPI source diverges from runtime routes. */
export function assertOperationParity(source: string): void {
  const difference = operationDifference(openApiOperations(source), runtimeOperations());
  if (difference.missingFromOpenApi.length || difference.missingFromRuntime.length) {
    throw new Error(
      [
        "OpenAPI and runtime route registry differ.",
        `Missing from OpenAPI: ${difference.missingFromOpenApi.join(", ") || "none"}`,
        `Missing from runtime: ${difference.missingFromRuntime.join(", ") || "none"}`,
      ].join("\n"),
    );
  }
}

const invokedPath = process.argv[1];
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  const source = readFileSync(
    new URL("../apps/relay-api/openapi.yaml", import.meta.url),
    "utf8",
  );
  assertOperationParity(source);
  console.log(`OpenAPI contract check passed (${runtimeOperations().size} operations).`);
}
