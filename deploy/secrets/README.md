# Practice Relay secret file layout

The lab Compose files mount credentials from ignored local files. Committed
files under `example/` contain placeholders only. Real values belong under
`local/`, which is excluded by `.gitignore`.

```text
deploy/secrets/
  example/
    auth
    lti
    users.json
    minio_root_user
    minio_root_password
  local/
    auth
    lti
    users.json
    minio_root_user
    minio_root_password
```

## Create local files

```bash
mkdir -p deploy/secrets/local
cp deploy/secrets/example/* deploy/secrets/local/
```

Replace every copied placeholder before starting either Compose file. Use
distinct auth and LTI secrets of at least 32 characters, configured user
passwords, and separate MinIO credentials. Do not put real values in source
files, documentation, command output, or Git history.

## API variables

| Variable | Purpose |
|---|---|
| `SECRET_BACKEND=file` | Prefer mounted files over plain environment values |
| `PRACTICE_RELAY_AUTH_SECRET_FILE` | Auth HMAC secret path |
| `PRACTICE_RELAY_LTI_SECRET_FILE` | LTI and AGS secret path |
| `PRACTICE_RELAY_AUTH_USERS_FILE` | Configured-user JSON path |
| `SECRET_FILE_DIR` | Optional directory fallback containing `auth` and `lti` |
| `PRACTICE_RELAY_REQUIRE_SECRETS=1` | Reject development secret defaults |
| `PRACTICE_RELAY_REQUIRE_CONFIGURED_AUTH_USERS=1` | Reject the fixed development user set |

The API trims mounted secret values. Health and readiness expose a boolean
secret-readiness check, not secret sources or values. The file readers do not
enforce host ownership or permission modes, so the operator remains responsible
for restricting the local files and mounts.

`deploy/docker-entrypoint-practice-relay-api.sh` maps mounted auth, LTI, and S3
credential files into environment variables only where a downstream client
requires that form. Prefer direct file resolution for the API secrets.

## Supported backends

| Backend | Status |
|---|---|
| `env` | Implemented for local process configuration |
| `file` | Implemented and used by the Compose examples |
| `kms-stub` | Local AES-GCM test and injection rehearsal only |

No cloud KMS or vault client is implemented in this repository.

## Operator checks

- Confirm `deploy/secrets/local/` remains ignored and untracked.
- Replace every placeholder before startup.
- Keep auth, LTI, user passwords, and object-store credentials distinct.
- Confirm `GET /readyz` reports `checks.secrets: true` without returning values.
- Confirm request logs and metrics contain no secret values.
- Rotate credentials after any suspected disclosure.
