/** Tests for the explicit unit and live operations-probe boundary. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createOpsSloUnitEnvironment,
  normalizeLiveBaseUrl,
  parseOpsSloMode,
} from "./ops-slo-check.mjs";

test("unit environment removes ambient storage, network, and secret inputs", () => {
  const environment = createOpsSloUnitEnvironment({
    PATH: "/usr/bin",
    PRACTICE_RELAY_DATA: "/protected/data",
    PRACTICE_RELAY_MEDIA: "/protected/media",
    PRACTICE_RELAY_OBJECT_STORE: "s3",
    PRACTICE_RELAY_S3_ENDPOINT: "https://storage.example.test",
    PRACTICE_RELAY_LTI_KEYS_DIR: "/protected/keys",
    AWS_PROFILE: "local",
    MINIO_ROOT_USER: "local",
    SECRET_BACKEND: "file",
    SECRET_FILE_DIR: "/protected/secrets",
    KMS_STUB_KEY: "local",
    MVEI_LOCAL_STATE: "/protected/mvei",
  });

  assert.equal(environment.PATH, "/usr/bin");
  assert.equal(environment.PRACTICE_RELAY_OBJECT_STORE, "memory");
  assert.equal(environment.PRACTICE_RELAY_REQUIRE_SECRETS, "1");
  for (const name of [
    "PRACTICE_RELAY_DATA",
    "PRACTICE_RELAY_MEDIA",
    "PRACTICE_RELAY_S3_ENDPOINT",
    "PRACTICE_RELAY_LTI_KEYS_DIR",
    "AWS_PROFILE",
    "MINIO_ROOT_USER",
    "SECRET_BACKEND",
    "SECRET_FILE_DIR",
    "KMS_STUB_KEY",
    "MVEI_LOCAL_STATE",
  ]) {
    assert.equal(name in environment, false, name);
  }
});

test("operations probe mode cannot be selected by ambient configuration", () => {
  assert.equal(parseOpsSloMode(["--unit"]), "unit");
  assert.equal(parseOpsSloMode(["--live"]), "live");
  assert.throws(() => parseOpsSloMode([]), /choose exactly one/);
  assert.throws(() => parseOpsSloMode(["--unit", "--live"]), /choose exactly one/);
});

test("live probes accept exact safe origins", () => {
  assert.equal(normalizeLiveBaseUrl("http://127.0.0.1:8787"), "http://127.0.0.1:8787");
  assert.equal(normalizeLiveBaseUrl("https://relay.example.test"), "https://relay.example.test");
});

test("live probes reject credential-bearing, path, and cleartext remote URLs", () => {
  for (const value of [
    "http://relay.example.test",
    "https://name:password@relay.example.test",
    "https://relay.example.test/api",
    "file:///tmp/socket",
  ]) {
    assert.throws(() => normalizeLiveBaseUrl(value), Error, value);
  }
});
