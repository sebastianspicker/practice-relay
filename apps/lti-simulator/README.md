# LTI simulator

`@practice-relay/lti-simulator` is an LMS-shaped local test driver for tool
registration, OIDC initiation, launch, JWKS, tokens, and AGS-shaped score
requests. It is not Canvas, Moodle, a production LMS, or an IMS certification
implementation.

## Run

Start the Practice Relay API first, then run from the repository root:

```bash
pnpm --filter @practice-relay/lti-simulator start
```

The simulator defaults to `http://127.0.0.1:8790` and targets
`http://localhost:8787`.

| Variable | Purpose |
| --- | --- |
| `MOCK_PLATFORM_HOST` | Listener host; defaults to loopback |
| `MOCK_PLATFORM_PORT` | Listener port; defaults to `8790` |
| `MOCK_PLATFORM_ALLOW_NON_LOOPBACK=1` | Required acknowledgement before a non-loopback bind |
| `PRACTICE_RELAY_API_BASE` | Practice Relay API origin |
| `PRACTICE_RELAY_LTI_SECRET` | Local shared HMAC secret when the request does not supply one |
| `PRACTICE_RELAY_LTI_CLIENT_SECRET` | Local client-credentials secret override |

The fixtures under [`fixtures`](fixtures) describe Canvas- and Moodle-shaped
registration fields for testing only; they do not prove that an external LMS
accepts this tool.

## Verify

```bash
pnpm --filter @practice-relay/lti-simulator test
```

Use `dev` instead of `start` for Node watch mode. See the
[API and contracts guide](../../docs/relay/api-and-contracts.md) and
[operations guide](../../docs/relay/operations.md).
