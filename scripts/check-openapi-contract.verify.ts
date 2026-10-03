/** Focused regression checks for OpenAPI operation extraction and parity diagnostics. */
import assert from "node:assert/strict";
import test from "node:test";
import {
  openApiOperations,
  operationDifference,
} from "./check-openapi-contract.ts";

test("extracts only path operations from OpenAPI", () => {
  const operations = openApiOperations(`paths:
  /health:
    get:
      responses: {}
components:
  schemas:
    post:
`);
  assert.deepEqual([...operations], ["GET /health"]);
});

test("reports operations missing on either side", () => {
  assert.deepEqual(
    operationDifference(
      new Set(["GET /health", "POST /documented-only"]),
      new Set(["GET /health", "GET /runtime-only"]),
    ),
    {
      missingFromOpenApi: ["GET /runtime-only"],
      missingFromRuntime: ["POST /documented-only"],
    },
  );
});
