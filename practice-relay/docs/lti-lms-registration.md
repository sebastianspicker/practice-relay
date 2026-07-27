# LTI 1.3 registration

Practice Relay implements a local multi-asset assignment handshake for
WorkRecord packages. It is not certified by 1EdTech and has not been verified
against a live Canvas or Moodle deployment. `singleVideoUrl` is always `null`.

The current local boundary is in [lab-only-tier.md](./lab-only-tier.md).
External Canvas or Moodle preparation is in
[lms-registration-preflight.md](./lms-registration-preflight.md). The mock LMS UI at
`practice-relay/apps/lti-mock-platform` is labeled
`MOCK PLATFORM - not Canvas` and does not install a real LMS.

## What is implemented in-repo

| Piece | Endpoint / package | Notes |
|-------|--------------------|--------|
| Multi-asset assignment payload | `@practice-relay/lti` `buildMultiAssetAssignmentPayload` | `assetMode: "multi-asset"`, `singleVideoUrl: null` |
| Resource link launch (id_token) | `POST /work-records/:id/lti`, `POST /lti/launch` | HS256 default; RS256 when lab RSA keys present |
| OIDC login initiation (tool) | `GET`/`POST` `/lti/login` | Validates platform params; returns auth redirect (local-mock) |
| Platform JWKS | `GET /lti/jwks` | Empty `keys` when HS256-only; RSA JWK when keys configured |
| AGS client credentials (mock) | `POST /lti/oauth/token` | Requires `client_secret`; issues audience-scoped Bearer token |
| AGS score write (mock) | `POST /lti/ags/scores` | Requires `Authorization: Bearer <service token>` |
| AGS simulate (score-scoped) | `POST /work-records/:id/lti` with `{ "mode": "ags" }` | Score-member Bearer; faculty/admin only |
| Mock LMS platform app | `@practice-relay/lti-mock-platform` (`:8790`) | Register tool + launch + AGS driver |
| Deployment registration fixture | `practice-relay/apps/lti-mock-platform/fixtures/deployment-registration.json` | Tool config + OIDC param contract |

## Local mock platform

In-repo app: `practice-relay/apps/lti-mock-platform` (port 8790).

Simulates Canvas-like register external tool + launch against Practice Relay API (`:8787`):

1. Load/save deployment registration (fixture or UI form).
2. `GET` tool JWKS (`/lti/jwks`).
3. Optional OIDC: platform → `GET /lti/login` with initiation params.
4. Issue multi-asset `id_token` with the returned nonce → `POST /lti/launch`
   with the returned one-time state.
5. AGS: `POST /lti/oauth/token` then `POST /lti/ags/scores` with Bearer.

```bash
PRACTICE_RELAY_ALLOW_SYNTHETIC_AUTH=1 pnpm --filter @practice-relay/api start
pnpm --filter @practice-relay/lti-mock-platform start
# scripted E2E (no browser / no live ports for API side):
pnpm --filter @practice-relay/lti-mock-platform test
```

The UI banner remains `MOCK PLATFORM - not Canvas` so local protocol tests
cannot be mistaken for a Canvas deployment.

## OIDC login initiation (documented + optional endpoint)

LTI 1.3 third-party initiated login - platform → tool `/lti/login`.

| Param | Required | Role |
|-------|----------|------|
| `iss` | yes | Platform issuer |
| `login_hint` | yes | Opaque user hint |
| `target_link_uri` | yes | Tool launch URL |
| `client_id` | yes | Tool client id |
| `lti_deployment_id` | yes | Deployment id |
| `lti_message_hint` | no | Resource-link context |

The local mock returns `step: "redirect_to_platform_auth"` with the OIDC
authorization request parameters defined in
[`../apps/lti/src/oidc.mjs`](../apps/lti/src/oidc.mjs).

Optional registration env: `PRACTICE_RELAY_LTI_PLATFORM_AUTH_URL`, `PRACTICE_RELAY_LTI_LAUNCH_URL`, `PRACTICE_RELAY_LTI_CLIENT_ID`, `PRACTICE_RELAY_LTI_PLATFORM_ISS`. Request parameters cannot override the registered platform authorization or launch URLs.

Helpers: `parseOidcLoginInitiation`, `processOidcLoginInitiation` in `@practice-relay/lti`.
Fixture field: `oidcLoginInitiationParameters` in deployment-registration.json.

## Signing modes

### HS256 (default lab)

