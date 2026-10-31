# LTI simulator

`@practice-relay/lti-simulator` is an LMS-shaped local test driver for tool
registration, OIDC initiation, launch, JWKS, tokens, and AGS-shaped score
requests. It is not Canvas, Moodle, a production LMS, or an IMS certification
implementation.

## Run

The API and the simulator must sign and verify with the same LTI secret.
Without one, each process generates its own throwaway secret, and launch fails
with `invalid id_token` and AGS with rejected client credentials. Generate one
secret and export it in both terminals.

In the first terminal, from the repository root, create the secret and start
the API:

```bash
export PRACTICE_RELAY_LTI_SECRET="$(node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64url"))')"
echo "$PRACTICE_RELAY_LTI_SECRET"
pnpm --filter @practice-relay/relay-api run build
PRACTICE_RELAY_ALLOW_SYNTHETIC_AUTH=1 pnpm --filter @practice-relay/relay-api start
```

In a second terminal, export the value printed above and start the simulator:

```bash
export PRACTICE_RELAY_LTI_SECRET="<value printed in the first terminal>"
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
| `PRACTICE_RELAY_LTI_SECRET` | Shared HMAC secret when the request does not supply one; must equal the API's value |
| `PRACTICE_RELAY_LTI_CLIENT_SECRET` | Local client-credentials secret override |

The fixtures under [`fixtures`](fixtures) describe Canvas- and Moodle-shaped
registration fields for testing only; they do not prove that an external LMS
accepts this tool.

Use `dev` instead of `start` for Node watch mode. See the
[API and contracts guide](../../docs/relay/api-and-contracts.md) and
[operations guide](../../docs/relay/operations.md).
