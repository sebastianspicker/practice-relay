/** Unified Practice Relay / MvEI workspace; record authority remains in the API. */
import { createWorkspaceState } from "./data/workspace-state.mjs";
import { fallbackRecords } from "./data/fallback-records.mjs";
import { studioRecord, studioMotif } from "./data/studio-demo.mjs";
import { STATIC_DEMO } from "./demo-mode.mjs";
import { renderRecordIndexHtml } from "./render/record-index.mjs";
import { mountMovementEditor } from "./studio/movement-editor.mjs";
import { mountReferenceMedia } from "./studio/reference-media.mjs";
import { bindEvidencePreview } from "./studio/evidence-preview.mjs";
import { EXPORT_ROLES } from "./studio/role-gates.mjs";
import { createHandoff } from "./studio/handoff.mjs";
import { bindAttachment } from "./studio/attachment.mjs";
import { TAGLINE } from "./shell.mjs";
export { toWorkspaceRecord } from "./data/workspace-record.mjs";
export { renderRecord } from "./render/record.mjs";
export { renderReadiness } from "./render/readiness.mjs";

/** Configured API origin; deployments may set this global before the entry loads. */
export const API_BASE = globalThis.PRACTICE_RELAY_API_BASE ?? "http://localhost:8787";
// Maturity gate copy: Prepare export; No work records; Showing an explicit local example.
// Retained local package control: data-action="export".
const byId = id => document.getElementById(id);
const controller = createWorkspaceState(API_BASE, {
  changed: () => renderSession(),
  expired: () => status("Session ended. Sign in again.", "error"),
});
const state = controller.state;
const drafts = new Map();
const unsavedIds = new Set();
let editor;
let media;
let mountedId;
let valid = false;
let draftChanged = false;
let filterTimer;
let mountEpoch = 0;
const selected = () => state.selected;
const evidencePreview = bindEvidencePreview({ selected, demo: () => state.demo, status, openMovement: () => changeTab("movement") });
const handoff = createHandoff({
  host: byId("handoff-panel"), controller, getRecord: selected,
  isDemo: () => state.demo, getRole: role, status,
  goMovement: () => changeTab("movement"), onRecord: () => evidencePreview.render(), hasDraft: () => draftChanged,
});
const attachment = bindAttachment({
  controller, getEditor: () => editor, isValid: () => valid, status,
  onComplete(document) {
    drafts.set(selected().id, document); unsavedIds.delete(selected().id); draftChanged = false;
    byId("document-status").textContent = `Valid ${document.completeness} · ${state.demo ? "simulated save" : "reference saved"}`;
    evidencePreview.render(); handoff.invalidate(); changeTab("handoff");
    byId("handoff-panel").querySelector("h2")?.focus();
  },
});

/** Publish persistent, accessible feedback without replacing the user's document. */
function status(message, kind = "loading") {
  byId("status").textContent = message; byId("status").dataset.kind = kind;
}

/** Resolve actual record membership independently of descriptive actor roles. */
function role() {
  if (state.demo) return "faculty";
  return selected()?.members.find(member => member.userId === (state.session?.userId ?? "studio-faculty"))?.role ?? "member";
}

/** Show a task region while preserving its mounted document and keyboard focus. */
function changeTab(name) {
  for (const tab of document.querySelectorAll("[data-tab]")) {
    if (tab.dataset.tab === name) tab.setAttribute("aria-current", "page"); else tab.removeAttribute("aria-current");
  }
  byId("movement-panel").hidden = name !== "movement";
  byId("evidence-panel-view").hidden = name !== "evidence";
  byId("handoff-panel").hidden = name !== "handoff";
  if (name === "evidence") evidencePreview.render();
  if (name === "handoff") handoff.render();
  if (document.activeElement?.closest("[hidden]")) document.querySelector(`[data-tab="${name}"]`)?.focus();
}

/** Update session controls without remounting a draft on background record refresh. */
function renderSession() {
  byId("session-user").textContent = state.demo ? "Alex Morgan" : state.session?.userId ?? "Sign in";
  byId("session-role").textContent = state.demo ? "Demo · faculty" : state.session ? role() : "";
  byId("demo-notice").hidden = !state.demo;
  byId("logout").hidden = !state.session && !state.demo;
  byId("login-form").hidden = !!state.session;
  byId("load-more").hidden = !state.nextCursor;
  byId("refresh-records").disabled = !state.session;
  renderIndex();
  if (selected()) byId("project-subtitle").textContent = selected().versions[0]?.name ?? `WorkRecord / Revision ${selected().revision}`;
  if (!selected() && mountedId) {
    drafts.clear(); unsavedIds.clear();
    for (const dialog of document.querySelectorAll("dialog[open]")) if (dialog.id !== "account-dialog") dialog.close();
    byId("login-password").value = "";
    for (const id of ["dialog-manifest", "attach-subjects"]) byId(id).replaceChildren();
    for (const id of ["dialog-summary", "attach-error"]) byId(id).textContent = "";
    mountSelected();
  }
}

