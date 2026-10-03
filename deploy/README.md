# Practice Relay single-host lab deployment

This directory holds a Docker Compose example for evaluating the Practice Relay
API on one host. It is not a high-availability, multi-campus, or certified
deployment profile, and CI does not depend on Docker or MinIO.

| File | Purpose |
|---|---|
| [`../docker-compose.production-lab.yml`](../docker-compose.production-lab.yml) | API, MinIO, and one-shot bucket initialization |
| [`../docker-compose.campus-lab.yml`](../docker-compose.campus-lab.yml) | API and mock-LMS evaluation, with optional MinIO |
| [`Dockerfile.practice-relay-api`](Dockerfile.practice-relay-api) | Node and pnpm image for the API service |
| [`docker-entrypoint-practice-relay-api.sh`](docker-entrypoint-practice-relay-api.sh) | Maps mounted secret files for clients that need environment variables |
| [`prometheus/practice-relay.yml`](prometheus/practice-relay.yml) | Optional local Prometheus scrape configuration |
| `secrets/` | Secret file layout and safe placeholders |

## Requirements

- Docker Engine with Docker Compose v2
- Local replacements for every placeholder under `deploy/secrets/example/`
- Free loopback ports 8787, 9000, and 9001 (plus 8790 for campus-lab)

The repository's Node and pnpm requirements apply only to host commands. The
Compose build emits the API as a Node ESM entrypoint, copies the canonical
WorkRecord and handoff schema assets beside it, and deploys a filtered production
dependency graph. The runtime image needs neither `tsx` nor the root development
tools.

## Start the lab stack

Create ignored local secret files from the committed examples, then replace every
placeholder. Do not commit the results.

```bash
mkdir -p deploy/secrets/local
cp deploy/secrets/example/* deploy/secrets/local/
docker compose -f docker-compose.production-lab.yml up --build
```

The services refuse blank and known placeholder credentials. See
`secrets/README.md` for the expected files and operator checks.

The published endpoints are:

| Endpoint | Purpose |
|---|---|
| `http://127.0.0.1:8787/health` | API liveness |
| `http://127.0.0.1:8787/readyz` | API readiness and dependency checks |
| `http://127.0.0.1:9000` | MinIO S3-compatible API |
| `http://127.0.0.1:9001` | MinIO console |

Each host port is restricted to loopback. Inside its container the API binds
`0.0.0.0:8787` so Docker can forward the loopback host port; the strict secret and
configured-user checks must pass before that non-loopback container bind is
accepted.

## Configuration

| Concern | Compose setting |
|---|---|
| Record store | JSON store at `/var/lib/practice-relay/data` |
| Record namespace | Static tenant prefix `lab-default` |
| Media | S3-compatible object storage in MinIO |
| Bucket | One-shot initializer creates `practice-relay-media` |
| Secrets | Docker file mounts with `SECRET_BACKEND=file` |
| Restore | Disabled because `PRACTICE_RELAY_LAB_OPS=0` |

The tenant prefix separates record-store paths within this process. It is not an
authorization boundary or evidence of multi-tenant isolation, and media objects
are not tenant-prefixed. The JSON store supports one API writer and provides no
transactional coordination across processes.

Record backup operations cover the JSON record-store tree but exclude the MinIO
media volume, so a complete lab backup needs an independent object-store backup.
See [`../docs/relay/operations.md`](../docs/relay/operations.md) for the
implemented routes and restore constraints.

## Local validation without Docker

The API build emits and starts the filtered production package from a temporary
layout, verifying `node dist/index.mjs`, `GET /health`, and an authenticated
create, consent, and package-export path that loads both canonical schema sets.
It needs no Docker, root development dependencies, MinIO, or persistent lab data:

```bash
pnpm --filter @practice-relay/relay-api run build
```

Docker startup, volume recovery, and MinIO interoperability remain deployment
checks that need an operator-controlled environment.

## Network access

Do not widen the Compose port bindings to expose the API directly. If another
machine needs access, put an authenticated TLS-terminating reverse proxy in front
of the API and review the security assumptions first; this repository does not
provide that proxy. Configure the proxy's exact `Host` value in
`PRACTICE_RELAY_ALLOWED_HOSTS` and any browser client's exact origin in
`PRACTICE_RELAY_ALLOWED_ORIGINS`.

## Stop the stack

```bash
docker compose -f docker-compose.production-lab.yml down
```

This retains named volumes. Removing volumes deletes local record and media state,
so it is intentionally not listed as a routine command.

## Campus-lab mock LMS

The campus-lab example starts the API and the repository mock LMS. It does not
install Canvas or Moodle and is not evidence of an external LMS registration.
Prepare the same ignored secret files, then run:

```bash
docker compose -f docker-compose.campus-lab.yml up
```

The mock admin is at `http://127.0.0.1:8790/`, and the API stays at
`http://127.0.0.1:8787/`. For the optional MinIO profile:

```bash
PRACTICE_RELAY_OBJECT_STORE=s3 \
  docker compose -f docker-compose.campus-lab.yml --profile minio up
```

Stop the campus-lab stack without deleting its named volumes:

```bash
docker compose -f docker-compose.campus-lab.yml down
```

See the [operations guide](../docs/relay/operations.md) for the local safety
boundary and [API and contracts](../docs/relay/api-and-contracts.md) for the mock
endpoint flow.
