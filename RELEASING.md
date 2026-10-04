# Release procedure

This procedure prepares a reviewed source candidate for a public alpha. It does
not authorize Git or GitHub changes. For `0.4.0-alpha.1`, do not commit, tag,
push, publish a package, or create a GitHub release without explicit maintainer
approval.

## 1. Establish the release checkout

Use the canonical Git checkout with Node.js 24 LTS and pnpm 9.15.0. Confirm the
version identity, accepted ownership in `docs/maintainers.md`, and the
confidential reporting route.

```bash
node --version
corepack pnpm --version
git remote -v
git status --short
```

Do not disable package-manager verification to work around a toolchain error.

## 2. Verify the interactive Pages demo artifact

```bash
pnpm install --frozen-lockfile
node apps/relay-web/scripts/build.mjs
```

The Pages workflow stages the static application with
`node apps/relay-web/scripts/build.mjs` and uploads `apps/relay-web/dist`. Once publication is confirmed, verify
the loaded page interactively at the expected URL:
<https://sebastianspicker.github.io/practice-relay/>. Until then, treat that URL
as unverified.

Exercise the visible fallback state and primary controls in the loaded page. The
demo uses synthetic, sanitized local mock data, and its actions are simulated: it
makes no API or service writes. It is not participant, pilot, deployment-readiness,
adoption, or workflow-completion evidence. Do not use generated HTML snapshots or
PNG screenshots as release evidence; the retained review artifacts and the
screenshot tour are illustrative and local-only.

## 3. Run release gates

```bash
pnpm check:release
pnpm check:release:strict
git diff --check
```

The strict gate requires a configured confidential security route, available Git
metadata, and a clean worktree.

## 4. Review the public set

```bash
git status --short
git diff --stat
git diff
git ls-files
```

Confirm the candidate excludes local data, secrets, environment files, keys,
logs, local tool state, indexes, caches, browser profiles, build output, obsolete
visual material, and machine-specific paths. Review the final source archive as
well as the working tree.

Review `.env.example` privately and confirm it holds placeholders only. Do not
copy its values into logs, issues, or public release text.

## 5. Approval checkpoint

Stop and obtain explicit approval for the exact diff, version, commit, and known
limitations.

Only after approval may a maintainer create the reviewed commit, annotated tag
`v0.4.0-alpha.1`, push the approved branch and tag, and create a GitHub
prerelease that states the limitations in [`docs/ALPHA.md`](docs/ALPHA.md).

## 6. Verify publication

After publication, verify CI, rendered Markdown links and images, the license and
security pages, tag-to-commit identity, source archive contents, and prerelease
limitations.
