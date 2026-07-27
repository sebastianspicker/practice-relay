/**
 * MvEI schema-site content module: structured public face of the encoding stack.
 *
 * Why: MEI-pattern residual is governance + honesty (profiles, corpus, neighbours),
 * not another LabanLab-class motion demo. This module is the source of truth;
 * buildPageHtml() regenerates index.html; tests assert both module and HTML.
 *
 * Acceptance: MvEI Q6 neighbours, Q7 capture, Q10 profiles/corpus; plus
 * consortium, migration, and co-timeline documentation surfaces.
 */

import { escapeHtml } from "./html-escape.mjs";

/** Public brand strings for MvEI (not Practice Relay-as-login). */
export const BRAND = {
  short: "MvEI",
  full: "Movement Encoding Initiative",
  tagline: "Schema profiles, validators, and fixtures for movement records.",
};

/** Companion Practice Relay products: separate apps, shared schemas. */
export const COMPANIONS = [
  {
    name: "MvEI Workbench",
    role: "authoring workbench",
    note: "Edits local Motif sequences and stores sessions in the browser.",
  },
  {
    name: "Practice Relay",
    role: "handoff application",
    note: "Carries MvEI references in policy-aware WorkRecord handoffs.",
  },
];

/** Encoding profiles (Motif + laban-subset now; full Laban later). */
export const PROFILES = [
  {
    id: "mvei-motif",
    status: "0.2.0",
    description: "Pedagogical Motif profile with controlled vocabulary",
  },
  {
    id: "mvei-laban-subset",
    status: "0.2.0",
    description: "Pedagogical Labanotation subset (not full density)",
  },
  {
    id: "movement_annotation",
    status: "v0",
    description: "Practice Relay v0: not symbolic Labanotation",
  },
  {
    id: "mvei-laban",
    status: "not implemented",
    description: "Full Labanotation profile is outside the current alpha",
  },
];

/** Pedagogical corpus ids (≥3 required for validate:schemas / Q4). */
export const CORPUS_SAMPLES = [
  {
    id: "motif-sketch-01",
    completeness: "sketch",
    profile: "mvei-motif",
    title: "Pedagogical Motif sketch: walk and turn",
  },
  {
    id: "motif-partial-02",
    completeness: "partial",
    profile: "mvei-motif",
    title: "Partial Motif with time anchors",
  },
  {
    id: "laban-subset-01",
    completeness: "sketch",
    profile: "mvei-laban-subset",
    title: "Pedagogical Laban subset: walk support",
  },
  {
    id: "laban-subset-02",
    completeness: "partial",
    profile: "mvei-laban-subset",
    title: "Partial Laban subset with arm gesture + music anchor",
  },
  {
    id: "laban-subset-03-dense",
    completeness: "partial",
    profile: "mvei-laban-subset",
    title: "Denser pedagogical subset: multi-column phrase",
  },
  {
    id: "laban-subset-04",
    completeness: "partial",
    profile: "mvei-laban-subset",
    title: "Simultaneity ladder: multi-column + beatOffset groups",
  },
  {
    id: "annotation-v0-demo",
    completeness: null,
    profile: "movement_annotation",
    title: "movement_annotation v0 demo events",
  },
];

/** Public corpus catalogue (multi-implementation hosting). */
export const CORPUS_INDEX = Object.freeze({
  path: "packages/movement-encode/fixtures/corpus/index.json",
  readme: "packages/movement-encode/fixtures/corpus/README.md",
  summary:
    "Machine-readable catalogue of pedagogical fixtures with profiles for external validators.",
});

/** Neighbours that are explicitly not MvEI (honesty / non-claims). */
export const NEIGHBOURS = [
  {
    name: "LabanLab",
    note: "Research web UI + motion preview: not MvEI",
  },
  {
    name: "LaMoGen / LabanLite",
    note: "CV motion-gen IR: not ICKL-grade encoding standard",
  },
  {
    name: "MARC 358",
    note: "Cataloguing notated movement: metadata ally, not score-file stack",
  },
  {
    name: "LabanWriter",
    note: "Legacy Mac free graphical editor",
  },
  {
    name: "KineScribe",
    note: "Free Motif/Laban literacy app",
  },
];

export const SCHEMA_PATH = "packages/movement-encode/schemas/";

