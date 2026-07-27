<!-- Practice Relay API guide. Why: maps the implemented lab API without presenting the mock or filesystem boundary as a production service. -->
# Practice Relay API

The API is a local alpha surface for WorkRecord lifecycle, packaging, media,
operations, and LTI protocol fixtures. It listens on `127.0.0.1:8787` by
default. See [`../openapi/openapi.yaml`](../openapi/openapi.yaml) for the
machine-readable route document and [ops.md](ops.md) for runtime limits.

## Public and authentication routes

| Method | Path | Access and purpose |
|---|---|---|
| `GET` | `/health` | Public liveness and non-secret runtime labels |
| `GET` | `/readyz` | Public store, media, and secret-mode probes |
| `GET` | `/profiles` | Public WorkRecord profile definitions |
| `GET` | `/demo/export` | Public synthetic package; `format=zip` returns ZIP |
| `POST` | `/auth/login` | Local configured-user login with process-local throttling |
| `GET` | `/me` | Current bearer identity |
| `GET` | `/auth/users` | Configured faculty or administrator only |

The built-in development identities and configured plaintext-password format
must not be used for real participants or exposed on an untrusted network.

## WorkRecord routes

All routes in this section require an `Authorization: Bearer <session>` header.
Membership and mutation rules depend on the configured user's role and the
record membership.

| Method | Path | Purpose |
|---|---|---|
| `GET`, `POST` | `/work-records` | List member-visible records or create a record |
| `GET`, `PATCH` | `/work-records/:id` | Read a record or update supported top-level fields |
| `POST` | `/work-records/:id/members` | Add a configured member |
| `GET` | `/work-records/:id/versions` | Return version tags and store events |
| `GET` | `/work-records/:id/collab` | Return process-local collaboration status or overlay |
| `POST` | `/work-records/:id/tracks` | Add a track |
| `POST` | `/work-records/:id/takes` | Add take identity; media metadata is server-assigned by upload |
| `PUT` | `/work-records/:id/preferred-take` | Select an existing take |
| `POST` | `/work-records/:id/regions` | Add a time region |
| `POST` | `/work-records/:id/comments` | Add a region comment |
| `POST` | `/work-records/:id/comments/:commentId/resolve` | Resolve a comment |
| `POST` | `/work-records/:id/consent` | Attach a use-policy snapshot |
| `POST` | `/work-records/:id/submit` | Add a submission version tag |
| `POST` | `/work-records/:id/analysis` | Add an analysis track under mutation policy |
| `POST` | `/work-records/:id/mvei` | Attach an MvEI Motif reference as `movement_notation` |
| `POST` | `/work-records/:id/interop` | Import or export an EAF or OTIO projection |
| `POST` | `/work-records/:id/export` | Build the WorkRecord package; `format=zip` returns ZIP |
| `POST` | `/work-records/:id/share` | Validate the package policy boundary and return a local result |

The evidence-oriented resource routes are separate from the older mutation
surface:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/work-records/:id/subjects` | Add a represented subject |
| `POST` | `/work-records/:id/artifacts` | Add artifact metadata |
| `POST` | `/work-records/:id/annotations` | Add a Web Annotation shaped annotation |
| `POST` | `/work-records/:id/policies` | Add a purpose, destination, and subject policy |
| `POST` | `/work-records/:id/snapshots` | Record an artifact snapshot |
| `POST` | `/work-records/:id/exports` | Evaluate purpose and destination, then return RO-Crate metadata when allowed |

## Media routes

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/work-records/:id/takes/:takeId/media` | Authorized upload with per-process admission and per-record quota |
| `GET` | `/media/*` | Authorized download after record membership and exact storage-key checks |

The request limit is 200 MiB, the retained quota is 1 GiB per record, and only
one upload is admitted per process. Bodies are buffered. See [ops.md](ops.md)
for adapter and multiwriter limits.

## Operations routes

`/metrics` and `/ops/*` require a configured user whose `defaultRole` is
`admin`. Restore also requires `PRACTICE_RELAY_LAB_OPS=1`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/metrics` | Process-local Prometheus metrics |
| `POST` | `/ops/backup` | Create a record-store backup; media is excluded |
| `GET` | `/ops/backups` | List record-store backups |
| `POST` | `/ops/restore` | Run the lab-only restore path |
| `GET` | `/ops/audit` | Return record-store audit events |

## LTI local-mock routes

| Method | Path | Purpose |
|---|---|---|
| `GET`, `POST` | `/lti/login` | OIDC login initiation |
| `GET` | `/lti/jwks` | Configured public key or active HS256 status |
| `POST` | `/lti/launch` | Verify a token using one-time process-local state and nonce |
| `POST` | `/lti/oauth/token` | Local client-credentials service token |
| `POST` | `/lti/ags/scores` | Local AGS score processing with service-token scope |
| `POST` | `/work-records/:id/lti` | Mutation-authorized launch construction or simulated AGS result |

These routes are test fixtures, not proof of LMS registration or IMS
certification. See [lti-lms-registration.md](lti-lms-registration.md).

## Errors and revisions

Request failures use `application/problem+json`. Invalid JSON and request
values return `400`, authorization failures use `401` or `403`, missing
resources use `404`, stale supplied revisions use `409`, quota or body limits
use `413`, and login or upload admission can return `429`. Unexpected failures
return a generic `500` response without an internal stack trace.
