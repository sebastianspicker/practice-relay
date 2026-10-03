# Screenshots for `0.4.0-alpha.1`

Generated from the shipped interfaces with `pnpm screenshots`, which starts the
local surfaces and captures them with Playwright:

| File | Surface |
| --- | --- |
| `relay-web-movement.png` | Practice Relay workspace, synthetic `?demo=1` record |
| `relay-web-handoff.png` | Practice Relay handoff review, synthetic `?demo=1` record |
| `mvei-workbench.png` | MvEI Workbench local authoring surface |
| `mvei-schema-site.png` | MvEI schema and corpus reference site |

The root [README](../../../README.md) embeds these as a tour, and the GitHub
Pages build stages them into `tour.html`. Regenerate them after interface
changes; do not edit them by hand.

The `*.source.html` files are portable HTML snapshots produced by
`pnpm demo:render-html`, not the deployed application. Screenshots and snapshots
are documentation, not release evidence.