/** Render the authorized index, with title filtering local only in explicit demo mode. */
function renderIndex() {
  byId("records").innerHTML = renderRecordIndexHtml(state.summaries, selected()?.id, state.demo ? byId("record-filter").value : "");
  byId("record-count").textContent = String(state.summaries.length);
}

/** Create a valid empty draft without copying rehearsal content into real records. */
function emptyDocument(record) {
  return { schemaVersion: "0.2.0", profile: "mvei-motif", id: `movement-${record.id}`, completeness: "sketch", items: [] };
}

/** Open only an API-owned media reference, without forwarding credentials to external URLs. */
async function loadStoredDocument(record, current) {
  if (state.demo || !record.motion?.ref || drafts.has(record.id)) return;
  try {
    const url = new URL(record.motion.ref, API_BASE);
    const allowed = new URL(API_BASE);
    if (url.origin !== allowed.origin || !url.pathname.startsWith("/media/")) {
      status("Movement reference retained. Import its Motif JSON through Document tools to edit it; the standalone workbench remains available.");
      return;
    }
    const blob = await controller.request(url.pathname, { responseType: "blob" });
    if (blob.size > 2 * 1024 * 1024) throw new Error("Movement reference exceeds the 2 MiB editor limit.");
    const document = JSON.parse(await blob.text());
    if (current !== mountEpoch || draftChanged) return;
    editor.setDocument(document);
    drafts.set(record.id, document);
    byId("document-name").textContent = `${document.id}.motif.json`;
    status("Stored movement reference opened. Edits remain in memory until saved or downloaded.", "success");
  } catch (error) {
    if (current === mountEpoch && error.name !== "AbortError") status(`Reference could not be opened: ${error.message} The original record is unchanged.`, "error");
  }
}

/** Mount one record, isolating private media, drafts and results across sessions. */
function mountSelected() {
  const current = ++mountEpoch;
  editor?.destroy(); media?.destroy(); editor = null; media = null;
  valid = false; draftChanged = false;
  const record = selected(); mountedId = record?.id;
  draftChanged = unsavedIds.has(record?.id);
  byId("workspace").dataset.state = record ? "record" : "empty";
  byId("project-kicker").textContent = record ? record.profile : "Alpha workspace · local evaluation";
  byId("project-title").textContent = record?.title ?? TAGLINE;
  byId("project-subtitle").textContent = record ? record.versions[0]?.name ?? `${record.profile} / Revision ${record.revision}` : "Open a work record to begin.";
  byId("use-in-handoff").disabled = true;
  byId("document-status").textContent = "";
  byId("document-name").textContent = "No movement document";
  handoff.reset(); evidencePreview.render(); renderSession(); changeTab("movement");
  if (!record) {
    byId("reference-media").innerHTML = `<ol class="route-intro" aria-label="How a handoff is prepared">
      <li><span class="route-n" aria-hidden="true">01</span><h2>Movement</h2><p>Shape a Motif phrase beside rehearsal media. Each symbol keeps its time anchor in milliseconds.</p></li>
      <li><span class="route-n" aria-hidden="true">02</span><h2>Evidence</h2><p>See what the record holds, who is represented in it, and which uses have been recorded.</p></li>
      <li><span class="route-n" aria-hidden="true">03</span><h2>Handoff</h2><p>Name an exact purpose and destination. Every represented person needs a matching recorded permission before metadata is generated. Nothing is sent.</p></li>
    </ol>`;
    byId("movement-editor").innerHTML = `<div class="workspace-empty"><h2>Open your records</h2><p>Sign in with your workspace account to load the records you are a member of.</p><div class="empty-actions"><button class="primary" type="button" data-signin>Sign in</button><button type="button" data-demo>Explore the synthetic demo</button></div><p class="field-help">The demo uses fictional records and simulated permissions. It never contacts the record service and stores nothing.</p></div>`;
    return;
  }
  media = mountReferenceMedia(byId("reference-media"), { record, demo: state.demo, request: (...args) => controller.request(...args), onStatus: status });
  const document = drafts.get(record.id) ?? (state.demo && record.id === studioRecord.id ? structuredClone(studioMotif) : emptyDocument(record));
  byId("document-name").textContent = `${document.id}.motif.json`;
  editor = mountMovementEditor(byId("movement-editor"), {
    document,
    onSelect: item => media?.seek(item),
    onStatus(result) {
      valid = result.valid;
      byId("document-status").textContent = `${result.message}${draftChanged ? " · unsaved draft" : ""}`;
      byId("use-in-handoff").disabled = !valid || !EXPORT_ROLES.includes(role());
      byId("use-in-handoff").title = EXPORT_ROLES.includes(role()) ? "Save movement evidence" : "Your membership permits local inspection only";
    },
    onChange(document, result) {
      valid = result.valid; draftChanged = true; unsavedIds.add(record.id);
      drafts.set(record.id, document); handoff.invalidate();
      byId("document-name").textContent = `${document.id}.motif.json`;
      byId("document-status").textContent = `${result.valid ? `Valid ${document.completeness}` : "Invalid input"} · unsaved draft`;
    },
  });
  void loadStoredDocument(record, current);
}

