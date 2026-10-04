# @practice-relay/movement-toolkit

This private package adds Node and CLI tooling around the browser-safe
`@practice-relay/movement` contracts.

## Surfaces

| Import or binary | Purpose |
| --- | --- |
| `@practice-relay/movement-toolkit/capture` | Normalize capture-bridge inputs with provenance |
| `@practice-relay/movement-toolkit/engraver`, `mvei-engrave` | Render supported movement documents |
| `@practice-relay/movement-toolkit/labanwriter-import`, `mvei-labanwriter-import` | Import the documented intermediate JSON format |
| `@practice-relay/movement-toolkit/reference-reader`, `mvei-reference-read` | Read supported movement references |
| `@practice-relay/movement-toolkit/validator`, `mvei-validate` | Validate movement documents against the canonical schemas |

The LabanWriter path does not decode proprietary `.lw` files, and capture and
reference inputs do not establish hardware certification or a live capture
pipeline. Every transformation keeps provenance and reports unsupported material
where applicable. The capture adapter consumes exported landmarks; it does not
embed or rebuild FreeMoCap or OpenCap. Review third-party licenses before adding
external implementation code or assets.

## Build and verify

From the repository root:

```bash
pnpm --filter @practice-relay/movement-toolkit typecheck
pnpm --filter @practice-relay/movement-toolkit run build
pnpm check:packages
```

Type-check runs from source on a fresh install. The build emits the
library subpaths and CLI binaries under `dist`. The packed-consumer check installs
both movement package tarballs in an isolated project and verifies declarations,
exports, fixtures, and command-line behavior without publishing them.
