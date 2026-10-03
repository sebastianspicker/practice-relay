# Relay web workspace

`@practice-relay/relay-web` is a static browser application that uses the shared
`@practice-relay/movement` browser modules to inspect WorkRecords, evidence,
policy, handoff readiness, and MvEI references.

## Run

From the repository root:

```bash
pnpm --filter @practice-relay/relay-web dev
```

The local server defaults to `http://127.0.0.1:5173`; set
`PRACTICE_RELAY_WEB_PORT` to change the port. The API base is read from
`globalThis.PRACTICE_RELAY_API_BASE` before the application module loads, and
otherwise defaults to `http://localhost:8787`.

Sign in with a configured user to load authorized record summaries. Tokens stay
in memory until expiry, sign out, or page reload, and authentication failures
clear private records and local package previews. Requests have a ten-second
deadline, and newer filters or selections cancel superseded requests.

The title filter and Load more control use server pagination. Full records load
only on selection and are cached by user, record ID, and revision; evidence
selection changes stay local to that cached revision.

The Open synthetic demo button loads labelled fixture data on purpose. API
failures never switch the workspace into demo mode. `globalThis.PRACTICE_RELAY_STATIC_DEMO`
forces static demonstration mode. Demo actions are simulated and make no API or
service writes.

## Verify

```bash
pnpm --filter @practice-relay/relay-web test
```

The GitHub Pages workflow runs the same dependency-free Node test pattern, stages
the application with `node apps/relay-web/scripts/build.mjs`, and publishes
`apps/relay-web/dist`. Staging includes the movement browser modules, schemas,
vocabulary, public corpus fixtures, and the screenshot tour. Relative import-map
URLs work under a GitHub Pages repository subpath. Generated HTML snapshots and
screenshots are review aids, not the deployed application or participant evidence.

## Static build

```bash
pnpm --filter @practice-relay/relay-web build
```

The development server mounts `/packages/movement/` from the local package. The
static build copies browser dependencies into the same URL layout and omits the
Node development entrypoint, with no bundler or external CDN. Movement editing
uses the canonical Motif parser; the editor rejects Laban imports, while its
pedagogical Laban projection keeps conversion warnings. Authoring state stays in
memory, and JSON import/export is manual.

## Movement to handoff

Movement, Evidence, and Handoff share the selected WorkRecord. Movement supports
canonical Motif editing, time anchors, reorder, undo/redo, and manual JSON
import/export. Reference media can be previewed locally or fetched from an
authorized record; the preview control never uploads a local video. The original
standalone workbench remains available for its other workflows.

Use in handoff asks for explicit represented subjects, stores an immutable JSON
version through the existing media API, registers its evidence, and attaches an
MvEI track. Hash-derived identifiers let an unchanged document resume after a
partial failure. The latest movement notation reference opens on record selection
when hosted by the configured API; external references stay in the record and can
be imported manually. Drafts stay in memory and are cleared on sign out.

Handoff evaluates every stored artifact against an exact purpose and destination.
Unsaved movement changes and local package selections do not change that export.
Faculty/admin members may record a permission obtained elsewhere; this interface
does not collect or verify consent. A successful evidence export downloads the
API's RO-Crate metadata file; it does not bundle media or deliver to the
destination.

Use `?demo=1` for the isolated synthetic studio example. Its generated rehearsal
still is artwork, not playable footage or participant evidence, and its
attachments, permissions, and metadata are explicitly simulated. Real records
never inherit this example's media, document, or grants.
