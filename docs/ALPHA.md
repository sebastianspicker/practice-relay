# Practice Relay public alpha

Status: local `0.4.0-alpha.1` source candidate. The version and candidate date
come from [`../release.json`](../release.json). Nothing here means the candidate
has been committed, tagged, published, or deployed.

Practice Relay prepares a portable, versioned, policy-aware WorkRecord for a
bounded handoff from creation through assessment or review to repository deposit.
It keeps selected evidence, people, represented subjects, permitted uses,
revisions, and export provenance together. It does not replace specialist
authoring, course administration, asset-management, assessment, or repository
systems.

The repository also contains MvEI, its shared movement contracts, and MvEI
Workbench — separate product surfaces. See [Product boundaries](products/README.md)
and [Architecture](ARCHITECTURE.md).

## What is implemented

- WorkRecord domain, membership, time, policy, media-reference, version, and
  snapshot contracts.
- Memory and durable JSON record stores with revision, event, audit, backup, and
  restore behavior.
- Filesystem, memory, and S3-compatible media adapters.
- A loopback-first API with record, media, handoff, health, readiness, metrics,
  local LTI, and lab-operations routes.
- Integrity-checked handoff manifests, RO-Crate 1.3 metadata, ZIP archives, and
  explicitly lossy OTIO, EAF, OSC, and MusicXML-reference projections.
- A static Practice Relay workspace with a labelled synthetic fallback record.
- MvEI schemas, vocabulary, corpus, browser parser, workbench, schema site, and
  movement toolkit.
- A local LMS-shaped LTI and AGS simulator.

These are source and deterministic local checks. They do not establish
participant use, external compatibility, or operational fitness.

## Limits

- Interfaces, schemas, and package layouts are alpha and can change through a
  reviewed breaking change.
- Workspace packages are private; packed-consumer checks are not npm publication.
- There is no production identity provider, database adapter, TLS or reverse
  proxy configuration, high-availability deployment, backup schedule, or
  off-host media recovery.
- The browser workspace has no production authenticated-session integration.
- The LTI path is a local mock, not a real LMS registration or IMS certification.
- MvEI supports Motif and a pedagogical Laban subset. Full professional
  Labanotation density, LabanWriter parity, and live capture hardware are out of scope.
- No institutional adoption, completed pilot, production support, or
  response-time commitment is established.

## Local evaluation

Requirements are Node.js 24 LTS and pnpm 9.15.0. From the repository root:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check:contracts
pnpm check:unit
```

Start individual surfaces with the commands in the [root README](../README.md),
the [Practice Relay guide](relay/README.md), and the [MvEI guide](movement/README.md).
Use only synthetic data and loopback listeners unless the
[operations guide](relay/operations.md) requirements are met.

## GitHub Pages demonstration

After a successful Pages publication, the expected URL is
<https://sebastianspicker.github.io/practice-relay/>. The workflow stages the
static application to `apps/relay-web/dist` and publishes it with the shared
movement modules, styles, assets, and a static screenshot tour. This document
does not claim the URL is live.

The page uses synthetic, sanitized local mock data. Its controls are simulated
and make no API or service writes. Interactive inspection is not evidence of
deployment readiness, participant use, institutional adoption, a pilot, or a
completed workflow. HTML snapshots and screenshots are review artifacts, not
release evidence.

## Publication boundary

`pnpm check:release` validates the local source set only. Publication also needs
accepted maintainers, a tested confidential security-reporting route, a clean
reviewed checkout, passing CI, remote repository checks, and explicit approval.
Follow the [release procedure](../RELEASING.md) and
[release checklist](RELEASE-CHECKLIST.md).
