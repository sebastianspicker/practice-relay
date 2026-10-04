# MvEI Workbench

`@practice-relay/movement-workbench` is the local browser authoring surface for
MvEI Motif and pedagogical Laban-subset documents. It consumes the canonical
schemas, vocabulary, corpus, and glyph contracts from
`@practice-relay/movement`.

## Run

From the repository root:

```bash
pnpm --filter @practice-relay/movement-workbench dev
```

The command regenerates `src/index.html` from the shared demo Motif, then serves
the application on `http://127.0.0.1:5175`. Set `MVEI_WORKBENCH_PORT` to change
the port. The server mounts the repository's movement package so browser imports
resolve to the same contracts the packages use.

Workbench sessions and synchronization are local application state. There is no
hosted collaboration service, hardware capture pipeline, or full professional
Labanotation environment.

Read [MvEI architecture](../../docs/movement/architecture.md) before changing
document or vocabulary behavior.

The initial document is validated and embedded as escaped, nonexecuting JSON.
Editing and local session saves keep its title, item ordering, time anchors,
annotation links, and music co-timeline annex. Presentation HTML is never used as
document storage. Canvas tiles support click selection and Arrow, Home, and End
navigation with a single keyboard tab stop.

The Laban panel is a read-only projection of the active Motif. It refreshes after
edits and session loads and surfaces source provenance and conversion warnings.
It is not an independent corpus document or a lossless notation conversion.
Invalid or unavailable browser storage leaves the active document in place and
reports the error in the live status region.