export const NON_CLAIMS = [
  "Not first browser Laban editor.",
  "Not LabanLite.",
  "Not MARC 358.",
];

/** Capture bridge contract: exact input labels and intentionally sketch-quality output. */
export const CAPTURE_PREFERENCE = Object.freeze({
  acceptedSources: ["opencap", "mediapipe", "pose2sim", "other"],
  policy: "Landmark conversion accepts local provenance labels and emits sketch-quality annotations; no capture application or external integration is implemented.",
  conversion: "Events use source plugin_pose and quality sketch; Motif output has completeness sketch.",
  doc: "mvei/docs/capture-preference.md",
});

/** Current external-governance status and the minimum future participation threshold. */
export const CONSORTIUM_SEED = Object.freeze({
  minOrgs: 2,
  doc: "mvei/docs/consortium-seed.md",
  summary:
    "No external organization or governance body is appointed; two independent organizations remain a future minimum threshold.",
});

/** LabanWriter migration strategy (doc). */
export const MIGRATION = Object.freeze({
  doc: "mvei/docs/labanwriter-migration.md",
  summary: "Motif is supported. Lossy LabanWriter import and full mvei-laban are not implemented.",
});

/** Music co-timeline annex hooks. */
export const CO_TIMELINE = Object.freeze({
  doc: "mvei/docs/co-timeline-annex.md",
  schema: "packages/movement-encode/schemas/music-co-timeline-annex.schema.json",
  summary: "Optional musicCoTimeline on Motif (MusicXML/MEI anchors).",
});

/**
 * True when NEIGHBOURS cover the honesty set
 * (LabanLab, LaMoGen/LabanLite, MARC 358, LabanWriter: all ≠ MvEI).
 */
export function hasNeighbourHonesty() {
  const blob = NEIGHBOURS.map((n) => `${n.name} ${n.note}`).join(" ");
  const hasLabanLab = blob.includes("LabanLab");
  const hasLaMoGenOrLite =
    blob.includes("LaMoGen") || blob.includes("LabanLite");
  const hasMarc = blob.includes("MARC 358");
  const hasLabanWriter = blob.includes("LabanWriter");
  return hasLabanLab && hasLaMoGenOrLite && hasMarc && hasLabanWriter;
}

/** Corpus sample ids for listing / verification. */
export function listsCorpus() {
  return CORPUS_SAMPLES.map((s) => s.id);
}

/** Flat copy object for smoke checks and docs generation. */
export function getSiteCopy() {
  return {
    brand: BRAND,
    companions: COMPANIONS,
    profiles: PROFILES,
    corpusSamples: CORPUS_SAMPLES,
    corpusIndex: CORPUS_INDEX,
    neighbours: NEIGHBOURS,
    schemaPath: SCHEMA_PATH,
    nonClaims: NON_CLAIMS,
    capturePreference: CAPTURE_PREFERENCE,
    consortiumSeed: CONSORTIUM_SEED,
    migration: MIGRATION,
    coTimeline: CO_TIMELINE,
  };
}

/** True when the capture bridge declares every accepted landmark source label. */
export function hasCapturePreference() {
  return ["opencap", "mediapipe", "pose2sim", "other"].every((source) =>
    CAPTURE_PREFERENCE.acceptedSources.includes(source),
  );
}

/** True when consortium seed documents ≥2 orgs path. */
export function hasConsortiumSeed() {
  return CONSORTIUM_SEED.minOrgs >= 2 && Boolean(CONSORTIUM_SEED.doc);
}

/**
 * Render full schema-site HTML from structured content.
 * Used to regenerate index.html and for snapshot-style unit tests.
 */
export function buildPageHtml() {
  const pageLists = buildPageLists();
  return `${schemaPageHead()}
${schemaPageBody(pageLists)}
${schemaPageFooter()}`;
}

