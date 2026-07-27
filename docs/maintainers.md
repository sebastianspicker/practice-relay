# Maintainer status

No maintainer is assigned in this source snapshot. No public maintainer contact,
funded team, external board, or consortium is established by the repository.
This is a governance gap for public alpha publication.

## Required roles

| Role | Current assignment | Scope |
|---|---|---|
| Release owner | Unassigned | Candidate approval, local and CI evidence, source-archive review, and publication controls |
| Practice Relay lead | Unassigned | Practice Relay application, WorkRecord package consumers, API, storage, and lab-only LTI boundary |
| MvEI lead | Unassigned | MvEI schemas, corpus, validators, reference implementations, and MvEI Workbench |
| Documentation steward | Unassigned | Public documentation, evidence boundaries, release notes, and claim guards |

Names and public contact details may be added only after the person accepts the
role and approves publication of that contact. Confidential vulnerability
reporting is separate and remains unconfigured; see [`../SECURITY.md`](../SECURITY.md).

## Appointment record

An appointment change should record:

1. the role and accepted scope;
2. the person's explicit acceptance;
3. the effective date and review term;
4. a public contact only when approved by that person; and
5. any repository or release permissions granted or removed.

Do not put private addresses, personal phone numbers, or unapproved contact
details in this file.

## Shared-contract review

Breaking changes to shared packages require the Practice Relay and MvEI roles
to acknowledge the change independently, document migration impact, update the
corpus or fixtures, and pass the relevant validation. Because both roles are
currently unassigned, no signature template in this repository constitutes an
approval.

The process is documented in
[`../mvei/docs/dual-rfc.md`](../mvei/docs/dual-rfc.md). The signature format is
a non-live template.

## Current escalation boundary

Public defects and documentation problems may use the repository's normal issue
process after the canonical repository owner confirms it. Security reports must
not be filed publicly. No confidential route is published yet, so that route
must be configured and tested before the public alpha.

See [`CONTRIBUTING.md`](../CONTRIBUTING.md),
[`RELEASING.md`](../RELEASING.md), and
[`RELEASE-CHECKLIST.md`](RELEASE-CHECKLIST.md) for the current local process.
