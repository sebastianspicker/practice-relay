# Maintainer status

A release owner is assigned (see the appointment record below). The Practice
Relay lead, MvEI lead, and documentation steward roles remain unassigned, and
there is no public maintainer contact, funded team, external board, or
consortium. The release checklist still requires those roles before a public
alpha publication.

## Required roles

| Role | Assigned | Scope |
|---|---|---|
| Release owner | Sebastian Spicker | Candidate approval, local and CI evidence, source-archive review, publication controls |
| Practice Relay lead | Unassigned | Practice Relay application, WorkRecord consumers, API, storage, and the lab-only LTI boundary |
| MvEI lead | Unassigned | MvEI schemas, corpus, validators, reference implementations, and MvEI Workbench |
| Documentation steward | Unassigned | Public documentation, evidence boundaries, release notes, claim guards |

Names and public contact details appear here only after the person accepts the
role and approves publishing them. Confidential vulnerability reporting is
separate and uses GitHub private vulnerability reporting; see
[`../SECURITY.md`](../SECURITY.md).

## Appointment record

Record each appointment with:

1. the role and accepted scope;
2. the person's explicit acceptance;
3. the effective date and review term;
4. a public contact, only once approved; and
5. any repository or release permissions granted or removed.

Do not put private addresses, personal phone numbers, or unapproved contact
details in this file.

| Role | Person | Accepted | Effective | Review | Public contact | Permissions |
| --- | --- | --- | --- | --- | --- | --- |
| Release owner | Sebastian Spicker | 2026-10-31, by the person, for the alpha-readiness pass | 2026-10-31 | at the next release candidate | not published; use the issue process or the private route in [`../SECURITY.md`](../SECURITY.md) | repository owner on the canonical GitHub repository |

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
publicly; use the private route in [`../SECURITY.md`](../SECURITY.md), which
must be tested end to end before the public alpha.

See [`CONTRIBUTING.md`](../CONTRIBUTING.md), [`RELEASING.md`](../RELEASING.md),
and [`RELEASE-CHECKLIST.md`](RELEASE-CHECKLIST.md) for the current local process.