/** Render the invariant document head for the generated schema-site page. */
function schemaPageHead() {
  return `<!DOCTYPE html>
<!-- MvEI schema site. Why: implementers need a product-neutral encoding reference surface. -->
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(BRAND.short)}: ${escapeHtml(BRAND.full)}</title>
  <style>
    :root { color-scheme: light; --paper:#fff; --surface:#f5f7fb; --surface-strong:#edf1f8; --ink:#172033; --muted:#687083; --quiet:#8b92a2; --line:#d8dde8; --line-strong:#bcc4d2; --accent:#164ce5; --accent-soft:#edf2ff; --product:#67506a; --warning:#9a5708; --warning-soft:#fff7e8; --focus:#0068d8; --radius-sm:6px; --radius-md:9px; --ui:"Avenir Next",Avenir,"Helvetica Neue",Helvetica,Arial,sans-serif; --display:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif; --mono:"SFMono-Regular",Consolas,"Liberation Mono",monospace; }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { margin:0; min-width:320px; background:var(--paper); color:var(--ink); font:15px/1.55 var(--ui); -webkit-font-smoothing:antialiased; }
    a { color:var(--accent); text-underline-offset:.2em; }
    a:hover { color:#0f3fc8; }
    a:focus-visible { outline:3px solid color-mix(in srgb,var(--focus) 62%,transparent); outline-offset:3px; }
    code { overflow-wrap:anywhere; border:1px solid var(--line); border-radius:3px; background:var(--surface); padding:.12em .32em; font:.84em/1.4 var(--mono); }
    h1,h2,h3 { color:var(--ink); line-height:1.08; }
    h1 { max-width:15ch; margin:.25rem 0 .7rem; font:500 clamp(2.75rem,6vw,5.2rem)/.98 var(--display); letter-spacing:-.045em; }
    h2 { margin:0; font:600 clamp(1.5rem,2.7vw,2.05rem)/1.1 var(--ui); letter-spacing:-.025em; }
    h3 { margin:0 0 .55rem; font:650 1.05rem/1.2 var(--ui); letter-spacing:-.01em; }
    p { margin: .65rem 0; }
    .skip { position:fixed; z-index:20; top:12px; left:12px; padding:10px 14px; border-radius:var(--radius-sm); color:var(--paper); background:var(--ink); transform:translateY(-160%); }
    .skip:focus { transform:translateY(0); }
    .site-header { position:sticky; z-index:8; top:0; border-bottom:1px solid var(--line); background:rgb(255 255 255 / 96%); }
    .header-inner,main,.site-footer { width:min(1180px,calc(100% - 2rem)); margin:0 auto; }
    .header-inner { min-height:64px; display:flex; align-items:center; justify-content:space-between; gap:1.5rem; }
    .brand { display:flex; align-items:center; gap:.7rem; color:var(--ink); font:700 1.22rem/1 var(--ui); letter-spacing:-.025em; text-decoration:none; }
    .mark { width:2.55rem; color:var(--product); }
    .site-nav { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:.25rem; font-size:.82rem; }
    .site-nav a { min-height:38px; display:flex; align-items:center; padding:0 .72rem; border-radius:var(--radius-sm); color:var(--muted); text-decoration:none; }
    .site-nav a:hover { color:var(--accent); background:var(--accent-soft); }
    main { padding:clamp(2.5rem,6vw,5.5rem) 0 4rem; }
    .eyebrow,.kicker,.meta { color:var(--muted); font:.7rem/1.4 var(--mono); letter-spacing:.09em; text-transform:uppercase; }
    .hero { display:grid; grid-template-columns:minmax(0,1.35fr) minmax(15rem,.65fr); gap:3rem; align-items:end; padding-bottom:2rem; border-bottom:1px solid var(--line-strong); }
    .tagline { max-width:40rem; margin-bottom:0; color:var(--muted); font-size:1.06rem; }
    .reference-note { border:1px solid #e4a24d; border-left:3px solid var(--warning); border-radius:var(--radius-sm); padding:.8rem 1rem; background:var(--warning-soft); color:#68420f; }
    .reference-note p:first-child { margin-top: 0; }
    .reference-note p:last-child { margin-bottom: 0; }
    .section { scroll-margin-top:5rem; margin-top:3.25rem; }
    .section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
    .section-heading p { margin: 0; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
    .card { min-width:0; border:1px solid var(--line); border-radius:var(--radius-sm); background:var(--paper); padding:1.2rem; }
    .card p:last-child { margin-bottom: 0; }
    .card ul { margin: .7rem 0 0; padding-left: 1.2rem; }
    .card li + li { margin-top: .45rem; }
    .profile-list, .corpus-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem; margin: 0; padding: 0; list-style: none; }
    .profile-list li,.corpus-list li { min-width:0; border:1px solid var(--line); border-left:3px solid var(--accent); border-radius:var(--radius-sm); background:var(--paper); padding:.9rem 1rem; }
    .profile-list small, .corpus-list small { display: block; margin-top: .45rem; color: var(--muted); }
    .corpus-link { display:flex; align-items:center; justify-content:space-between; gap:1rem; margin-top:1rem; border:1px solid #bed0ff; border-radius:var(--radius-sm); background:var(--accent-soft); padding:.9rem 1rem; }
    .corpus-link p { margin: 0; }
    .corpus-link a { display:inline-flex; align-items:center; gap:.35rem; font-weight:650; }
    .link-icon { width:15px; height:15px; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
    .non-claims { border-left:3px solid var(--product); padding-left:1rem; color:var(--muted); }
    .source-list { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .5rem; margin: .85rem 0 0; padding: 0; list-style: none; }
    .source-list li { border:1px solid var(--line); border-radius:4px; padding:.45rem .55rem; background:var(--surface); }
    .site-footer { border-top:1px solid var(--line); padding:1.3rem 0 2.5rem; color:var(--muted); }
    @media (max-width: 720px) { .site-header { position:static; } .header-inner { min-height:auto; align-items:flex-start; flex-direction:column; padding:.85rem 0; } .site-nav { width:100%; justify-content:flex-start; overflow-x:auto; flex-wrap:nowrap; } .site-nav a { flex:0 0 auto; } .hero,.grid,.profile-list,.corpus-list { grid-template-columns:1fr; } .hero { gap:1.5rem; } .source-list { grid-template-columns:repeat(2,minmax(0,1fr)); } .corpus-link { align-items:flex-start; flex-direction:column; } }
    @media (prefers-reduced-motion:reduce) { html { scroll-behavior:auto; } * { transition:none!important; animation:none!important; } }
  </style>
</head>
<body>
  <a class="skip" href="#main">Skip to reference content</a>
  <header class="site-header">
    <div class="header-inner">
      <a class="brand" href="#main" aria-label="${escapeHtml(BRAND.full)} reference home"><svg class="mark" viewBox="0 0 48 32" aria-hidden="true"><path d="M2 4h10v10H2zM19 4h10v10H19zM36 4h10v10H36zM2 21h10v9H2zM19 21h10v9H19zM36 21h10v9H36z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 9h7m10 0h7M7 14v7m17-7v7m17-7v7" fill="none" stroke="currentColor" stroke-width="2"/></svg><span>${escapeHtml(BRAND.short)}</span></a>
      <nav class="site-nav" aria-label="Reference sections"><a href="#profiles">Profiles</a><a href="#corpus">Corpus</a><a href="#boundaries">Boundaries</a><a href="#implementation">Implementation notes</a></nav>
    </div>
  </header>
  <main id="main" tabindex="-1">
    <section class="hero" aria-labelledby="page-title">
      <div>
        <p class="eyebrow">Movement encoding reference</p>
        <h1 id="page-title">${escapeHtml(BRAND.full)}</h1>
        <p class="tagline">${escapeHtml(BRAND.tagline)}</p>
      </div>
      <aside class="reference-note" aria-label="Reference scope"><p class="kicker">Current alpha</p><p>Reference for the profiles and corpus shipped in this alpha.</p></aside>
    </section>`;
}

