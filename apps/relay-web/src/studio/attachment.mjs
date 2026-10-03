/** Explicit subject selection and resumable attachment of immutable movement evidence. */
import { attachMovement } from "../data/studio-operations.mjs";

/** Bind the attachment dialog without granting permissions on behalf of participants. */
export function bindAttachment({ controller, getEditor, isValid, status, onComplete }) {
  const dialog = document.getElementById("attach-dialog");
  const form = document.getElementById("attach-form");
  const errorBox = document.getElementById("attach-error");
  let busy = false;
  let selectedId;
  const open = () => {
    const record = controller.state.selected;
    if (!record || !getEditor() || !isValid()) return;
    selectedId = record.id;
    errorBox.textContent = "";
    form.elements.filename.value = `${getEditor().getDocument().id ?? "movement"}.motif.json`;
    const choices = record.subjects.map(subject => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox"; input.name = "subject"; input.value = subject.id;
      label.append(input, document.createTextNode(subject.label ?? subject.name ?? subject.id));
      return label;
    });
    document.getElementById("attach-subjects").replaceChildren(...choices);
    form.querySelector('[type="submit"]').disabled = !choices.length;
    if (!choices.length) errorBox.textContent = "This record has no represented subjects. Add them through the existing record API before attaching evidence.";
    dialog.showModal();
  };
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy || !isValid() || selectedId !== controller.state.selected?.id) return;
    const data = new FormData(form);
    const subjectIds = data.getAll("subject");
    if (!subjectIds.length) { errorBox.textContent = "Select at least one represented subject."; return; }
    const recordId = selectedId;
    const document = getEditor().getDocument();
    busy = true; errorBox.textContent = "";
    form.querySelector('[type="submit"]').disabled = true;
    status("Saving movement reference and evidence…");
    try {
      if (controller.state.demo) {
        const record = controller.state.selected;
        record.artifacts.push({ id: `simulated-${crypto.randomUUID()}`, name: String(data.get("filename")), mediaType: "application/json", representedSubjectIds: subjectIds, contentUrl: "https://example.invalid/simulated-movement", simulation: true });
        record.includedIds = record.artifacts.map(item => item.id);
      } else await attachMovement(controller, { document, subjectIds, filename: String(data.get("filename")) });
      if (controller.state.selected?.id !== recordId) return;
      dialog.close();
      onComplete(document);
      status(controller.state.demo ? "Simulated attachment. Local demo only; nothing uploaded." : "Movement reference and evidence saved. Review the export purpose and permissions.", "success");
    } catch (error) {
      if (controller.state.selected?.id === recordId && error.name !== "AbortError") {
        errorBox.textContent = `${error.message}${error.pending ? ` Stopped at ${error.pending.stage}. Retry this unchanged document to resume.` : ""}`;
        status("Movement attachment has not completed.", "error");
      }
    } finally { busy = false; form.querySelector('[type="submit"]').disabled = false; }
  });
  return { open };
}
