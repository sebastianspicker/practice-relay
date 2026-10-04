/** Canonical payload and edited-session preservation regression checks. */
import assert from "node:assert/strict";
import test from "node:test";
import { renderShellHtml, loadDemoMotif } from "../src/shell.mjs";
import { readDocumentFromShell } from "../src/workbench-client.mjs";
import { addFromPalette } from "../src/canvas.mjs";
import { createMemoryStorage, loadSession, saveSession } from "../src/session-store.mjs";
import { renderProjectionHtml } from "../src/projection.mjs";

test("canonical shell payload and edited sessions retain all Motif fields", () => {
  const doc = loadDemoMotif();
  doc.title = '</script><script>globalThis.compromised=true</script>&\u2028';
  doc.items[0].order = 23;
  const html = renderShellHtml(doc);
  const raw = html.match(/<script id="motif-document" type="application\/json">([\s\S]*?)<\/script>/)[1];
  assert.doesNotMatch(raw, /[<&\u2028]/);
  const restored = readDocumentFromShell({ querySelector: () => ({ textContent: raw }) });
  assert.deepEqual(restored, doc);
  const edited = addFromPalette(restored, "effort_light");
  const storage = createMemoryStorage();
  saveSession(storage, edited);
  assert.deepEqual(loadSession(storage), edited);
  assert.deepEqual(edited.items.slice(0, -1), doc.items);
  assert.deepEqual(edited.annotationLinks, doc.annotationLinks);
  assert.deepEqual(edited.musicCoTimeline, doc.musicCoTimeline);
  const projection = renderProjectionHtml(edited);
  assert.match(projection, /Read-only projection/);
  assert.match(projection, /effort_light → level low/);
  assert.doesNotMatch(projection, /<script/i);
});