/** Render dynamic schema-site sections from the escaped content lists. */
function schemaPageBody(pageLists) {
  return `
    <section class="section" aria-labelledby="companions-heading">
      <div class="section-heading"><h2 id="companions-heading">Related surfaces</h2><p class="meta">Shared contracts, separate products</p></div>
      <div class="grid">${pageLists.companionItems}</div>
      <p class="non-claims">${pageLists.nonClaims}</p>
    </section>

    <section class="section" id="profiles" aria-labelledby="profiles-heading">
      <div class="section-heading"><h2 id="profiles-heading">Profiles</h2><p class="meta">Current implementation</p></div>
      <ul class="profile-list">${pageLists.profileItems}</ul>
    </section>

    <section class="section" id="corpus" aria-labelledby="corpus-heading">
      <div class="section-heading"><h2 id="corpus-heading">Corpus samples</h2><p class="meta">Pedagogical fixtures</p></div>
      <ul class="corpus-list">${pageLists.corpusItems}</ul>
      <div class="corpus-link"><p>${escapeHtml(CORPUS_INDEX.summary)}<br /><span class="meta">Layout · <code>${escapeHtml(CORPUS_INDEX.readme)}</code></span></p><a href="/packages/movement-encode/fixtures/corpus/index.json">Open corpus index <svg class="link-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M14 7l5 5-5 5"/></svg></a></div>
    </section>

    <section class="section" id="boundaries" aria-labelledby="boundaries-heading">
      <div class="section-heading"><h2 id="boundaries-heading">Boundaries</h2><p class="meta">Neighbours are not MvEI</p></div>
      <div class="grid"><article class="card"><h3>Neighbours (not MvEI)</h3><ul>${pageLists.neighbourItems}</ul></article><article class="card"><h3>Capture bridge</h3><p>${escapeHtml(CAPTURE_PREFERENCE.policy)}</p><p>${escapeHtml(CAPTURE_PREFERENCE.conversion)}</p><ul class="source-list">${pageLists.capturePrefer}</ul><p class="meta">Doc · <code>${escapeHtml(CAPTURE_PREFERENCE.doc)}</code></p></article></div>
    </section>

    <section class="section" id="implementation" aria-labelledby="implementation-heading">
      <div class="section-heading"><h2 id="implementation-heading">Implementation notes</h2><p class="meta">Governance and interchange</p></div>
      <div class="grid"><article class="card"><h3>Governance status</h3><p>${escapeHtml(CONSORTIUM_SEED.summary)}</p><p class="meta">Doc · <code>${escapeHtml(CONSORTIUM_SEED.doc)}</code></p></article><article class="card"><h3>LabanWriter migration</h3><p>${escapeHtml(MIGRATION.summary)}</p><p class="meta">Doc · <code>${escapeHtml(MIGRATION.doc)}</code></p></article><article class="card"><h3>Music co-timeline annex</h3><p>${escapeHtml(CO_TIMELINE.summary)}</p><p class="meta">Schema · <code>${escapeHtml(CO_TIMELINE.schema)}</code><br />Doc · <code>${escapeHtml(CO_TIMELINE.doc)}</code></p></article><article class="card"><h3>Schema source</h3><p>Versioned schema documents remain the implementation authority for this reference site.</p><p><code>${escapeHtml(SCHEMA_PATH)}</code></p></article></div>
    </section>
`;
}

