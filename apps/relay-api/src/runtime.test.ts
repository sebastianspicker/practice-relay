/**
 * Runtime construction tests.
 * Why: defaults must remain isolated while explicit injection stays identity-preserving.
 */
import { createMemoryRuntimeState } from "@practice-relay/runtime-state";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createApiRuntime,
  defaultRuntime,
  type ApiRuntime,
} from "./runtime.ts";

const RUNTIME_ENVIRONMENT_NAMES = [
  "PRACTICE_RELAY_STORE",
  "PRACTICE_RELAY_DATA",
  "PRACTICE_RELAY_OBJECT_STORE",
] as const;

type RuntimeEnvironmentName = (typeof RUNTIME_ENVIRONMENT_NAMES)[number];
type EnvironmentSnapshot = Record<
  RuntimeEnvironmentName,
  { present: boolean; value: string | undefined }
>;

function snapshotEnvironment(): EnvironmentSnapshot {
  return Object.fromEntries(
    RUNTIME_ENVIRONMENT_NAMES.map((name) => [
      name,
      { present: Object.hasOwn(process.env, name), value: process.env[name] },
    ]),
  ) as EnvironmentSnapshot;
}

function restoreEnvironment(snapshot: EnvironmentSnapshot): void {
  for (const name of RUNTIME_ENVIRONMENT_NAMES) {
    const state = snapshot[name];
    if (state.present && state.value !== undefined) {
      process.env[name] = state.value;
    } else {
      delete process.env[name];
    }
  }
}

function withEnvironment(
  values: Partial<Record<RuntimeEnvironmentName, string | undefined>>,
  run: () => void,
): void {
  const snapshot = snapshotEnvironment();
  try {
    for (const name of RUNTIME_ENVIRONMENT_NAMES) {
      const value = values[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    run();
  } finally {
    restoreEnvironment(snapshot);
  }
}

function injectedNonRecordDependencies(): Omit<
  Pick<
    ApiRuntime,
    | "recordStore"
    | "mediaStore"
    | "auth"
    | "opsSecrets"
    | "labRsaKeys"
    | "ingress"
    | "repoRoot"
  >,
  "recordStore"
> {
  return {
    mediaStore: defaultRuntime.mediaStore,
    auth: defaultRuntime.auth,
    opsSecrets: defaultRuntime.opsSecrets,
    labRsaKeys: defaultRuntime.labRsaKeys,
    ingress: defaultRuntime.ingress,
    repoRoot: defaultRuntime.repoRoot,
  };
}

function injectedDependencies(): Pick<
  ApiRuntime,
  | "recordStore"
  | "mediaStore"
  | "auth"
  | "opsSecrets"
  | "labRsaKeys"
  | "ingress"
  | "repoRoot"
> {
  return {
    recordStore: defaultRuntime.recordStore,
    ...injectedNonRecordDependencies(),
  };
}

test("retains injected runtime identities and falsy override values", () => {
  const recordStore = defaultRuntime.recordStore;
  const mediaStore = defaultRuntime.mediaStore;
  const auth = defaultRuntime.auth;
  const opsSecrets = { ...defaultRuntime.opsSecrets };
  const labRsaKeys: ApiRuntime["labRsaKeys"] = {
    privateKeyPem: "injected-private-key",
    publicKeyPem: "injected-public-key",
    kid: "injected-key",
  };
  const ingress = {
    allowedOrigins: new Set(["https://studio.example"]),
    allowedHosts: new Set(["api.example"]),
  };
  const coordination = createMemoryRuntimeState();
  const runtime = createApiRuntime({
    recordStore,
    mediaStore,
    auth,
    opsSecrets,
    labRsaKeys,
    ingress,
    coordination,
    activeMediaUploads: 0,
    objectStoreMode: "",
    repoRoot: "",
  });

  assert.strictEqual(runtime.recordStore, recordStore);
  assert.strictEqual(runtime.mediaStore, mediaStore);
  assert.strictEqual(runtime.auth, auth);
  assert.strictEqual(runtime.opsSecrets, opsSecrets);
  assert.strictEqual(runtime.labRsaKeys, labRsaKeys);
  assert.strictEqual(runtime.ingress, ingress);
  assert.strictEqual(runtime.coordination, coordination);
  assert.equal(runtime.activeMediaUploads, 0);
  assert.equal(runtime.objectStoreMode, "");
  assert.equal(runtime.repoRoot, "");
});

test("creates isolated default coordination for every runtime", async () => {
  const first = createApiRuntime(injectedDependencies());
  const second = createApiRuntime(injectedDependencies());
  await first.coordination.registerLtiLaunch("state-1", { nonce: "nonce", issuer: "issuer", audience: "audience", deploymentId: "deployment" });
  assert.notStrictEqual(first.coordination, second.coordination);
  assert.equal(await second.coordination.consumeLtiLaunch("state-1"), undefined);
  assert.ok(await first.coordination.consumeLtiLaunch("state-1"));
});

test("uses defined nonempty storage settings and normalizes object-store defaults", () => {
  const original = snapshotEnvironment();
  const nonRecordDependencies = injectedNonRecordDependencies();
  const dependencies = injectedDependencies();
  const storageSettings = [
    {},
    { PRACTICE_RELAY_STORE: "" },
    { PRACTICE_RELAY_STORE: " " },
    { PRACTICE_RELAY_DATA: "" },
    { PRACTICE_RELAY_DATA: " " },
  ];

  try {
    for (const storage of storageSettings) {
      withEnvironment(storage, () => {
        const runtime = createApiRuntime({
          ...nonRecordDependencies,
        });
        assert.equal(typeof runtime.recordStore.create, "function");
      });
    }

    for (const [configured, expected] of [
      [undefined, "fs"],
      ["", "fs"],
      [" ", "fs"],
      [" MEMORY ", "memory"],
    ] as const) {
      withEnvironment(
        { PRACTICE_RELAY_OBJECT_STORE: configured },
        () => {
          const runtime = createApiRuntime({
            ...dependencies,
          });
          assert.equal(runtime.objectStoreMode, expected);
        },
      );
    }
  } finally {
    restoreEnvironment(original);
  }

  assert.deepEqual(snapshotEnvironment(), original);
});
