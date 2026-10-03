/** Local and authenticated record-owned media previews without credential-bearing URLs. */
import { escapeHtml } from "../html-escape.mjs";

/** Mount a preview; revoke private object URLs and discard late responses on teardown. */
export function mountReferenceMedia(host, { record, demo, request, onStatus }) {
  let objectUrl;
  let active = true;
  const take = record?.takes?.find(item => item.id === record.preferred) ?? record?.takes?.find(item => item.contentType?.startsWith("video/"));
  const illustration = demo && record?.id === "synthetic-weight-study";
  host.innerHTML = `<div class="media-frame">${illustration ? '<img src="./assets/studio-rehearsal.png" alt="Fictional dancers sharing weight in a bright studio">' : '<div class="media-empty"><h2>Reference media</h2><p>No rehearsal preview loaded.</p></div>'}</div><p class="media-caption">${escapeHtml(illustration ? "Rehearsal 03" : take?.label ?? "Reference media")}<small>${illustration ? "Synthetic rehearsal still · generated artwork" : "Local preview · media stays separate from notation"}</small></p><details class="media-tools"><summary>Reference media options</summary><label>Open a local video<input type="file" accept="video/*" data-video-file></label><p>Preview only. A local video is not uploaded or added as evidence.</p>${take?.storageKey && !demo ? '<button type="button" data-owned-video>Load record video</button>' : ''}<p data-media-status role="status"></p></details>`;
  const frame = host.querySelector(".media-frame");
  const status = host.querySelector("[data-media-status]");
  const showBlob = blob => {
    if (!active) return;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(blob);
    const video = host.ownerDocument.createElement("video");
    video.controls = true;
    video.preload = "metadata";
    video.setAttribute("aria-label", "Reference rehearsal video");
    video.src = objectUrl;
    video.addEventListener("error", () => { status.textContent = "This video could not be played. Your movement document is still available."; });
    frame.replaceChildren(video);
  };
  host.querySelector("[data-video-file]").addEventListener("change", event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) { status.textContent = "Choose a video file."; return; }
    showBlob(file);
    status.textContent = `${file.name} opened locally. Nothing uploaded.`;
  });
  host.querySelector("[data-owned-video]")?.addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    status.textContent = "Loading authorized media…";
    try {
      const blob = await request(`/media/${encodeURIComponent(take.storageKey)}`, { responseType: "blob", timeoutMs: 60_000 });
      if (active) { showBlob(blob); status.textContent = "Record video loaded."; }
    } catch (error) { if (active) { status.textContent = error.message; onStatus(error.message, "error"); } }
    finally { if (active) button.disabled = false; }
  });
  return {
    seek(item) {
      const video = frame.querySelector("video");
      const seconds = item?.timeAnchor?.tMs / 1000;
      if (video && Number.isFinite(seconds) && seconds >= 0 && Number.isFinite(video.duration)) video.currentTime = Math.min(seconds, video.duration);
    },
    destroy() { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); frame.querySelector("video")?.pause(); },
  };
}