/** Close the schema-site document after its dynamic content sections. */
function schemaPageFooter() {
  return `  </main>
  <footer class="site-footer"><p class="meta">MvEI reference surface</p><p>Schemas: <code>${escapeHtml(SCHEMA_PATH)}</code></p></footer>
</body>
</html>
`;
}

/** Build escaped list fragments before interpolating the static page shell. */
function buildPageLists() {
  return {
    profileItems: PROFILES.map((profile) => `        <li><code>${escapeHtml(profile.id)}</code><small>${escapeHtml(profile.status)} · ${escapeHtml(profile.description)}</small></li>`).join("\n"),
    corpusItems: CORPUS_SAMPLES.map(renderCorpusItem).join("\n"),
    neighbourItems: NEIGHBOURS.map((neighbour) => `        <li><strong>${escapeHtml(neighbour.name)}</strong>: ${escapeHtml(neighbour.note)}</li>`).join("\n"),
    companionItems: COMPANIONS.map((companion) => `        <article class="card"><p class="kicker">${escapeHtml(companion.role)}</p><h3>${escapeHtml(companion.name)}</h3><p>${escapeHtml(companion.note)}</p></article>`).join("\n"),
    nonClaims: NON_CLAIMS.map(escapeHtml).join(" "),
    capturePrefer: CAPTURE_PREFERENCE.acceptedSources.map((source) => `<li><code>${escapeHtml(source)}</code></li>`).join("\n"),
  };
}

/** Render one escaped corpus list entry, retaining its optional completeness label. */
function renderCorpusItem(sample) {
  const completeness = sample.completeness != null ? ` (completeness: ${escapeHtml(sample.completeness)})` : "";
  return `        <li><code>${escapeHtml(sample.id)}</code><small>${escapeHtml(sample.title)}${completeness}</small></li>`;
}
