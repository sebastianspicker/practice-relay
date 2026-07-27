# Practice Relay architecture

Candidate: `0.4.0-alpha.1`.

## Application components

| Component | Path | Current responsibility |
|---|---|---|
| Web shell | `practice-relay/apps/web` | Presents a WorkRecord and its handoff concerns; uses a labeled synthetic fallback when the unauthenticated API request fails |
| API | `practice-relay/apps/api` | Authenticated WorkRecord, media, export, audit, backup, restore, metrics, health, and local LTI routes |
| LTI library | `practice-relay/apps/lti` | Multi-asset assignment payload and local protocol helpers |
| LTI mock platform | `practice-relay/apps/lti-mock-platform` | Local OIDC, launch, JWKS, and AGS-shaped test driver |
| Authentication | `practice-relay/packages/auth` | Synthetic development users and configured-user loading |
| Record store | `practice-relay/packages/record-store` | In-memory and durable JSON record adapters, events, backup, and restore |
| Media store | `practice-relay/packages/media-store` | Local and S3-compatible object boundaries |
| Collaboration | `practice-relay/packages/collaboration` | In-process Yjs overlays for bounded WorkRecord fields when `COLLAB=1`; no network provider is shipped |
| Shared domain | `packages/work-record-core` | Neutral WorkRecord types, policy, and snapshots |
| Handoff package | `packages/work-record-package` | Manifest validation and RO-Crate 1.3 output |
| Interop | `packages/interop` | OTIO, EAF, and OSC conversion with explicit loss reporting |

## Current runtime flow

```text
Practice Relay web
  -> GET /work-records without a browser session
  -> API rejects the request
  -> web displays a labeled synthetic local record

Authenticated API client
  -> API router
  -> WorkRecord Core mutation and access checks
  -> record store and media store
  -> work-record package or interop projection
```

The browser shell does not yet implement sign-in or an authenticated API session. Its snapshot and export controls currently update visible local status only.

The API binds to `127.0.0.1:8787` by default. Non-loopback binding is rejected unless strict secret and configured-user requirements are both enabled.

## Storage

- The default record store is in memory.
- `PRACTICE_RELAY_DATA` enables the durable JSON adapter under a local directory.
- Local media storage uses `PRACTICE_RELAY_MEDIA`.
- S3-compatible media is optional and requires explicit configuration.
- The Postgres factory is exported but always throws; no database driver or implementation is shipped.

See [`ops.md`](ops.md) for exact paths, backup and restore behavior, and strict configuration.

## External boundaries

- Authoring, assessment, portfolio, and repository systems remain authoritative for their own data.
- LTI is a local mock and is not an IMS-certified campus integration.
- OTIO, EAF, OSC, MusicXML, and MvEI references are federation or projection boundaries. Conversion loss must remain explicit.
- Use-policy and consent fields record application decisions. They do not certify legal compliance.
- Practice Relay and MvEI Workbench remain separate applications.
