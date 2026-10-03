/** Dependency-free regression proof for the fixed mock deployment fixture boundary. */
import assert from "node:assert/strict";
import { fileURLToPath, URL } from "node:url";
import { createRequire } from "node:module";

import {
  createToolRegistry,
  loadDeploymentRegistration,
} from "../src/platform.mjs";

const require = createRequire(import.meta.url);
const committedFixture = require("../fixtures/deployment-registration.json");

class FixtureLoaderVerifier {
  constructor() {
    this.verifyFixtureLoading();
    this.verifyFixtureCloneIsolation();
    this.verifyRegistryIsolation();
  }

  verifyFixtureLoading() {
    assert.deepEqual(loadDeploymentRegistration(), committedFixture);

    const missingFixturePath = fileURLToPath(
      new URL(
        "../fixtures/missing-deployment-registration.json",
        import.meta.url,
      ),
    );
    const repositoryFilePath = fileURLToPath(
      new URL("../package.json", import.meta.url),
    );

    assert.deepEqual(
      loadDeploymentRegistration(missingFixturePath),
      committedFixture,
    );
    assert.deepEqual(
      loadDeploymentRegistration(repositoryFilePath),
      committedFixture,
    );
  }

  verifyFixtureCloneIsolation() {
    const first = loadDeploymentRegistration();
    const second = loadDeploymentRegistration();

    assert.notStrictEqual(first, second);
    assert.notStrictEqual(first.tool, second.tool);
    first.tool.clientId = "mutated-client";
    first.tool.customFields.asset_mode = "mutated-mode";

    assert.equal(second.tool.clientId, committedFixture.tool.clientId);
    assert.equal(
      second.tool.customFields.asset_mode,
      committedFixture.tool.customFields.asset_mode,
    );
    assert.deepEqual(loadDeploymentRegistration(), committedFixture);
  }

  verifyRegistryIsolation() {
    const seed = {
      platform: { name: "Seed platform" },
      tool: { clientId: "seed-client", customFields: { mode: "seed" } },
    };
    const seededRegistry = createToolRegistry(seed);
    seededRegistry.get().tool.customFields.mode = "registry-only";

    assert.equal(seed.tool.customFields.mode, "seed");

    const firstDefaultRegistry = createToolRegistry();
    const secondDefaultRegistry = createToolRegistry();
    firstDefaultRegistry.register({ tool: { clientId: "first-registry-client" } });

    assert.equal(
      secondDefaultRegistry.get().tool.clientId,
      committedFixture.tool.clientId,
    );
    assert.equal(
      loadDeploymentRegistration().tool.clientId,
      committedFixture.tool.clientId,
    );
  }
}

const fixtureLoaderVerifier = new FixtureLoaderVerifier();
void fixtureLoaderVerifier;
