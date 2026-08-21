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

Refresh the portable HTML snapshots from the repository root:

```bash
pnpm demo:render-html
```

The PNGs are curated release snapshots retained for product documentation; the
repository does not automate browser capture. The Practice Relay image shows a
labeled synthetic fallback, and the LTI image remains an explicitly local lab
mock rather than evidence of a real LMS connection.

The screenshots contain only synthetic repository fixtures. They do not show
real participants or remote services.
