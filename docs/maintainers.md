# Maintainer status

No maintainer is assigned in this source snapshot. There is no public maintainer
contact, funded team, external board, or consortium. This is a governance gap
that blocks a public alpha publication.

## Required roles

| Role | Assigned | Scope |
|---|---|---|
| Release owner | Unassigned | Candidate approval, local and CI evidence, source-archive review, publication controls |
| Practice Relay lead | Unassigned | Practice Relay application, WorkRecord consumers, API, storage, and the lab-only LTI boundary |
| MvEI lead | Unassigned | MvEI schemas, corpus, validators, reference implementations, and MvEI Workbench |
| Documentation steward | Unassigned | Public documentation, evidence boundaries, release notes, claim guards |

Names and public contact details appear here only after the person accepts the
role and approves publishing them. Confidential vulnerability reporting is
separate and remains unconfigured; see [`../SECURITY.md`](../SECURITY.md).

## Appointment record

Record each appointment with:

1. the role and accepted scope;
2. the person's explicit acceptance;
3. the effective date and review term;
4. a public contact, only once approved; and
5. any repository or release permissions granted or removed.

Do not put private addresses, personal phone numbers, or unapproved contact
details in this file.

## Shared-contract review

A breaking change to a shared package needs the Practice Relay and MvEI roles to
acknowledge it independently, document the migration impact, update the corpus
or fixtures, and pass the relevant validation. Because both roles are unassigned,
no signature template here constitutes an approval.

The process is documented in the [MvEI documentation](movement/README.md); any
signature format remains a non-live template.

## Escalation

Public defects and documentation problems can use the normal issue process once
the canonical repository owner confirms it. Security reports must not be filed
publicly, and no confidential route is published yet — that route must be
configured and tested before the public alpha.

See [`CONTRIBUTING.md`](../CONTRIBUTING.md), [`RELEASING.md`](../RELEASING.md),
and [`RELEASE-CHECKLIST.md`](RELEASE-CHECKLIST.md) for the current local process.
