# Security policy

## Supported versions

This checkout provides no supported release record. `0.4.0-alpha.1` is a source
candidate, and no production support or response-time commitment is offered.

## Confidential reporting

Confidential reporting is not configured. This is a required blocker before a public alpha release.

Do not open a public issue or discussion containing an exploit, credential, personal data, or another sensitive report. This checkout does not contain a verified monitored address, and the audit did not verify GitHub private vulnerability reporting on a canonical remote repository.

Before publication, a release owner must:

1. enable and test GitHub private vulnerability reporting on the canonical repository, or publish and test a monitored security address;
2. record the exact route and expected acknowledgement window here;
3. point the Code of Conduct and issue chooser to the same route;
4. verify the route without disclosing report contents publicly.

A future report should include the affected package or path, minimal reproduction steps, expected impact, and any relevant version or commit identifier. Do not include real participant media or unrelated personal data.

## Current security boundaries

- The API binds to loopback by default. Non-loopback binding requires strict secrets and configured users.
- Browser CORS is denied by default. Accepted origins and non-loopback Host values require exact configuration, and accepted browser responses vary on `Origin`.
- Direct startup with shipped synthetic identities and the development signing secret requires `PRACTICE_RELAY_ALLOW_SYNTHETIC_AUTH=1`.
- Built-in identities and configured plaintext passwords are restricted to synthetic local evaluation.
- Local LTI routes are mock and lab-only, not IMS certification or campus single sign-on.
- Durable JSON and media stores rely on host filesystem access controls and do not claim encryption at rest.
- Consent and permitted-use fields are product-model controls, not a statement of legal compliance.
- Media paths can contain biometric or participant data in a real deployment. Do not use real participant media in public forks, CI, issues, or releases.
- Environment files, key material, credentials, local data, and logs must never be force-added.
