# Public alpha release checklist

Candidate: `0.4.0-alpha.1`. A candidate is not a release. Do not commit, tag, push, publish a package, or create a GitHub release without explicit maintainer approval.

## Identity and scope

- [ ] `release.json`, `package.json`, README files, and alpha guide name `0.4.0-alpha.1`.
- [ ] Practice Relay, MvEI, MvEI Workbench, and WorkRecord Core use their documented roles.
- [ ] Practice Relay and MvEI Workbench remain separate applications.
- [ ] Current docs distinguish implementation, incomplete work, and planned or external gates.
- [ ] Claim guards pass.

## Installation and local gates

```bash
pnpm install --frozen-lockfile
pnpm release:check
```

- [ ] A clean install succeeds with the lockfile in the canonical checkout.
- [ ] `pnpm release:check` passes without ignored failures.
- [ ] No production dependency was added without approval.
- [ ] Maintained source satisfies the repository line, parameter, complexity, and duplication checks.

## Runtime surfaces

```bash
pnpm demo:render-html
```

- [ ] The maintained HTML snapshots are refreshed and the affected surfaces are inspected locally.
- [ ] Visible fallback states and primary controls match the current implementation.
- [ ] Curated images contain no personal data, private URLs, credentials, internal hostnames, unrelated desktop content, obsolete labels, or unsupported capabilities.

## Repository and legal hygiene

- [ ] `pnpm verify:public-hygiene` passes.
- [ ] `LICENSE` contains the full Apache License 2.0 terms and `NOTICE` is present.
- [ ] `.gitignore` covers the technologies and local state actually used.
- [ ] No local tool state, operating-system metadata, logs, caches, coverage, builds, local databases, or obsolete visual exports are tracked.
- [ ] `.env.example` is reviewed privately and contains placeholders only.
- [ ] `git ls-files`, the full diff, and the source archive are reviewed.

## Community and remote state

- [ ] Accepted release, Practice Relay, MvEI, and documentation ownership is recorded in `docs/maintainers.md`.
- [ ] A monitored confidential vulnerability route is published and tested.
- [ ] The Code of Conduct and issue chooser point to that route.
- [ ] The canonical repository owner and name are confirmed.
- [ ] CI succeeds on the release commit.
- [ ] Default-branch protection and required checks are verified.
- [ ] Issue and pull-request templates render correctly.

## Strict publication gate

```bash
pnpm release:check:strict
git diff --check
git status --short
```

- [ ] The strict gate passes.
- [ ] The worktree is clean after the approved commit.
- [ ] Remaining limitations are copied into the prerelease body without expansion or marketing language.

## After explicit approval

Follow [`../RELEASING.md`](../RELEASING.md). Publish a GitHub prerelease, not a stable release. Do not attach real participant data, local configuration, or unverified binary artifacts.
