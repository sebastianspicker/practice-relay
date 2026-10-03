# Local lab data (gitignored)

This directory is reserved for durable Practice Relay lab runs:

```bash
pnpm --filter @practice-relay/relay-api run build
PRACTICE_RELAY_ALLOW_SYNTHETIC_AUTH=1 PRACTICE_RELAY_DATA=./data/practice-relay pnpm --filter @practice-relay/relay-api start
```

Do not commit student media, real consent records, or personal data. Everything
under `data/` except this README is ignored by git.
