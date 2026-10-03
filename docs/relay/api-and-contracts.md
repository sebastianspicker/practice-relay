# Practice Relay API and external contracts

[`apps/relay-api/openapi.yaml`](../../apps/relay-api/openapi.yaml) is the
maintained HTTP reference. The implemented path and method registry is
[`apps/relay-api/src/public-routes.ts`](../../apps/relay-api/src/public-routes.ts).
`pnpm check:contracts` fails when the two diverge.

## Route groups

| Group | Purpose | Access boundary |
| --- | --- | --- |
| `/health`, `/readyz` | Process liveness and dependency readiness | Public probe responses |
| `/metrics`, `/ops/*` | Process metrics, JSON-store backup, restore, and audit | Configured operations administrator; restore also needs an environment gate |
| `/auth/*`, `/me` | Local login, configured-user discovery, session identity | Login or bearer session as specified by OpenAPI |
| `/work-records` and `/work-records/{id}/*` | WorkRecord lifecycle, media metadata, policy, snapshots, package export, projections | Bearer session plus WorkRecord membership and domain permission |
| `/media/{storageKey}` | Authorized media retrieval | Bearer session, record membership, and a matching take |
| `/lti/*` | Local OIDC, launch, JWKS, token, and AGS-shaped flows | Local registration, state, signature, and scope checks |

The API checks Host and Origin policy before routing. CORS is denied unless an
exact allowed origin is configured; non-loopback Host values also need an exact
allow-list entry.

## Handoff contracts

`packages/handoff` produces an integrity manifest, RO-Crate 1.3 metadata, and ZIP
output. Package export is downstream of a complete canonical WorkRecord and a
fail-closed release decision.

OTIO, EAF, OSC, and MusicXML-reference results are intentionally lossy. Every
result carries stable `losses` entries with an explanation and `omittedFields`,
and import paths report warnings in the same spirit. Callers keep those reports
and never present a projection as an equivalent WorkRecord.

Evidence-specific purpose and destination grants are distinct from a whole-record
release decision; neither is inferred from the other.

## LTI boundary

`apps/lti-simulator` and `packages/lti` provide local registration, OIDC, JWT,
launch, and AGS-shaped paths for tests. They are not Canvas, Moodle, or a
production LMS integration and do not establish IMS certification. Real LMS
registration needs external redirect, key, scope, deployment, identity, security,
and operational decisions this repository does not implement.