/** Load a real collection; errors never silently switch the user into demo data. */
async function loadRecords(append = false) {
  status("Loading work records…");
  try {
    await controller.list(byId("record-filter").value, append);
    status(state.summaries.length ? "Work records loaded. Choose a record." : "No work records match. Change the filter or create a record through the existing API.", "success");
  } catch (error) { if (error.name !== "AbortError") status(error.message, "error"); }
}

/** Start an explicit synthetic session with isolated cloned fixtures. */
function openDemo() {
  drafts.clear(); unsavedIds.clear(); controller.demo(structuredClone([studioRecord, ...fallbackRecords]));
  byId("account-dialog").close(); mountSelected();
  status("Showing an explicit local example. Synthetic rehearsal and permissions; nothing sent.", "success");
}

/** Preserve the public render entry for existing integration consumers. */
export function render() { renderIndex(); evidencePreview.render(); }

for (const button of document.querySelectorAll("[data-tab]")) button.addEventListener("click", () => changeTab(button.dataset.tab));
for (const button of document.querySelectorAll("[data-close]")) button.addEventListener("click", () => byId(button.dataset.close).close());
byId("account").addEventListener("click", () => byId("account-dialog").showModal());
byId("choose-record").addEventListener("click", () => { renderIndex(); byId("records-dialog").showModal(); });
byId("use-in-handoff").addEventListener("click", attachment.open);
byId("open-demo").addEventListener("click", openDemo);
byId("logout").addEventListener("click", () => { controller.logout(); byId("account-dialog").close(); status("Signed out. Private drafts and previews cleared."); });
byId("movement-panel").addEventListener("click", event => {
  if (event.target.closest("[data-signin]")) byId("account-dialog").showModal();
  if (event.target.closest("[data-demo]")) openDemo();
});
byId("login-form").addEventListener("submit", async event => {
  event.preventDefault();
  const button = event.target.querySelector('[type="submit"]'); button.disabled = true;
  byId("account-error").textContent = "";
  try {
    await controller.login(byId("login-user").value.trim(), byId("login-password").value);
    byId("login-password").value = ""; byId("account-dialog").close();
    await loadRecords(); byId("records-dialog").showModal();
  } catch (error) { if (error.name !== "AbortError") byId("account-error").textContent = error.message; }
  finally { button.disabled = false; }
});
byId("records").addEventListener("click", async event => {
  const button = event.target.closest("[data-record]");
  if (!button) return;
  const summary = state.summaries.find(record => String(record.id) === button.dataset.record);
  if (!summary) return;
  if (!valid && editor) { byId("records-dialog").close(); changeTab("movement"); status("Correct the invalid movement input before switching records.", "error"); return; }
  status("Loading record…"); button.disabled = true;
  try {
    if (state.demo) state.selected = summary; else await controller.select(summary);
    byId("records-dialog").close(); mountSelected(); renderIndex();
    status("Record opened. Drafts stay in memory until saved or downloaded.", "success");
  } catch (error) { if (error.name !== "AbortError") status(error.message, "error"); }
  finally { button.disabled = false; }
});
byId("record-filter").addEventListener("input", () => {
  clearTimeout(filterTimer);
  if (state.demo) renderIndex(); else if (state.session) filterTimer = setTimeout(() => void loadRecords(), 250);
});
byId("load-more").addEventListener("click", () => void loadRecords(true));
byId("refresh-records").addEventListener("click", () => void loadRecords());
window.addEventListener("beforeunload", event => { if (unsavedIds.size) { event.preventDefault(); event.returnValue = ""; } });
mountSelected();
if (STATIC_DEMO || new URLSearchParams(location.search).get("demo") === "1") openDemo();
