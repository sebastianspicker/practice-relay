# Testing

Run commands from the repository root. While changing a bounded component, use a
focused workspace test, then run the broadest practical root gate.

## Focused checks

Workspaces with colocated tests expose a `test` script:

```bash
pnpm --filter @practice-relay/relay-api test
pnpm --filter @practice-relay/auth test
pnpm --filter @practice-relay/database test
pnpm --filter @practice-relay/lti test
pnpm --filter @practice-relay/media-store test
pnpm --filter @practice-relay/record-store test
pnpm --filter @practice-relay/runtime-state test
```

The relay-api `test` script also runs the migration CLI tests in
`apps/relay-api/scripts/`. Use the package's `typecheck`, `build`, or generated-contract script where its
manifest provides one. The static JavaScript applications have no separate
type-check lane.

## Root gates

`pnpm check:all` runs these lanes in order:

1. `pnpm check:types`
2. `pnpm check:build`
3. `pnpm check:packages`
4. `pnpm check:tooling` (code-quality gate plus every `scripts/*.verify.*` self-check)
5. `pnpm check:contracts`
6. `pnpm check:docs`
7. `pnpm check:boundaries`
8. `pnpm check:unit`

`check:build` emits `movement`, `movement-toolkit`, and the API runtime.
`check:packages` then consumes the emitted movement artifacts in isolated
checks. Unit tests run from source, so they are valid on a fresh checkout.

`pnpm check:release` adds public-source hygiene. The strict release gate also
requires external security-reporting closure and a clean Git worktree, so it is
not an ordinary development gate.

## Documentation-only changes

At minimum, run:

```bash
pnpm check:docs
node --import tsx scripts/validate-evidence.ts
git diff --check
```

Run `pnpm check:contracts` when API, schema, evidence, package-contract, or
product-boundary documentation changes.

## User-interface changes

Run the affected app tests and inspect the live surface locally. The portable
HTML snapshots from `pnpm demo:render-html` support review but do not replace
browser interaction, accessibility inspection, or Pages verification.
`pnpm screenshots` refreshes the README and Pages tour images.

Report failed, skipped, unavailable, and environment-blocked checks separately.

## Benchmarks

`pnpm benchmark:runtime` measures single-record JSON reads and mutations at 100,
1,000, and 10,000 records, plus authentication event-loop responsiveness, on
generated records in a temporary directory. Treat its timings as machine-specific
comparisons, not service-level guarantees.

`pnpm benchmark:media` measures 1 MiB and 64 MiB filesystem uploads and verified
downloads using generated 64 KiB chunks. It reports timing and sampled RSS growth
and removes its private temporary store. It does not measure cross-host S3
throughput.
