/**
 * Environment-driven runtime configuration characterization tests.
 * Why: store, topology, tenant, and readiness inputs must keep their exact startup semantics and messages.
 */
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { Database } from "@practice-relay/database";
import { createMemoryRecordStore } from "@practice-relay/record-store";
import { checkReadiness } from "./application/readiness.ts";
import { createApiRuntime, type ApiRuntime } from "./runtime.ts";

type Environment = Record<string, string | undefined>;

const FAKE_DATABASE_URL = "postgres://relay@127.0.0.1:1/relay";

async function withEnvironment<T>(
  values: Environment,
  run: () => T | Promise<T>,
): Promise<T> {
  const previous = Object.fromEntries(
    Object.keys(values).map((name) => [name, process.env[name]]),
  );
  const apply = (next: Environment) => {
    for (const [name, value] of Object.entries(next)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
  try {
    apply(values);
    return await run();
  } finally {
    apply(previous);
  }
}

async function withTemporaryRoot<T>(run: (root: string) => T | Promise<T>): Promise<T> {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "relay-runtime-config-")));
  try {
    return await run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function runtimeFor(values: Environment, overrides: Partial<ApiRuntime> = {}): Promise<ApiRuntime> {
  return withEnvironment(values, () => createApiRuntime(overrides));
}

async function startupError(values: Environment, overrides: Partial<ApiRuntime> = {}): Promise<string> {
  try {
    const runtime = await runtimeFor(values, overrides);
    await runtime.database?.close();
  } catch (error) {
    return (error as Error).message;
  }
  return "no error";
}

function storeShape(runtime: ApiRuntime) {
  const { backend, durable, tenantId } = runtime.recordStore;
  return { backend, durable, tenantId, database: runtime.database !== undefined };
}

test("defaults to an untenanted memory store even when a tenant is configured", async () => {
  assert.deepEqual(storeShape(await runtimeFor({})), {
    backend: "memory", durable: false, tenantId: undefined, database: false,
  });
  assert.deepEqual(storeShape(await runtimeFor({ PRACTICE_RELAY_TENANT_ID: " t1 " })), {
    backend: "memory", durable: false, tenantId: undefined, database: false,
  });
  for (const blank of [{ PRACTICE_RELAY_STORE: " " }, { PRACTICE_RELAY_DATA: " " }]) {
    assert.equal((await runtimeFor(blank)).recordStore.backend, "memory");
  }
});

test("selects explicit memory with a trimmed tenant", async () => {
  const runtime = await runtimeFor({ PRACTICE_RELAY_STORE: " Memory ", PRACTICE_RELAY_TENANT_ID: " t1 " });
  assert.deepEqual(storeShape(runtime), {
    backend: "memory", durable: false, tenantId: "t1", database: false,
  });
});

test("selects JSON storage from a data directory with a trimmed tenant", async () => {
  await withTemporaryRoot(async (root) => {
    const implicit = await runtimeFor({ PRACTICE_RELAY_DATA: ` ${root} ` });
    assert.deepEqual(storeShape(implicit), {
      backend: "json", durable: true, tenantId: undefined, database: false,
    });
    const explicit = await runtimeFor({
      PRACTICE_RELAY_STORE: "JSON",
      PRACTICE_RELAY_DATA: root,
      PRACTICE_RELAY_TENANT_ID: " course-1 ",
    });
    assert.deepEqual(storeShape(explicit), {
      backend: "json", durable: true, tenantId: "course-1", database: false,
    });
    assert.equal(explicit.recordStore.rootDir, path.join(root, "course-1"));
  });
});

test("defaults JSON storage to the working-directory data root", async () => {
  await withTemporaryRoot(async (root) => {
    const previous = process.cwd();
    process.chdir(root);
    try {
      const runtime = await runtimeFor({ PRACTICE_RELAY_STORE: "json" });
      assert.equal(runtime.recordStore.backend, "json");
      assert.equal(runtime.recordStore.rootDir, path.join(process.cwd(), "data", "practice-relay"));
    } finally {
      process.chdir(previous);
    }
  });
});

test("selects PostgreSQL with an untrimmed tenant and shared coordination", async () => {
  for (const store of ["postgres", " PG "]) {
    const runtime = await runtimeFor({
      PRACTICE_RELAY_STORE: store,
      PRACTICE_RELAY_DATABASE_URL: ` ${FAKE_DATABASE_URL} `,
      PRACTICE_RELAY_TENANT_ID: " t1 ",
    });
    try {
      assert.deepEqual(storeShape(runtime), {
        backend: "postgres", durable: true, tenantId: " t1 ", database: true,
      });
      assert.equal(runtime.recordStore.rootDir, "postgres: t1 ");
    } finally {
      await runtime.database?.close();
    }
  }
});

test("uses an injected database and ignores PostgreSQL selection with an injected store", async () => {
  const database = { close: async () => undefined } as unknown as Database;
  const injected = await runtimeFor({}, { database });
  assert.equal(injected.recordStore.backend, "postgres");
  assert.strictEqual(injected.database, database);
  const recordStore = createMemoryRecordStore();
  const overridden = await runtimeFor({ PRACTICE_RELAY_STORE: "postgres" }, { recordStore });
  assert.strictEqual(overridden.recordStore, recordStore);
  assert.equal(overridden.database, undefined);
});

test("keeps exact store selection error messages", async () => {
  assert.equal(
    await startupError({ PRACTICE_RELAY_STORE: "postgres" }),
    "database connectionString is required",
  );
  assert.equal(
    await startupError({ PRACTICE_RELAY_STORE: "sqlite" }),
    "PRACTICE_RELAY_STORE=sqlite is not shipped (zero-native CI). Use json|memory|postgres or implement RecordStoreAdapter.",
  );
  assert.equal(
    await startupError({ PRACTICE_RELAY_STORE: " Unknown " }),
    'PRACTICE_RELAY_STORE must be json|memory|postgres; received "unknown"',
  );
});

test("validates topology exactly before store selection", async () => {
  for (const topology of [" multi-process", "MULTI-PROCESS", "single-process ", ""]) {
    assert.equal(
      await startupError({ PRACTICE_RELAY_TOPOLOGY: topology, PRACTICE_RELAY_STORE: "sqlite" }),
      "invalid PRACTICE_RELAY_TOPOLOGY",
    );
  }
});

test("keeps exact multi-process requirement messages and ordering", async () => {
  const multi = { PRACTICE_RELAY_TOPOLOGY: "multi-process" };
  assert.equal(
    await startupError({ ...multi, PRACTICE_RELAY_STORE: "memory" }),
    "PRACTICE_RELAY_TOPOLOGY=multi-process requires PRACTICE_RELAY_STORE=postgres",
  );
  await withTemporaryRoot(async (root) => {
    assert.equal(
      await startupError({ ...multi, PRACTICE_RELAY_DATA: root }),
      "PRACTICE_RELAY_TOPOLOGY=multi-process requires PRACTICE_RELAY_STORE=postgres",
    );
  });
  assert.equal(
    await startupError({ ...multi, PRACTICE_RELAY_STORE: "sqlite" }),
    "PRACTICE_RELAY_STORE=sqlite is not shipped (zero-native CI). Use json|memory|postgres or implement RecordStoreAdapter.",
  );
  assert.equal(
    await startupError({ ...multi, PRACTICE_RELAY_STORE: "postgres" }),
    "database connectionString is required",
  );
  assert.equal(await startupError(multi), "multi-process requires PostgreSQL records and coordination");
  assert.equal(
    await startupError({ ...multi, PRACTICE_RELAY_STORE: "postgres" }, { recordStore: createMemoryRecordStore() }),
    "multi-process requires PostgreSQL records and coordination",
  );
});

test("requires shared media and configured secrets for multi-process PostgreSQL", async () => {
  const postgres = {
    PRACTICE_RELAY_TOPOLOGY: "multi-process",
    PRACTICE_RELAY_STORE: "postgres",
    PRACTICE_RELAY_DATABASE_URL: FAKE_DATABASE_URL,
  };
  assert.equal(
    await startupError(postgres),
    "multi-process media requires S3 or explicit shared-host filesystem",
  );
  await withTemporaryRoot(async (root) => {
    const sharedHost = {
      ...postgres,
      PRACTICE_RELAY_OBJECT_STORE: "fs",
      PRACTICE_RELAY_MEDIA: root,
      PRACTICE_RELAY_MEDIA_SHARED_HOST: "1",
    };
    assert.equal(await startupError(sharedHost), "no error");
    assert.equal(
      await startupError({
        ...sharedHost,
        PRACTICE_RELAY_AUTH_SECRET: undefined,
        PRACTICE_RELAY_LTI_SECRET: undefined,
        PRACTICE_RELAY_REQUIRE_SECRETS: undefined,
      }),
      "multi-process requires configured shared secrets",
    );
  });
});

test("applies durability and secret requirements to readiness", async () => {
  const devSecrets = { authSecret: "a", ltiSecret: "l", usingDevDefaults: true, secretBackend: "env" as const };
  const readiness = (values: Environment) => withEnvironment(values, async () =>
    (await checkReadiness(createApiRuntime({ recordStore: createMemoryRecordStore(), opsSecrets: devSecrets }))).checks);
  const required = await readiness({ PRACTICE_RELAY_REQUIRE_DURABLE: "1", PRACTICE_RELAY_REQUIRE_SECRETS: "1" });
  assert.deepEqual(
    [required.durableRequired, required.durableReady, required.secrets],
    [true, false, false],
  );
  const optional = await readiness({ PRACTICE_RELAY_REQUIRE_DURABLE: "true", PRACTICE_RELAY_REQUIRE_SECRETS: undefined });
  assert.deepEqual(
    [optional.durableRequired, optional.durableReady, optional.secrets],
    [false, true, true],
  );
});
