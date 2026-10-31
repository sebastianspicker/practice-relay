# Security policy

## Supported versions

There is no supported release record. `0.4.0-alpha.1` is a source candidate, and
no production support or response-time commitment is offered.

## Reporting a vulnerability

Report vulnerabilities privately through GitHub private vulnerability
reporting on the canonical repository: open the **Security** tab and choose
**Report a vulnerability**, or go directly to
<https://github.com/sebastianspicker/practice-relay/security/advisories/new>.
Only the repository maintainers can see the report.

The release owner aims to acknowledge a report within 14 days. This is a
best-effort goal, not a response-time commitment.

Please do not open a public issue or discussion containing an exploit,
credential, personal data, or anything else sensitive.

The route was enabled on 2026-10-31. Before publication, the release owner must
still verify it end to end with a test report from a non-maintainer account,
without disclosing report contents publicly.

A useful report names the affected package or path, minimal reproduction steps,
expected impact, and any relevant version or commit. Do not include real
participant media or unrelated personal data.

## Current boundaries

- The API binds to loopback by default. A non-loopback bind requires strict
  secrets and configured users.
- Browser CORS is denied by default. Accepted origins and non-loopback Host
  values need exact configuration, and accepted responses vary on `Origin`.
- Starting directly with the shipped synthetic identities and development
  signing secret requires `PRACTICE_RELAY_ALLOW_SYNTHETIC_AUTH=1`.
- Built-in identities and configured plaintext passwords are for synthetic local
  evaluation only.
- Local LTI routes are a lab mock for tests, not IMS certification or campus
  single sign-on.
- Durable JSON and media stores rely on host filesystem access controls and do
  not claim encryption at rest.
- Consent and permitted-use fields are product-model controls, not a statement
  of legal compliance.
- Media paths can hold biometric or participant data in a real deployment. Keep
  real participant media out of public forks, CI, issues, and releases.
- Never force-add environment files, key material, credentials, local data, or logs.
