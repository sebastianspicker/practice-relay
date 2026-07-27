# Release procedure

This procedure prepares a reviewed source candidate for a public alpha. It does not authorize Git or GitHub changes. For `0.4.0-alpha.1`, do not commit, tag, push, publish a package, or create a GitHub release without explicit maintainer approval.

## 1. Establish the release checkout

Use the canonical Git checkout with Node.js 20 or later and pnpm 9.15.0. Confirm the version identity, accepted ownership in `docs/maintainers.md`, and confidential reporting route.

```bash
node --version
corepack pnpm --version
git remote -v
git status --short
```

Do not disable package-manager verification to work around a toolchain error.

## 2. Install and regenerate evidence

```bash
pnpm install --frozen-lockfile
pnpm demo:capture-lab
pnpm demo:render-html
pnpm demo:screenshots
```

Inspect the Practice Relay, MvEI schema-site, MvEI Workbench, corpus, and LTI
mock PNGs. Check visible names, alpha status, fallback states, clipping, private
data, and unsupported claims. Confirm that the matching source snapshots were
refreshed.

## 3. Run release gates

```bash
pnpm release:check
pnpm release:check:strict
git diff --check
```

The strict gate requires complete current PNG evidence, a configured confidential security route, available Git metadata, and a clean worktree.
The release and maturity checks refresh `test-results/generated-fixtures/osc/` and
`test-results/generated-fixtures/capture-lab/`. Include those paths in the review.

## 4. Review the public set

```bash
git status --short
git diff --stat
git diff
git ls-files
```

Confirm that the candidate excludes local data, secrets, environment files,
keys, logs, local tool state, indexes, caches, browser profiles, build
output, obsolete visual material, and machine-specific paths. Review the final
source archive as well as the working tree.

Review `.env.example` privately and confirm that it contains placeholders only.
Do not copy its values into logs, issues, or public release text.

## 5. Approval checkpoint

Stop and obtain explicit approval for the exact diff, version, and known
limitations. Record the approved commit identifier in
[`RELEASE_STATUS.md`](RELEASE_STATUS.md).

Only after approval may a maintainer create the reviewed commit, annotated tag
`v0.4.0-alpha.1`, push the approved branch and tag, and create a GitHub
prerelease that states the limitations in [`docs/ALPHA.md`](docs/ALPHA.md).

## 6. Verify publication

After publication, verify CI, rendered Markdown links and images, license and security pages, tag-to-commit identity, source archive contents, and prerelease limitations. Change `RELEASE_STATUS.md` from candidate to published only after those checks pass.
