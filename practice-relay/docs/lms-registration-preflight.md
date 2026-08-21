# LMS registration preflight

This checklist applies when an institution provides an LMS administrator and a
public HTTPS host for Practice Relay. The repository does not provide a Canvas
or Moodle installation, campus identity integration, or 1EdTech certification.

The local mock platform and `docker-compose.campus-lab.yml` exercise protocol
shapes only. They do not verify an external LMS registration.

Local evaluation boundary: [lab-only-tier.md](./lab-only-tier.md).
Endpoint detail: [lti-lms-registration.md](./lti-lms-registration.md).

---

## Preconditions (must be true before registration)

| # | Precondition | Lab mock substitute |
|---|--------------|---------------------|
| 1 | Public HTTPS base URL for Practice Relay tool | `http://localhost:8787` (not valid for production LMS) |
| 2 | TLS cert trusted by campus network | N/A |
| 3 | LMS admin rights (Canvas Developer Keys / Moodle External tool) | MOCK PLATFORM UI `:8790` |
| 4 | Secrets manager for `client_id`, `deployment_id`, LTI secret/RSA PEMs | env on single host |
| 5 | Network allow-list: LMS → tool JWKS + launch + login | localhost only |

---

## Exact environment variables (tool host)

Set on the Practice Relay API process before registration.

### Required for an external LMS host

| Variable | Example | Role |
|----------|---------|------|
| `PORT` | `8787` | HTTP listen port (behind reverse proxy) |
| `PRACTICE_RELAY_LTI_SECRET` | `openssl rand -hex 32` | AGS service-token HMAC (mock + lab); keep for dual-mode |
| `PRACTICE_RELAY_AUTH_SECRET` | `openssl rand -hex 32` | Course-local sessions (not campus IdP) |
| `PRACTICE_RELAY_REQUIRE_SECRETS` | `1` | Fail closed if secrets empty |
| `PRACTICE_RELAY_DATA` | `/var/lib/practice-relay` | Durable record store |

### Required for production-shaped LTI (RS256 + JWKS)

| Variable | Example | Role |
|----------|---------|------|
| `PRACTICE_RELAY_LTI_KEYS_DIR` | `/var/lib/practice-relay/lti-keys` | RSA key dir (`private.pem`, `public.pem`) |
| `PRACTICE_RELAY_LTI_GENERATE_RSA` | `1` (first boot only) | Generate key pair once |
| `PRACTICE_RELAY_LTI_KID` | `practice-relay-prod-1` | Optional JWK `kid` |

Or inline PEMs:

| Variable | Role |
|----------|------|
| `PRACTICE_RELAY_LTI_RSA_PRIVATE` | Private PEM string |
| `PRACTICE_RELAY_LTI_RSA_PUBLIC` | Public PEM string |

### Platform identity (filled after LMS issues them)

| Variable | Filled from | Role |
|----------|-------------|------|
| `PRACTICE_RELAY_LTI_CLIENT_ID` | Canvas Client ID / Moodle client id | Tool client_id |
| `PRACTICE_RELAY_LTI_PLATFORM_ISS` | LMS issuer URL | OIDC `iss` match |
| `PRACTICE_RELAY_LTI_PLATFORM_AUTH_URL` | LMS OIDC auth endpoint | Tool → platform auth redirect |
| `PRACTICE_RELAY_LTI_LAUNCH_URL` | Registered tool redirect / target-link URL | Must exactly match `target_link_uri` |

### Optional media (S3 / MinIO - not LMS)

| Variable | Example |
|----------|---------|
| `PRACTICE_RELAY_OBJECT_STORE` | `s3` |
| `PRACTICE_RELAY_S3_ENDPOINT` | `http://minio:9000` |
| `PRACTICE_RELAY_S3_BUCKET` | `practice-relay` |
| `PRACTICE_RELAY_S3_ACCESS_KEY` | lab key |
| `PRACTICE_RELAY_S3_SECRET_KEY` | lab secret |
| `PRACTICE_RELAY_S3_FORCE_PATH_STYLE` | `1` |
| `PRACTICE_RELAY_S3_REGION` | `us-east-1` |

---

## Canonical URLs (replace host)

Assume tool public origin `https://practice-relay.example.edu` (lab: `http://localhost:8787`).

| Field | URL |
|-------|-----|
| Target Link URI / Launch | `https://practice-relay.example.edu/lti/launch` |
| OIDC Login Initiation | `https://practice-relay.example.edu/lti/login` |
| Redirect URI(s) | `https://practice-relay.example.edu/lti/launch` |
| JWKS (Public JWK URL) | `https://practice-relay.example.edu/lti/jwks` |
| AGS token (lab mock only) | `https://practice-relay.example.edu/lti/oauth/token` |
| AGS score (lab mock only) | `https://practice-relay.example.edu/lti/ags/scores` |

