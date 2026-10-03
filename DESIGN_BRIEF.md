# Practice Relay design brief

Redesign of the Practice Relay browser workspace (`apps/relay-web`), October 2026.
This brief records what the design is based on, the three directions considered,
and why one was chosen. The [final summary](#outcome) is at the end.

## 1. Product

Practice Relay prepares portable, versioned, policy-aware **WorkRecord handoffs**
between the tools where practice-based work is made, assessed, and kept. A record
holds evidence references (video, audio, scores, notes, Motif movement documents),
the people who are members of the record, the *represented subjects* who appear in
the evidence, and *recorded permissions* scoped to an exact purpose and destination.
From one record it produces integrity-checked metadata (RO-Crate) or a declared-loss
projection, and it says what it left out.

It does not author, assess, archive, or deliver the work, and the interface says so
repeatedly. Its honesty about scope is part of the product.

**The browser workspace** (`apps/relay-web`) is one page with three task contexts
on the selected record:

| Context | What happens | Source |
| --- | --- | --- |
| Movement | Compose or correct a Motif phrase (ordered symbols with millisecond time anchors) beside reference media | `src/studio/movement-editor.mjs` |
| Evidence | Inspect evidence, recorded use decisions, participants, and a five-point handoff check | `src/render/record.mjs`, `src/render/readiness.mjs` |
| Handoff | Enter an exact purpose and destination, see which represented subjects have a matching grant, generate evidence metadata or read why it is blocked, record a permission obtained elsewhere (faculty/admin only) | `src/studio/handoff*.mjs` |

Supporting surfaces: sign-in dialog, records dialog (filter, load more, refresh),
"use movement in this handoff" dialog (choose represented subjects, save immutable
version), local package preview dialog, and the static screenshot tour (`src/tour.html`).

**Key journey (primary):** open a record, then go to Handoff, enter purpose and destination,
read the permission state per represented subject, then check and generate, which ends
in either *metadata ready, nothing sent* or *blocked, with reasons*.

**Moment of value:** the point where the user can see, for one exact use, whether
every represented person has a matching recorded permission, and gets either a
downloadable metadata file or an exact list of what blocks it. Everything else in
the interface feeds that moment.

**Secondary journey:** shape a Motif phrase against rehearsal media, then choose *Use in handoff*,
name who is represented, and save. The workspace then moves to Handoff.

## 2. Audience

Documented users are students, educators, reviewers, researchers, data stewards,
and external collaborators in practice-based projects (`PRODUCT.md`). The fixtures
and the demo point to a sharper primary person:

**Primary: the studio educator who signs work out of the room.** A dance or
performing-arts lecturer, often also responsible for a design-studio or field-study
module. They hold faculty membership on records, review rehearsal material, and are
the person who must be sure that *Performer 02* agreed to *this* use before anything
leaves the studio.

- **Expertise:** deep in their discipline (phrasing, counts, staging, critique).
  Comfortable with institutional systems (LMS, repository forms) but does not think
  in RO-Crate, SHA-256, or policy identifiers.
- **Goals:** get evidence to the next reviewer correctly the first time; never send
  something a participant did not agree to; keep the movement material legible.
- **Anxieties:** consent mistakes involving students' bodies and images; "the system
  said OK" when it should not have; losing a draft; jargon that hides the real decision.
- **Distrusts:** cheerful SaaS optimism, green ticks without reasons, anything that
  looks like it collects consent or delivers files when it does not, AI-coach claims
  (explicitly forbidden in `src/shell.mjs`).
- **Daily tools:** LMS (Moodle/Canvas), video review tools, shared drives, notation
  or annotation software, paper: rehearsal notes, sign-in sheets, consent forms.
- **What signals quality to them:** the calm precision of a well-run rehearsal room:
  marked floor, clear calls, nothing extra. Exactness about who, what, and for what.
  Typography that respects the material instead of decorating it.

**Secondary:** students (export permitted, cannot record permissions; they need
blockers explained without dead ends), data stewards and reviewers (density,
identifiers, exact values), external collaborators (read-only clarity).

## 3. Brand traits

| Trait | Not |
| --- | --- |
| **Exact**: names the exact purpose, destination, subject, and file | pedantic, or code-shaped |
| **Calm**: high-key, quiet, unhurried; nothing competes with the decision | bland or empty |
| **Candid**: states what was *not* done (not sent, not verified, simulated) | apologetic or hedging |
| **Of the studio**: carries the material culture of rehearsal and practice | theatrical, costume, or "dancey" illustration |
| **Even-handed**: androgynous, unbranded-feeling, institution-neutral | corporate or cold |

## 4. Market observations

Drawn from category knowledge, not fresh site visits during this session
(confidence medium). The adjacent categories are video-assessment tools,
e-portfolios, institutional repositories, and LMS integrations.

- **Video review and assessment tools:** a bright SaaS blue, rounded cards, avatar stacks,
  a play button in the middle of everything, gamified progress rings.
- **E-portfolios:** template galleries, student-friendly pastels, page-builder chrome.
- **Repositories and data-steward tools:** utilitarian forms, dense tables, government-style
  sans, licence badges. Trustworthy but joyless, and opaque about *why*.
- **LMS integrations:** inherit the host LMS look; status is a coloured pill.

**Honour:** clear form labels; tabular identifiers; explicit status words; a
visible primary action; familiar dialog and tab behaviour.
**Break:** SaaS-blue, card grids, pills, rounded everything, and green ticks that come
without reasons. No category product treats *permission for an exact use* as the
main object on the screen, and this one should.

## 5. Current state (before)

- **Stack:** static ES modules, no bundler, no dependencies beyond the shared
  movement browser modules. CSS in `src/styles/*.css` imported by `src/app.css`.
  Files are capped at 500 lines and checked for duplication by `pnpm check:tooling`.
- **Layers:** three generations of styling coexist: "Quiet Dossier" (`base`, `dossier`,
  `decision`, `dialog`), "Ledger" (`layout.css`, `responsive.css`, neither imported:
  dead), and "high-key studio" (`studio`, `movement`, `handoff`). They redefine
  `button`, `.primary`, `dialog`, and `.app-header` against each other.
- **Type:** `--ui: "Inter", "Helvetica Neue", Arial`, but no font is loaded, so it
  renders as Helvetica on macOS and Arial elsewhere. Monospace is the system default.
- **Colour:** white, dusty lilac (`#756486`) actions, pale lilac selection.
- **Brand assets worth keeping:** the relay-path mark (three stations joined by
  one line), the lowercase `practice relay / mvei` voice, the high-key rehearsal
  still (generated artwork), and the user's chosen direction from September: bright,
  androgynous, minimal, subtly dance-oriented ("Studio Light / High-key").

**Weaknesses**

1. *The phrase decoration lies.* The arcs behind Motif tiles are decorative SVG
   that look like data but encode nothing; tiles are evenly spaced although each
   has a real time anchor.
2. *No hierarchy for the decision.* On Handoff the permission state, the
   moment of value, sits in a half-width column at equal weight with the form.
3. *State language is inconsistent*: pills on Evidence, ticks on Handoff, dots in
   the index, and `SIMULATED` tags on every row.
4. *Unloaded type and default controls*: native selects and checkboxes are unstyled,
   the button height is 42px everywhere, and the primary button is 214px wide whether or not it needs to be.
5. *Empty state* is a large grey box that repeats the same two sentences twice.
6. *Mobile* is a collapsed desktop. Motif tiles scroll sideways with no affordance,
   and the footer shows two lines of scope text.
7. *Repeated scope copy*: footer, status line, demo notice, and alpha note all
   say "local" in different words.
8. *Step labels* start at "02 / Prepare" with no step 01.

## 6. Constraints (load-bearing)

- **Element IDs, `data-*` hooks, and class names used by scripts or tests** (e.g.
  `#records`, `#handoff-form`, `#permission-list`, `.motif-tile`, `.motif-items`,
  `.state-pill granted`, `.export-blocker[role=alert]`, `[data-tab]`, `[data-record]`)
  must survive. Copy strings asserted in tests must survive: "Nothing has been
  sent", "Media bytes and permission records are not included", "unsaved changes",
  "evidence already stored in the record", "Use decisions", "Participants",
  "Role labels do not grant record access.", "No work records", "Prepare export",
  "Showing an explicit local example", "Simulate: " prefixes in demo mode.
- **Retired names and claims** in `FORBIDDEN_UI_STRINGS` must never appear.
- **No external requests at runtime**: the static build has "no bundler or
  external CDN". Fonts must be self-hosted.
- **Static delivery under a subpath**: all URLs relative; `index.html` must keep
  `./app.css`, `./assets/practice-relay-mark.svg`, and `./practice-relay-app.mjs` links.
- **Code-quality gate**: ≤500 lines per CSS/JS/HTML file; no 12-line duplicate blocks.
- **Honesty**: demo stays labelled synthetic; nothing may imply consent collection,
  delivery, or verification.
- **Accessibility**: WCAG 2.2 AA contrast, focus, keyboard, reduced motion,
  non-colour state cues (already a stated product requirement).

## 7. Assumptions log

| # | Assumption | Evidence | Confidence |
| --- | --- | --- | --- |
| A1 | The redesign scope is the Practice Relay workspace (`apps/relay-web`, incl. its tour page). MvEI Workbench and the schema site are a *separate* product and get their own pass later. | `PRODUCT.md` design requirement 6 ("remain separate applications"); README component table | Medium |
| A2 | The primary user is a performing-arts educator with faculty membership. | Demo defaults to faculty; `studioRecord`; earlier exploration's chosen persona; fixture profiles | Medium |
| A3 | Users work laptop-first; phones are used for checking, not for long editing sessions. | Evidence comparison and form entry; prior exploration | Medium |
| A4 | Light only. Rehearsal rooms and offices are bright, and the user chose high-key over a "Stage Dark" concept in September. | `output/design-exploration-2026-09-09/unified-dance/high-key.md` | Medium–low |
| A5 | The lilac/plum accent is brand equity worth evolving, not replacing. | Approved "Studio Light / High-key" direction; current tokens | Medium |
| A6 | The same tape-mark state language fits field-study and design-studio records too: survey flagging tape and masking tape on crit walls are the same material. | Fixture profiles: Performing arts, Field study, Design studio | Medium |
| A7 | Adding ~230 KB of self-hosted variable fonts is acceptable for a workspace (not a marketing page). | No performance budget documented; app already ships 3.5 MB of PNG artwork | High |
| A8 | Visual-only changes to rendered markup (new wrapper elements, class names) are acceptable provided IDs, hooks, and tested strings stay. | Tests assert strings and hooks, not layout | High |

---

## Design direction

The domain offers a lot of raw material. Rehearsal rooms are marked: coloured
**spike tape** on the floor fixes positions, so a phrase can be repeated exactly and
handed to the next cast. Dancers **"mark"** a phrase by walking it at low energy,
indicating rather than performing. That is precisely what this product does: it
does not carry the work, it marks it (references, hashes, who, for what) so it can
be handed on. Theatre has the **prompt book**, where cues are called *standby* and
then *go*. Registrars have **loan agreements**, whose permission is bound to a
borrower, a purpose, and a period. Movement notation has the **staff**, where
symbol length is duration and position is time.

### Direction A: Marking (studio floor, spike tape, time ruler)

- **Concept.** The interface is a marked rehearsal floor: a high-key chalk surface,
  graphite lettering, and strips of tape that fix the state of things. Tape is
  the one material shared by every practice this product serves: spike tape
  on the studio floor, flagging tape in fieldwork, and masking tape on the crit
  wall. Each permission is a mark someone put down, and it can be read from across the room.
- **Fits because** the educator's quality signal is the well-run room; exactness and
  calm, not decoration. It continues the user's chosen high-key, androgynous direction.
- **Type.** One family, three energies: **Archivo** (variable width and weight, OFL).
  Display is set *extended and light* (wdth 112, wght 300), open and full-out.
  Text is normal width at 400. Labels and tape lettering are *condensed caps* (wdth 70, wght 600),
  the way you'd write on tape with a marker. **Spline Sans Mono** sets only
  what is measured: time anchors, identifiers, hashes. Scale: 12 / 13 / 15 / 18 / 24 /
  34 / 52 (≈1.4 ratio above body; tight steps below for dense ledgers).
- **Colour.** Chalk floor `#F7F6F2`, sheet white for inputs and raised panels,
  graphite ink `#1F1D24` with two greys. A single **plum** (`#4E3D63`, evolved from
  the current lilac) for action and selection. Four tape colours, each with
  exactly one meaning: *sage* granted, *yellow* missing or hold, *red* denied, and
  *hatched violet* withdrawn. Tape is never decoration.
- **Layout.** A 12-column working grid with 40/24/16px gutters. Record identity sits on
  the left, and the three task contexts form a numbered route (01 Movement, 02 Evidence,
  03 Handoff) on one floor line. Handoff gives the permission ledger the right-hand
  column at full height; it is the decision. Hairline rules, not boxes or cards.
- **Motion.** Almost none. 120ms colour changes; the time-ruler marker slides to
  the selected symbol (transform); dialogs fade in over 160ms. Removed under
  `prefers-reduced-motion`.
- **Signature details.** (1) *Tape marks* are the only state language, used in
  permissions, the readiness check, the record index, and the synthetic-demo label.
  (2) *The phrase time ruler* replaces the decorative arcs with a true, proportional
  scale of the Motif's time anchors. On phones the phrase turns vertical, like a
  notation staff.
- **Against the category.** No pills, cards, blue, avatars, or progress rings.
  Status reads as a physical mark with a word on it.
- **Refuses** fake data decoration, rotated "playful" tape, illustration, gradients,
  emoji, and any tick that has no reason next to it.

### Direction B: Prompt book (cue calling)

- **Concept.** The stage manager's book: the record is the book, each check is a
  numbered cue in the margin, and handoff is *called* (Standby, then Go).
- **Type.** A book serif for record content (e.g. Newsreader) with a narrow grotesk
  for cue numbers in the margin; red-pencil annotations.
- **Colour.** Cream paper, black text, red pencil for holds, blue pencil for notes.
- **Layout.** A wide left margin "cue rail" with numbered cues aligned to the
  content they govern; script-like single column.
- **Motion.** A cue light that blinks once on standby.
- **Signature.** The cue rail, plus the *Standby / Go* language on the primary action.
- **Against the category.** Book-like and literary where competitors are app-like.
- **Refuses** sidebars and dashboards.
- **Weakness.** It is theatre, not dance, field study, or design studio. "Go"
  implies sending, which the product explicitly does not do. Cream and serif
  contradict the user's chosen high-key androgynous direction.

### Direction C: Loan register (registrar's paperwork)

- **Concept.** Handoff as a museum loan: object labels, accession numbers,
  condition reports, and loan agreements bound to borrower and purpose.
- **Type.** A typewriter-adjacent mono for accession data, and a neutral grotesk for text.
- **Colour.** Manila, card stock, archival grey, and a stamp red for refusals.
- **Layout.** Object-label cards in a register; a stamped agreement for the result.
- **Signature.** Tied luggage-tag labels for each evidence item and a stamp on
  completion.
- **Against the category.** Physical paperwork instead of SaaS chrome.
- **Refuses** imagery of people.
- **Weakness.** Fits data stewards better than the primary educator. It frames
  living practice as a museum object, and a "stamp" over-claims authority the
  alpha does not have.

### Choice

**Direction A, Marking.** It grows from the one material all three practice
domains share, it keeps the user's established high-key and plum equity, and its
signature details carry information: the tape marks are the permission state, and
the ruler is the phrase's real timing. B has the most charm but tips into theatre
and implies "go = send". C suits the steward, not the educator.

**Trade-offs accepted.** A is quieter than B and less immediately "story-like".
Its distinctiveness depends on type and tape restraint rather than a big visual
idea, so it is easy to dilute; every new state must use tape or nothing. Light-only
(A4) means no dark black-box mode in this pass.

---

## Outcome

**Concept.** *Marking*: the workspace is a marked rehearsal floor. A chalk surface
carries graphite lettering in one typeface at three energies. Tape marks are the
only way state is shown, and the Motif phrase sits on a ruler drawn to its real timing.

**What changed**

| Area | Change |
| --- | --- |
| Tokens (`styles/tokens.css`) | Floor/sheet/worn surfaces, three ink pressures, plum action, four tape colours with one meaning each, type scale, 4px space scale, motion. Self-hosted Archivo (variable width + weight) and Spline Sans Mono, latin + latin-ext via `unicode-range`, `font-display: swap`, the latin Archivo file preloaded. |
| Base (`styles/base.css`) | One set of controls (button, primary, quiet link, inputs, custom select arrow, checkbox, file input, disclosure), visible focus everywhere, the `.tape` component (also styling `.state-pill` and `.dot`), and the status line. |
| Shell (`index.html`, `styles/shell.css`) | Sticky header with mark; synthetic-demo tape moved from the footer into the header; record kicker (profile), display title; tabs become a numbered route 01 Movement, 02 Evidence, 03 Handoff on one floor line; "Use in handoff" turns secondary outside Movement so each context has one plum action; slimmer document bar. |
| Landing | Replaces the grey box with the product's own programme statement, the three-step route explained in one line each, and one sign-in panel (first on phones). |
| Movement | Decorative arcs removed; a **time ruler** places one numbered tick per anchored symbol at its true position, and the selected tick follows the selection. On phones the phrase becomes a vertical staff. |
| Evidence | Named file formats instead of illustrated thumbs; ledger rows; the handoff path drawn as five stations with tape on the current one; participants without avatars; the handoff check as a sheet with an explicit hold. |
| Handoff (primary journey) | Intended use first; the **permission ledger** gets the right column with the output scope and the action underneath. When export is blocked, the blocker names the next safe action and "Record an existing permission" opens automatically. The result keeps the same two columns: the slip on the left, and "Nothing has been sent" with the download on the right. |
| Dialogs | Square ruled sheets; full-screen on phones; the record list uses tape status and a plum current-record bar. |
| Removed | Five superseded or dead stylesheets (`layout`, `responsive`, `studio`, `dossier`, `decision`) and the unused 2 MB `rehearsal-duet.png`. |

**Functional changes (minimal, documented).**
- `practice-relay-app.mjs` sets `#project-kicker` and `#workspace[data-state]`, and
  binds the landing buttons on `#movement-panel` because the sign-in button moved to the right column.
- `handoff-render.mjs`: same forms, IDs, and strings; the layout is regrouped, the blocked
  state opens the permission form for managers, and the step labels read "Step 1 of 2" / "Step 2 of 2".
- `movement-editor.mjs`: `renderRuler()` replaces the SVG arcs; completeness is
  announced as "Completeness: partial".
- `scripts/render-alpha-html*.mjs`: the stylesheet list and font URL rewrite were updated
  for the new files. The HTML snapshot and the two Practice Relay screenshots were regenerated.
- `NOTICE` names the bundled OFL fonts; licence texts are next to the files.

**Verification.** `pnpm check:all` exits 0 on Node 24.21.0 / pnpm 9.15.0; the
public-hygiene script passes with its one pre-existing documented warning. Rendered
review covered 11 states (landing, sign-in, movement, document tools, records, two
evidence records, handoff ready, blocked, result, attach) at 390, 834, and 1440px:
no horizontal overflow, no console errors, and both fonts load. Keyboard focus is visible on tabs,
tiles, and dialog controls.

**Critique passes.** Pass 1 found: tile text centred by the inherited button flex;
the landing repeated its status line; tablet overflow from the phrase (grid
min-width); the header wrapped at 834px; on phones the mark shrank to a dot and the sign-in
came after the explanation; two plum buttons competed on Handoff; the blocked state hid
its next action; the result left the right column empty; role words were wrongly
title-cased. Pass 2 found: the readiness check came last on phones; the result filename
was oversized on phones; the permission-form inputs were not mono; the attach dialog had an
empty-alert gap. All fixed. An independent code review then found clipped focus rings on phrase tiles, ruler ticks misplaced by negative time anchors, role text removed from assistive technology at tablet width, a demo result tape that read "Generated", fonts served without a font MIME type in dev, and completed path stations distinguished by shade alone. All fixed. A final pass found only marginal issues.

**Assumptions to revisit.**
- *A4 Light only (medium–low).* If a dark "black box" mode is wanted, the tokens
  are the only layer to redefine. Tape colours were chosen to survive a dark floor
  with ink swaps, but they have not been tested on one.
- *A1 Scope (medium).* MvEI Workbench and the schema site still carry their own
  blue look; they were deliberately left alone as a separate product.
- *A6 Tape across domains (medium).* The state language uses words on every mark,
  so it still reads correctly if the tape metaphor means nothing to a field-study user.

**Unresolved / next steps.**
1. Run a moderated check with two educators and one student on the blocked state:
   do they understand "No matching grant" versus "Denied"?
2. Decide whether MvEI gets a sibling identity (same type system, its own accent).
3. Run an external accessibility audit with a screen reader; contrast was computed (all text ≥ 4.5:1),
   but the screen-reader behaviour of the new layout has not been tested.
4. Optional dark mode (see A4).
