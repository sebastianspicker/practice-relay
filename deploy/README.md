# Practice Relay single-host lab deployment

This directory contains a Docker Compose example for evaluating the Practice
Relay API on one host. It is not a high-availability, multi-campus, or certified
deployment profile. CI does not depend on Docker or MinIO.

| File | Purpose |
|---|---|
| [`../docker-compose.production-lab.yml`](../docker-compose.production-lab.yml) | API, MinIO, and one-shot bucket initialization |
| [`../docker-compose.campus-lab.yml`](../docker-compose.campus-lab.yml) | API and mock-LMS evaluation, with optional MinIO |
| [`Dockerfile.practice-relay-api`](Dockerfile.practice-relay-api) | Node and pnpm image for the API service |
| [`docker-entrypoint-practice-relay-api.sh`](docker-entrypoint-practice-relay-api.sh) | Maps mounted secret files for clients that require environment variables |
| [`prometheus/practice-relay.yml`](prometheus/practice-relay.yml) | Optional local Prometheus scrape configuration |
| [`secrets/`](secrets/) | Secret file layout and safe placeholders |

## Requirements

- Docker Engine with Docker Compose v2
- Local replacements for every placeholder under `deploy/secrets/example/`
- Free loopback ports 8787, 9000, and 9001

The campus-lab example also requires free loopback port 8790.

The repository's Node and pnpm requirements apply only when running commands on
the host. The Compose image installs the locked workspace dependencies during
its build.

## Start the lab stack

Create ignored local secret files from the committed examples, then replace
every placeholder before starting the services. Do not commit the resulting
files.

```bash
mkdir -p deploy/secrets/local
cp deploy/secrets/example/* deploy/secrets/local/
docker compose -f docker-compose.production-lab.yml up --build
```

The services refuse blank and known placeholder credentials. See
[`secrets/README.md`](secrets/README.md) for the expected files and operational
checks.

The published endpoints are:

| Endpoint | Purpose |
|---|---|
| `http://127.0.0.1:8787/health` | API liveness |
| `http://127.0.0.1:8787/readyz` | API readiness and dependency checks |
| `http://127.0.0.1:9000` | MinIO S3-compatible API |
| `http://127.0.0.1:9001` | MinIO console |

Each host port is restricted to loopback. The API process binds
`0.0.0.0:8787` inside its container so Docker can forward the loopback host
port. The strict secret and configured-user checks are required before that
non-loopback container bind is accepted by the API.

## Configuration

| Concern | Compose setting |
|---|---|
| Record store | JSON store at `/var/lib/practice-relay/data` |
| Record namespace | Static tenant prefix `lab-default` |
| Media | S3-compatible object storage in MinIO |
| Bucket | One-shot initializer creates `practice-relay-media` |
| Secrets | Docker file mounts with `SECRET_BACKEND=file` |
| Restore | Disabled because `PRACTICE_RELAY_LAB_OPS=0` |

The tenant prefix separates record-store paths within this process. It is not
an authorization boundary or evidence of multi-tenant isolation. Media objects
are not tenant-prefixed. The JSON store supports one API writer and does not
provide transactional coordination across processes.

Record backup operations cover the JSON record-store tree. They do not include
the MinIO media volume. A complete lab backup therefore requires an independent
object-store backup. See [`../practice-relay/docs/ops.md`](../practice-relay/docs/ops.md)
for the implemented routes and restore constraints.

## Local validation without Docker

The repository does not ship automated record-store or API operations drills.
Treat Docker startup, volume recovery, and MinIO interoperability as deployment
checks that require an operator-controlled environment.

## Network access

Do not widen the Compose port bindings to expose the API directly. If another
machine must access this lab, place an authenticated TLS-terminating reverse
proxy in front of the API and review the security assumptions first. The
repository does not provide that proxy configuration. Configure the proxy's
exact `Host` value in `PRACTICE_RELAY_ALLOWED_HOSTS` and any browser client's
exact origin in `PRACTICE_RELAY_ALLOWED_ORIGINS`.

## Stop the stack

```bash
docker compose -f docker-compose.production-lab.yml down
```

This retains named volumes. Removing volumes deletes local record and media
state and is intentionally not included as a routine command.

## Campus-lab mock LMS

The campus-lab example starts the API and the repository mock LMS. It does not
install Canvas or Moodle and is not evidence of an external LMS registration.
Prepare the same ignored secret files described above, then run:

```bash
docker compose -f docker-compose.campus-lab.yml up
```

The mock admin is available at `http://127.0.0.1:8790/`, and the API remains at
`http://127.0.0.1:8787/`. To use the optional MinIO profile:

```bash
PRACTICE_RELAY_OBJECT_STORE=s3 \
  docker compose -f docker-compose.campus-lab.yml --profile minio up
```

Stop the campus-lab stack without deleting its named volumes:

```bash
docker compose -f docker-compose.campus-lab.yml down
```

See [`../practice-relay/docs/lab-only-tier.md`](../practice-relay/docs/lab-only-tier.md)
for the local safety boundary and
[`../practice-relay/docs/lti-lms-registration.md`](../practice-relay/docs/lti-lms-registration.md)
for the mock endpoint flow.
