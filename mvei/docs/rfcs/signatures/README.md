# External schema review signatures

This directory records an external consumer's position on a specific MvEI
schema change. The process is defined in
[`../../dual-rfc.md`](../../dual-rfc.md).

## File naming

Use:

```text
YYYY-MM-DD-<organization>-<topic>.md
```

## Required fields

| Field | Value |
|---|---|
| `status` | `live` |
| `organization` | Public project or organization name |
| `contact` | Approved public email address or durable project handle |
| `consumer` | Package, application, or implementation reviewed |
| `schemaVersions` | Exact document schema versions tested |
| `stance` | `support`, `support-with-migration`, or `block` |
| `date` | ISO date |
| `topic` | Identifier matching the proposed change |

## Template

```markdown
# External schema review: <organization> on <topic>

| Field | Value |
|---|---|
| status | live |
| organization | <public name> |
| contact | <approved public contact> |
| consumer | <implementation> |
| schemaVersions | <versions> |
| stance | support-with-migration |
| date | YYYY-MM-DD |
| topic | <change identifier> |

## Compatibility result

Describe the fixtures, commands, failures, and required migration window.
```

Do not commit example identities, private contacts, credentials, or simulated
approvals. A signature records compatibility feedback only. It is not a
standards vote, certification, or publication authorization.
