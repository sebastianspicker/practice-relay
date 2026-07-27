# 0.4.0-alpha.1 runtime images

This directory contains runtime PNGs for every current browser surface. The three primary application/reference surfaces also retain portable HTML snapshots.

Practice Relay’s PNG captures the Quiet Dossier shell (sparse three-column handoff workspace) with the labeled synthetic fallback after a deterministic `401` on `/work-records`.

| Surface | Runtime PNG | Inspectable HTML |
|---|---|---|
| Practice Relay web | [`practice-relay-web.png`](practice-relay-web.png) | [`practice-relay-web.source.html`](practice-relay-web.source.html) |
| MvEI schema site | [`mvei-schema-site.png`](mvei-schema-site.png) | [`mvei-schema-site.source.html`](mvei-schema-site.source.html) |
| MvEI Workbench | [`mvei-workbench.png`](mvei-workbench.png) | [`mvei-workbench.source.html`](mvei-workbench.source.html) |
| MvEI corpus catalogue | [`mvei-corpus-site.png`](mvei-corpus-site.png) | [`../../../packages/movement-encode/fixtures/corpus/site/index.html`](../../../packages/movement-encode/fixtures/corpus/site/index.html) |
| LTI mock admin (lab only) | [`lti-mock-admin.png`](lti-mock-admin.png) | Rendered by `renderUi()` |

Refresh both forms from the repository root:

```bash
pnpm demo:render-html
pnpm demo:screenshots
```

`demo:screenshots` starts loopback servers, loads all five surfaces with Playwright and a locally installed Chrome or Chromium executable, waits for meaningful state, verifies primary controls and fixture links, checks for mobile horizontal overflow, and writes the PNG files. The Practice Relay request is deterministically answered with `401` so the captured image shows the current labeled synthetic fallback instead of depending on an ambient API process. The LTI screenshot remains an explicitly local lab mock and does not contact a real LMS.

The screenshots contain only synthetic repository fixtures. They do not show
real participants or remote services.
