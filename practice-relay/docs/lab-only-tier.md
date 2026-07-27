# Practice Relay local evaluation tier

Status: binding for the `0.4.0-alpha.1` source candidate.

This tier is restricted to synthetic local evaluation. It is not an IMS-certified LTI integration, campus identity service, or production deployment.

| Capability | Current state | Excluded claim |
|---|---|---|
| API listener | Loopback by default | Publicly hardened service |
| Authentication | Synthetic development users or configured local users | Campus SSO or safe real-user password store |
| LTI | In-repository mock platform, local launch, JWKS, and AGS-shaped routes | Canvas or Moodle certification |
| Records | In-memory or durable JSON adapter | Production database or multi-writer availability |
| Media | Local or S3-compatible adapter | Managed encrypted media service |
| Secrets | Environment, file, or local KMS-stub injection | Cloud KMS integration |
| Backup and restore | Local drill over the durable adapter | Disaster-recovery guarantee |

## Required safety settings

The direct API binds to `127.0.0.1` unless `PRACTICE_RELAY_HOST` is set. A non-loopback host is rejected unless both `PRACTICE_RELAY_REQUIRE_SECRETS=1` and `PRACTICE_RELAY_REQUIRE_CONFIGURED_AUTH_USERS=1` are enabled.

Direct startup also requires strict identities or
`PRACTICE_RELAY_ALLOW_SYNTHETIC_AUTH=1`. The synthetic option is limited to
local evaluation. Browser requests are denied by default unless their exact
origin appears in `PRACTICE_RELAY_ALLOWED_ORIGINS`.

Configured passwords are currently compared as plaintext. Use synthetic credentials only. Do not use participant or institutional credentials.

Secret values belong in process environment or protected files and must never be logged or tracked. Variable names and storage behavior are documented in [`ops.md`](ops.md). The example layout under `deploy/secrets/example/` is structural only.

## Local LTI boundary

The mock platform can exercise registration-shaped configuration, local OIDC launch, JWKS, a multi-asset assignment claim, and AGS-shaped score requests. This is protocol test coverage, not external LMS registration.

The mock UI must remain labeled `MOCK PLATFORM - not Canvas`. The repository
does not claim IMS Global or 1EdTech certification. Run
`pnpm test:lab-only-claims` to check these boundaries.

See [`lti-lms-registration.md`](lti-lms-registration.md),
[`lms-registration-preflight.md`](lms-registration-preflight.md), and
[`../../docs/ALPHA.md`](../../docs/ALPHA.md).