```bash
export PRACTICE_RELAY_LTI_SECRET="$(openssl rand -hex 32)"
# Wired via resolveOpsSecrets() → opsSecrets.ltiSecret
```

Tool and mock platform share the HMAC secret. Suitable for single-host lab demos.

### RS256 + JWKS (preferred when keys present)

```bash
export PRACTICE_RELAY_LTI_KEYS_DIR=./data/lti-keys
export PRACTICE_RELAY_LTI_GENERATE_RSA=1   # first boot only; writes private.pem + public.pem
# optional:
# export PRACTICE_RELAY_LTI_KID=practice-relay-lab-1
# or inline PEM:
# export PRACTICE_RELAY_LTI_RSA_PRIVATE="-----BEGIN PRIVATE KEY-----..."
# export PRACTICE_RELAY_LTI_RSA_PUBLIC="-----BEGIN PUBLIC KEY-----..."
```

- Launch tokens are signed RS256 with `kid` in the JWT header.
- Public keys are published at `GET /lti/jwks`.
- `PRACTICE_RELAY_LTI_SECRET` remains required for AGS service tokens (client credentials mock uses HS256).

## Canvas (Developer Key / LTI 1.3) - target registration steps

These are the real LMS steps operators would follow when moving beyond lab; the monorepo implements the tool-side mock only.

1. Admin → Developer Keys → + LTI Key (or “LTI 1.3” external tool).
2. Set Redirect / Target Link URI to the Practice Relay launch URL, e.g.
   `https://practice-relay.example.edu/lti/launch` (lab: `http://localhost:8787/lti/launch`).
3. Set OpenID Connect Initiation URL when using full OIDC login (not required for local-mock POST id_token).
4. Set JWK Method:
   - Public JWK URL: `https://practice-relay.example.edu/lti/jwks` (RS256 path), or
   - Shared secret only for lab HS256 (not typical Canvas production).
5. Record Canvas-issued Client ID, Deployment ID, Issuer (`https://canvas.instructure.com` or school host).
6. Enable Assignment and Grade Services (AGS) scopes:
   - `https://purl.imsglobal.org/spec/lti-ags/scope/lineitem`
   - `https://purl.imsglobal.org/spec/lti-ags/scope/score`
7. Create a course assignment → External Tool → select Practice Relay → launch.
8. Custom fields / claim: tool embeds `practice_relay_assignment` JSON with multi-asset shape (not a single video URL).

### Canvas AGS token exchange (production shape)

1. Tool obtains platform access token via client credentials against Canvas token URL.
2. Lab mock: `POST /lti/oauth/token` with `{ "grant_type": "client_credentials", "client_id": "practice-relay-tool", "client_secret": "<configured mock credential>" }`. The credential defaults to the injected `PRACTICE_RELAY_LTI_SECRET`; do not use the checked-in development fallback on a shared host.
3. `POST` score results with `Authorization: Bearer <access_token>` (lab: `/lti/ags/scores`).

## Moodle (External tool / LTI 1.3 Advantage) - target steps

1. Site admin → Plugins → Activity modules → External tool → Manage tools.
2. Configure a tool manually (LTI 1.3):
   - Tool URL / Deep linking URL → Practice Relay base.
   - Initiate login URL / Redirection URI(s) as above.
   - Public keyset URL → `…/lti/jwks` (RS256) or paste public key.
3. Enable IMS LTI Assignment and Grade Services + privacy accepts as required by institution.
4. Add external tool activity in course; launch; verify custom multi-asset payload (not video-only).
5. Grade passback: Moodle platform AGS endpoints; lab uses `/lti/oauth/token` + `/lti/ags/scores`.

## Assignment payload contract (mandatory)

```json
{
  "kind": "practice-relay-multi-asset-assignment",
  "assetMode": "multi-asset",
  "singleVideoUrl": null,
  "trackTypes": ["video", "music_notation", "movement_notation"],
  "assignmentPayloadStatus": "ready",
  "ltiHandshakeStatus": "local-mock"
}
```

Validators reject any non-null `singleVideoUrl`. Faculty seeds: `practice-relay/fixtures/faculty-multi-asset-template.json`.

## Honest procurement wording

> Practice Relay lab-only tier demonstrates multi-domain WorkRecord packages with multi-asset LTI shape, JWKS-ready RS256 signing (optional), and AGS service-token mock endpoints for HE pilot evaluation on a single lab host. It is not an IMS-certified product and does not replace Echo360/GoReact campus video LTI.

See also: [lab-only-tier.md](./lab-only-tier.md) and [ops.md](./ops.md).