On Canvas or Moodle, the platform hosts the AGS token and line-item URLs. The
local `/lti/oauth/token` and `/lti/ags/scores` routes are test doubles. An
external registration must use the LMS endpoints after the tool obtains a
platform access token.

### AGS scopes to enable on the Developer Key / tool

```
https://purl.imsglobal.org/spec/lti-ags/scope/lineitem
https://purl.imsglobal.org/spec/lti-ags/scope/score
```

Optional if institution requires:

```
https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly
https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly
```

---

## Tool config JSON fixtures (registration fields)

Downloadable from the mock platform UI or read from disk:

| LMS | Fixture |
|-----|---------|
| Canvas Developer Key / LTI 1.3 | [`practice-relay/apps/lti-mock-platform/fixtures/canvas-tool-config.json`](../apps/lti-mock-platform/fixtures/canvas-tool-config.json) |
| Moodle External tool / LTI 1.3 | [`practice-relay/apps/lti-mock-platform/fixtures/moodle-tool-config.json`](../apps/lti-mock-platform/fixtures/moodle-tool-config.json) |
| Generic deployment registration | [`practice-relay/apps/lti-mock-platform/fixtures/deployment-registration.json`](../apps/lti-mock-platform/fixtures/deployment-registration.json) |

These files are shaped for real registration fields. They are not proof of a completed campus install. Status markers inside the JSON say `not-production` / `preflight`.

### Local mock to external registration field map

| Fixture field | Canvas admin UI | Moodle admin UI |
|---------------|-----------------|-----------------|
| `target_link_uri` / `tool_url` | Redirect / Target Link URI | Tool URL |
| `openid_connect_initiation_url` / `initiate_login_url` | OpenID Connect Initiation URL | Initiate login URL |
| `redirect_uris` / `redirection_uris` | Redirect URIs | Redirection URI(s) |
| `public_jwk_url` / `public_keyset_url` | Public JWK URL | Public keyset URL |
| `scopes` (AGS) | Assignment and Grade Services | IMS LTI AGS |
| `custom_fields.asset_mode` | Custom fields | Custom params |

---

## Canvas preflight steps (admin)

1. Confirm JWKS live: `curl -sS https://practice-relay.example.edu/lti/jwks` → RSA `keys` array non-empty for RS256.
2. Admin → Developer Keys → + LTI Key.
3. Paste fields from `canvas-tool-config.json` (replace host).
4. Enable AGS scopes listed above.
5. Save → copy Client ID, Deployment ID, Issuer.
6. Set tool host env: `PRACTICE_RELAY_LTI_CLIENT_ID`, `PRACTICE_RELAY_LTI_PLATFORM_ISS`, `PRACTICE_RELAY_LTI_PLATFORM_AUTH_URL`, `PRACTICE_RELAY_LTI_LAUNCH_URL`.
7. Course → Assignment → External Tool → launch.
8. Verify custom claim / assignment: multi-asset, `singleVideoUrl: null`.
9. AGS: confirm platform token URL + line item write (not only lab mock endpoints).

## Moodle preflight steps (admin)

1. Confirm JWKS live (same as Canvas).
2. Site admin → Plugins → External tool → Manage tools → configure manually (LTI 1.3).
3. Paste fields from `moodle-tool-config.json` (replace host).
4. Enable IMS LTI Assignment and Grade Services.
5. Record client id / deployment / issuer into tool env.
6. Course activity launch + multi-asset payload check.
7. Grade passback against Moodle AGS endpoints.

---

## Verification after real registration

| Check | Pass criteria |
|-------|---------------|
| Launch | LMS posts `id_token`; tool `POST /lti/launch` (or platform form_post) accepts |
| Multi-asset | Assignment claim has `assetMode: "multi-asset"`, `singleVideoUrl: null` |
| JWKS | Platform validates tool signatures via public JWK URL |
| AGS | Score appears in LMS gradebook (platform AGS, not only lab mock) |
| Honesty | Still no “IMS certified” claim without certification programme |

---

## External requirements

- Installing Canvas or Moodle containers as “production LMS”
- Campus IdP / multi-campus SSO
- IMS / 1EdTech certification paperwork
- Treating local mock results as evidence of an external LMS registration

The governing boundary is documented in
[lab-only-tier.md](./lab-only-tier.md) and exercised by the retained LTI token,
OIDC, and API authorization contracts.

---

## Cross-links

- [lab-only-tier.md](./lab-only-tier.md)
- [lti-lms-registration.md](./lti-lms-registration.md)
- [ops.md](./ops.md) · [lab-only-tier.md](./lab-only-tier.md)
