/** Preserve local package selections independently of the server-authorized evidence export. */
import { renderPackageManifest } from "../render/package-manifest.mjs";
import { renderRecord } from "../render/record.mjs";
import { renderReadiness } from "../render/readiness.mjs";
import { icon } from "../ui/icons.mjs";

/** Wire retained local preview controls to the current selected record. */
export function bindEvidencePreview({ selected, demo, status, openMovement }) {
  const byId = id => document.getElementById(id);
  const render = () => {
    byId("detail").innerHTML = renderRecord(selected(), { staticDemo: demo() });
    byId("readiness").innerHTML = renderReadiness(selected(), { staticDemo: demo() });
  };
  const handle = event => {
    const button = event.target.closest("button[data-action]");
    const record = selected();
    if (!button || !record) return;
    const action = button.dataset.action;
    if (action === "toggle-evidence") {
      const id = button.dataset.artifact;
      const included = !record.includedIds.includes(id);
      record.includedIds = included ? [...record.includedIds, id] : record.includedIds.filter(item => item !== id);
      button.setAttribute("aria-pressed", String(included));
      button.setAttribute("aria-label", `${included ? "Exclude" : "Include"} ${record.artifacts.find(a => a.id === id)?.name ?? "evidence"} in local preview`);
      button.innerHTML = included ? icon("check") : "";
      button.classList.toggle("empty", !included);
      button.closest("li").classList.toggle("out", !included);
      byId("evidence-panel").querySelector(".section-label span").textContent = `${record.includedIds.length} of ${record.artifacts.length} included`;
      status("Local preview selection updated. Server evidence export still checks every artifact.");
    } else if (["export", "review", "manifest"].includes(action)) {
      byId("dialog-title").textContent = `${demo() ? "Simulated" : "Local"} package preview`;
      byId("dialog-summary").textContent = `${record.includedIds.length} evidence items · ${record.snapshotLabel}`;
      renderPackageManifest(document, byId("dialog-manifest"), record);
      byId("package-dialog").showModal();
    } else if (action === "open-workbench") openMovement();
    else if (action === "history") {
      byId("dialog-title").textContent = "Revision history";
      byId("dialog-summary").textContent = `Record revision ${record.revision}`;
      const rows = record.versions.map(version => {
        const li = document.createElement("li");
        li.textContent = `${version.name ?? version.id} · ${version.createdAt ?? "Date not recorded"}`;
        return li;
      });
      byId("dialog-manifest").replaceChildren(...rows);
      byId("package-dialog").showModal();
    } else status("Review the recorded use decisions in Evidence, or check a specific purpose in Handoff.", "warning");
  };
  byId("detail").addEventListener("click", handle);
  byId("readiness").addEventListener("click", handle);
  return { render };
}
