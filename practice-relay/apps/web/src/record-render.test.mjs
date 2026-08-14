/** Characterization tests for the Quiet Dossier record renderer. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderRecord } from "./render/record.mjs";

const EMPTY_RECORD = `<div class="empty"><h1 id="record-title">No record selected</h1><p>Choose a work record from the index, or refresh when the record service is reachable.</p></div>`;

function recordWith(artifacts, includedIds = artifacts.map(({ id }) => id)) {
  return {
    profile: "Dossier",
    versions: [{ name: "Revision 5" }],
    submitted: "2026-08-01T12:00:00Z",
    title: "Duet study",
    artifacts,
    includedIds,
    snapshots: [{ id: "snapshot-5" }],
    members: [{ id: "member-1" }],
    policies: [
      { purpose: "assessment", state: "granted" },
      { purpose: "archive", state: "granted" },
    ],
  };
}

function glyphs(html) {
  return [...html.matchAll(/<div class="thumb glyph" aria-hidden="true">([^<]+)<\/div>/g)]
    .map((match) => match[1]);
}

test("renders every falsy selection as the byte-exact empty landmark", () => {
  for (const record of [null, undefined, false, "", 0]) {
    assert.equal(renderRecord(record), EMPTY_RECORD);
  }
});

test("classifies glyph labels in their established precedence order", () => {
  const fixtures = [
    { id: "musicxml", mediaType: "application/musicxml+xml" },
    { id: "xml", mediaType: "application/xml" },
    { id: "audio", mediaType: "audio/wav" },
    { id: "markdown", mediaType: "text/markdown" },
    { id: "pdf", mediaType: "application/pdf" },
    { id: "json", mediaType: "application/json" },
    { id: "cues", mediaType: "application/octet-stream" },
    { id: "image", mediaType: "image/png" },
    { id: "video", mediaType: "video/mp4" },
    { id: "suffix", mediaType: "application/vnd+demo" },
    { id: "file", mediaType: "unknown" },
  ];
  assert.deepEqual(
    glyphs(renderRecord(recordWith(fixtures))),
    ["XML", "XML", "WAV", "MD", "PDF", "JSON", "JSON", "IMG", "VND+", "FILE"],
  );
  assert.match(
    renderRecord(recordWith(fixtures)),
    /data-artifact="video" aria-pressed="true" aria-label="Exclude video"[\s\S]*?<div class="thumb photo" role="img" aria-label=""><\/div>/,
  );
});

test("retains exact evidence markup for escaping, photo thumbs, takes, and toggles", () => {
  const html = renderRecord(recordWith([
    {
      id: `id<&"'`,
      name: `Name<&"'`,
      detail: `Detail<&"'`,
      preferredTake: `Take<&"'`,
      mediaType: "application/xml",
    },
    { id: "movement", name: "Movement", mediaType: "application/json" },
  ], [`id<&"'`]));

  assert.match(html, /data-action="toggle-evidence" data-artifact="id&lt;&amp;&quot;&#39;" aria-pressed="true" aria-label="Exclude Name&lt;&amp;&quot;&#39;"/);
  assert.match(html, /<strong>Name&lt;&amp;&quot;&#39;<\/strong>/);
  assert.match(html, /<small>Detail&lt;&amp;&quot;&#39;<\/small>/);
  assert.match(html, /<span class="take">Take&lt;&amp;&quot;&#39;<\/span>/);
  assert.match(html, /<li class="out">\n      <button class="tick empty" type="button" data-action="toggle-evidence" data-artifact="movement" aria-pressed="false" aria-label="Include Movement"><\/button>\n      <div class="thumb photo" role="img" aria-label=""><\/div>/);
  assert.match(html, /<span class="take none">-<\/span>/);
  assert.doesNotMatch(html, /Name<&/);
});

test("keeps the static-demo marker and full dossier structure byte-stable", () => {
  const html = renderRecord(recordWith([
    { id: "score", name: "Score", mediaType: "application/xml", detail: "Engraved score" },
  ]), { staticDemo: true });

  assert.match(html, /<span class="simulation-marker">Simulated<\/span>/);
  assert.match(html, /<h1 id="record-title">Duet study<\/h1>/);
  assert.match(html, /<ol class="path" aria-label="Handoff path"><li class="done">Version<\/li><li class="done">Evidence<\/li><li class="done">Conditions<\/li><li class="now">Recipient<\/li><\/ol>/);
  assert.match(html, /<span>1 included<\/span>/);
  assert.match(html, /<p class="footnote">Source systems stay authoritative\. This record only carries selection, version, and permitted uses\.<\/p>$/);
});
