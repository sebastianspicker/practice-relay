# Security policy

## Supported versions

There is no supported release record. `0.4.0-alpha.1` is a source candidate, and
no production support or response-time commitment is offered.

## Reporting a vulnerability

Confidential reporting is not configured yet. This is a hard blocker before any
public alpha release.

Please do not open a public issue or discussion containing an exploit,
credential, personal data, or anything else sensitive. This repository does not
yet publish a monitored address or a verified GitHub private vulnerability
reporting route.

Before publication, a release owner must:

1. enable and test GitHub private vulnerability reporting on the canonical
   repository, or publish and test a monitored security address;
2. record the exact route and expected acknowledgement window here;
3. point the Code of Conduct and issue chooser at the same route;
4. verify the route without disclosing report contents publicly.

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
