/** Real evidence export and policy forms with isolated simulation and stale-result protection. */
import { exportEvidence, addPolicy } from "../data/studio-operations.mjs";
import { simulateEvidenceExport } from "../data/studio-demo.mjs";
import { renderHandoffPreparation, renderHandoffSuccess, permissionRows } from "./handoff-render.mjs";
import { EXPORT_ROLES, POLICY_MANAGER_ROLES } from "./role-gates.mjs";

/** Download the returned bytes locally, never implying remote delivery. */
export function downloadText(text, filename, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Bind purpose-bound preparation, explicit policy entry and result download. */
export function createHandoff({ host, controller, getRecord, isDemo, getRole, status, goMovement, onRecord, hasDraft = () => false }) {
  let intent = { purpose: "", destination: "" };
  let decision;
  let result;
  let epoch = 0;
  let busy = false;
  const render = () => {
    const record = getRecord();
    if (!record) { host.innerHTML = '<div class="empty"><h2>No record selected</h2><p>Open a record to prepare its evidence.</p></div>'; return; }
    const state = { intent, decision, result, demo: isDemo(), canManage: POLICY_MANAGER_ROLES.includes(getRole()), draftPending: hasDraft(), canExport: EXPORT_ROLES.includes(getRole()) };
    host.innerHTML = result ? renderHandoffSuccess(record, state) : renderHandoffPreparation(record, state);
  };
  const fail = error => { if (error.name !== "AbortError") status(error.message, "error"); };
  host.addEventListener("input", event => {
    if (!event.target.closest("#handoff-form")) return;
    const data = new FormData(host.querySelector("#handoff-form"));
    intent = { purpose: String(data.get("purpose")).trim(), destination: String(data.get("destination")).trim() };
    epoch += 1; decision = null; result = null;
    host.querySelector('.export-blocker[role="alert"]')?.remove();
    host.querySelector("#permission-list").innerHTML = permissionRows(getRecord(), intent);
  });
  host.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;
    const form = event.target;
    if (form.id === "policy-form") return savePolicy(form);
    if (form.id !== "handoff-form") return;
    const data = new FormData(form);
    intent = { purpose: String(data.get("purpose")).trim(), destination: String(data.get("destination")).trim() };
    if (!intent.purpose || !intent.destination) { status("Enter a purpose and destination.", "error"); return; }
    const current = ++epoch;
    busy = true;
    form.querySelector('button[type="submit"]').disabled = true;
    status("Checking permissions and generating evidence metadata…");
    try {
      const value = isDemo() ? simulateEvidenceExport(getRecord(), intent) : await exportEvidence(controller, intent);
      if (current !== epoch) return;
      decision = value.decision;
      result = value.decision.allowed ? value : null;
      status(result ? `${isDemo() ? "Simulated metadata" : "Evidence metadata"} ready. Nothing sent.` : "Evidence export is blocked.", result ? "success" : "warning");
    } catch (error) {
      if (current !== epoch) return;
      decision = error.payload?.decision;
      fail(error);
    } finally {
      busy = false;
      if (current === epoch) { render(); host.querySelector("h2")?.focus(); }
      else if (host.contains(form)) form.querySelector('button[type="submit"]').disabled = false;
    }
  });
  async function savePolicy(form) {
    const recordId = getRecord()?.id;
    const current = epoch;
    const data = Object.fromEntries(new FormData(form));
    if (!data.evidenceRef) delete data.evidenceRef;
    busy = true;
    form.querySelector('button[type="submit"]').disabled = true;
    try {
      if (isDemo()) getRecord().policies.push({ ...data, id: `simulated-${crypto.randomUUID()}`, createdAt: new Date().toISOString() });
      else await addPolicy(controller, data);
      if (current !== epoch || recordId !== getRecord()?.id) return;
      result = null; decision = null;
      onRecord(); render();
      status(`${isDemo() ? "Simulated permission" : "Permission"} recorded. Check the evidence again before export.`, "success");
      host.querySelector("#handoff-purpose")?.focus();
    } catch (error) {
      if (current === epoch && host.contains(form)) form.querySelector("#policy-error").textContent = error.message;
      fail(error);
    } finally { busy = false; if (host.contains(form)) form.querySelector('button[type="submit"]').disabled = false; }
  }
  host.addEventListener("click", event => {
    if (event.target.closest("[data-return-movement]")) goMovement();
    if (event.target.closest("[data-new-export]")) { result = null; render(); }
    if (event.target.closest("[data-download-metadata]") && result) {
      downloadText(result.roCrate.files["ro-crate-metadata.json"], `${isDemo() ? "simulated-" : ""}ro-crate-metadata.json`);
      status("Download requested. Nothing sent to the destination.", "success");
    }
  });
  return {
    render,
    reset() { epoch += 1; result = null; decision = null; intent = { purpose: "", destination: "" }; if (isDemo() && getRecord()?.id === "synthetic-weight-study") intent = { purpose: "formative_feedback", destination: "studio-review" }; render(); },
    invalidate() { epoch += 1; result = null; decision = null; },
  };
}
