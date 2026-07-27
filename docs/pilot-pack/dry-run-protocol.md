<!-- Synthetic repository dry-run guide. Why: explains the executable fixture check without presenting it as faculty or participant evidence. -->
# Synthetic repository dry-run

`pnpm demo:pilot-dry-run` combines the repository's synthetic WorkRecord, MvEI,
Workbench, and capture-bridge paths. It is a local consistency check. It is not
a classroom protocol, participant study, LMS conformance result, or deployment
test.

## Run

```bash
pnpm demo:pilot-dry-run
```

The command checks:

- the synthetic WorkRecord lifecycle and package export;
- the multi-asset assignment payload;
- valid and invalid MvEI fixtures;
- MvEI Workbench load, emit, and edit helpers;
- capture-bridge fixture output;
- the blank decision-log safeguard; and
- prohibited-claim boundaries in its own output.

Capture artifacts are written under `test-results/generated-fixtures/capture-lab/`.
They contain fixture data only. The command leaves
[decision-log.md](decision-log.md) blank and must not be cited as pilot or user
research evidence.

Useful narrower checks are:

```bash
pnpm demo:e2e
pnpm demo:capture-lab
pnpm test:capture-lab
pnpm test:kill-switches
```

Use [workflow-observation.md](workflow-observation.md),
[workflow-interview.md](workflow-interview.md), and
[baseline-pilot-measures.md](baseline-pilot-measures.md) only with the relevant
institutional ethics, privacy, and repository processes in place.
