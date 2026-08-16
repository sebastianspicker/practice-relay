/** LTI focused protocol tests. Why: keep protocol regressions independently runnable. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LTI_LAB_KID, buildLtiResourceLinkLaunch, verifyHs256Jwt, verifyLtiJwt, verifyRs256Jwt, signHs256Jwt, signRs256Jwt, resolveLtiSecret, resolveLabRsaKeys, generateLabPlatformKeys, exportPlatformJwks, publicKeyToJwk, issueAgsServiceToken, verifyAgsServiceToken } from "./index.mjs";
import { scoreFromDemoSeed } from "./test-fixtures.mjs";

const randomTestSecret = () => randomBytes(32).toString("base64url");

test("LTI resource link launch JWT round-trip embeds multi-asset custom claim", () => {
  const score = scoreFromDemoSeed();
  const { idToken, assignment, alg } = buildLtiResourceLinkLaunch(score, {
    userId: "teacher-1",
  });
  assert.equal(alg, "HS256");
  const claims = verifyHs256Jwt(idToken);
  assert.ok(claims);
  assert.equal(
    claims["https://purl.imsglobal.org/spec/lti/claim/message_type"],
    "LtiResourceLinkRequest",
  );
  const custom =
    claims["https://purl.imsglobal.org/spec/lti/claim/custom"];
  assert.equal(custom.asset_mode, "multi-asset");
  const embedded = JSON.parse(custom.practice_relay_assignment);
  assert.equal(embedded.packageId, assignment.packageId);
  assert.equal(embedded.singleVideoUrl, null);
});

test("LTI signing rejects invalid assignments and uses the registered target URL", () => {
  assert.throws(
    () => buildLtiResourceLinkLaunch({ id: "empty" }),
    /invalid multi-asset assignment.*trackTypes must be a non-empty array/,
  );

  const targetLinkUri = "https://tool.example.edu/lti/launch";
  const launch = buildLtiResourceLinkLaunch(scoreFromDemoSeed(), {
    targetLinkUri,
  });
  assert.equal(
    launch.claims[
      "https://purl.imsglobal.org/spec/lti/claim/target_link_uri"
    ],
    targetLinkUri,
  );
});

test("RS256 launch + JWKS export + verifyLtiJwt", () => {
  const keys = generateLabPlatformKeys();
  const jwks = exportPlatformJwks(keys.publicKey, LTI_LAB_KID);
  assert.equal(jwks.keys.length, 1);
  assert.equal(jwks.keys[0].kid, LTI_LAB_KID);
  assert.equal(jwks.keys[0].alg, "RS256");
  assert.equal(jwks.keys[0].kty, "RSA");
  assert.ok(jwks.keys[0].n);
  assert.ok(publicKeyToJwk(keys.publicKey).e);

  const score = scoreFromDemoSeed();
  const { idToken, alg } = buildLtiResourceLinkLaunch(score, {
    userId: "teacher-1",
    privateKeyPem: keys.privateKey,
    kid: LTI_LAB_KID,
  });
  assert.equal(alg, "RS256");
  const claims = verifyLtiJwt(idToken, { publicKeyPem: keys.publicKey });
  assert.ok(claims);
  assert.equal(claims.sub, "teacher-1");
  // HS256 path must not accept RS256 token with secret alone
  assert.equal(verifyLtiJwt(idToken, { secret: resolveLtiSecret(undefined, {}) }), null);
  assert.ok(verifyRs256Jwt(idToken, keys.publicKey));
});

test("resolveLabRsaKeys loads/generates from KEYS_DIR", () => {
  const dir = mkdtempSync(join(tmpdir(), "lti-keys-"));
  try {
    assert.equal(resolveLabRsaKeys({}), null);
    const generated = resolveLabRsaKeys({
      PRACTICE_RELAY_LTI_KEYS_DIR: dir,
      PRACTICE_RELAY_LTI_GENERATE_RSA: "1",
    });
    assert.ok(generated);
    assert.ok(existsSync(join(dir, "private.pem")));
    assert.ok(existsSync(join(dir, "public.pem")));
    const reloaded = resolveLabRsaKeys({ PRACTICE_RELAY_LTI_KEYS_DIR: dir });
    assert.ok(reloaded);
    assert.equal(reloaded.privateKeyPem, generated.privateKeyPem);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("LTI launch tokens and AGS service tokens are not interchangeable", () => {
  const secret = randomTestSecret();
  const launch = buildLtiResourceLinkLaunch(scoreFromDemoSeed(), {
    userId: "teacher-1",
    secret,
    nonce: "launch-nonce",
  });
  assert.ok(
    verifyLtiJwt(launch.idToken, {
      secret,
      nonce: "launch-nonce",
    }),
  );
  assert.equal(verifyAgsServiceToken(launch.idToken, secret), null);

  const service = issueAgsServiceToken({ secret });
  assert.ok(service);
  assert.ok(verifyAgsServiceToken(`Bearer ${service.access_token}`, secret));
  assert.equal(verifyLtiJwt(service.access_token, { secret }), null);
});

test("LTI validation rejects wrong issuer, nonce, and expired launches", () => {
  const secret = randomTestSecret();
  const launch = buildLtiResourceLinkLaunch(scoreFromDemoSeed(), {
    secret,
    nonce: "expected-nonce",
  });
  assert.equal(
    verifyLtiJwt(launch.idToken, { secret, issuer: "https://untrusted.example" }),
    null,
  );
  assert.equal(
    verifyLtiJwt(launch.idToken, { secret, nonce: "different-nonce" }),
    null,
  );

  const expired = {
    ...launch.claims,
    iat: 100,
    exp: 101,
  };
  assert.equal(
    verifyLtiJwt(signHs256Jwt(expired, secret), {
      secret,
      nowSeconds: 1000,
      clockToleranceSeconds: 0,
    }),
    null,
  );
});

test("custom PRACTICE_RELAY_LTI_SECRET signs and verifies; ephemeral fallback rejects", () => {
  const custom = randomTestSecret();
  const ephemeral = resolveLtiSecret(undefined, {});
  assert.notEqual(custom, ephemeral);
  assert.equal(resolveLtiSecret(custom), custom);
  assert.equal(resolveLtiSecret(undefined, {}), ephemeral);
  assert.equal(
    resolveLtiSecret(undefined, { PRACTICE_RELAY_LTI_SECRET: custom }),
    custom,
  );

  const score = scoreFromDemoSeed();
  const { idToken } = buildLtiResourceLinkLaunch(score, {
    userId: "teacher-1",
    secret: custom,
  });
  // Real path: verify with the same configured secret
  const ok = verifyHs256Jwt(idToken, custom);
  assert.ok(ok);
  assert.equal(ok.sub, "teacher-1");
  // Wrong process-ephemeral secret must not accept tokens signed with custom secret.
  assert.equal(verifyHs256Jwt(idToken, ephemeral), null);
  // The process-local fallback remains stable for isolated mock calls.
  const labToken = signHs256Jwt({ sub: "lab", exp: 9e12 }, ephemeral);
  assert.ok(verifyHs256Jwt(labToken, ephemeral));
  assert.equal(verifyHs256Jwt(labToken, custom), null);
  // RS256 helper still signs arbitrary claims
  const keys = generateLabPlatformKeys();
  const rs = signRs256Jwt({ sub: "rs" }, keys.privateKey);
  assert.ok(verifyRs256Jwt(rs, keys.publicKey));
});
