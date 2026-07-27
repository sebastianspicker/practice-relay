## Summary

<!-- What changed and why (Practice Relay / WorkRecord Core / MvEI / MvEI Workbench). -->

## Checklist

- [ ] `pnpm validate:schemas` passes
- [ ] `pnpm validate:docs` passes
- [ ] `pnpm typecheck` and `pnpm quality:check` pass
- [ ] `pnpm test` passes
- [ ] `pnpm verify:public-hygiene` passes for public-facing changes
- [ ] No forbidden marketing claims (first digital score, first browser Laban, LabanLite = MvEI, AI coach as Practice Relay primary, IMS certified, multi-campus SSO shipped)
- [ ] Practice Relay and MvEI Workbench remain separate applications
- [ ] Movement schemas only under `@practice-relay/movement-encode` (if touched)
- [ ] Docs / screenshots updated if user-facing behaviour changed
- [ ] Brief JSDoc / file comment on new public functions (what + why)

## Test plan

<!-- Commands and API/CLI paths exercised. For UI work include demo:render-html, demo:screenshots, and visual QA evidence or the exact renderer blocker. -->
