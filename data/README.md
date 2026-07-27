# Local lab data (gitignored)

Directory reserved for durable Practice Relay lab runs when:

```bash
PRACTICE_RELAY_ALLOW_SYNTHETIC_AUTH=1 PRACTICE_RELAY_DATA=./data/practice-relay pnpm --filter @practice-relay/api start
```

Do not commit student media, real consent records, or PII.
Everything under `data/` except this README is ignored by git.
