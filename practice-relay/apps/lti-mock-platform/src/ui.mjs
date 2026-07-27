/**
 * Local LTI mock-platform administrative surface.
 * Why: lab operators need a legible, explicitly non-production driver for registration, launch, and score exercises.
 */

/** Render the local-only administrative UI from registered tool state. */
export function renderUi({ registry, apiBase, banner, status }, state = {}) {
  const reg = registry.get();
  const tool = reg.tool ?? {};
  const log = state.log ? String(state.log) : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(banner)}</title>
  <style>
    :root { color-scheme:light; --paper:#fff; --surface:#f5f7fb; --surface-strong:#edf1f8; --ink:#172033; --muted:#687083; --quiet:#8b92a2; --line:#d8dde8; --line-strong:#bcc4d2; --accent:#164ce5; --accent-hover:#0f3fc8; --accent-soft:#edf2ff; --confirmed:#18794e; --confirmed-soft:#eef9f3; --warning:#9a5708; --warning-soft:#fff7e8; --danger:#a33b46; --danger-soft:#fff1f2; --focus:#0068d8; --radius-sm:6px; --radius-md:9px; --ui:"Avenir Next",Avenir,"Helvetica Neue",Helvetica,Arial,sans-serif; --display:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif; --mono:"SFMono-Regular",Consolas,"Liberation Mono",monospace; color:var(--ink); background:var(--paper); font-family:var(--ui); }
    * { box-sizing:border-box; } body { max-width:1240px; min-width:320px; margin:0 auto; padding:clamp(1rem,3vw,2.5rem); line-height:1.5; -webkit-font-smoothing:antialiased; } button,input { font:inherit; } button,a { -webkit-tap-highlight-color:transparent; } button:focus-visible,a:focus-visible,input:focus-visible { outline:3px solid color-mix(in srgb,var(--focus) 62%,transparent); outline-offset:3px; }
    .skip { position:fixed; z-index:20; top:12px; left:12px; padding:10px 14px; border-radius:var(--radius-sm); color:var(--paper); background:var(--ink); transform:translateY(-160%); } .skip:focus { transform:translateY(0); }
    .masthead { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:2rem; align-items:start; padding:0 0 1.4rem; border-bottom:1px solid var(--line-strong); } .eyebrow { margin:0 0 .45rem; color:var(--accent); font:700 .7rem/1.3 var(--mono); letter-spacing:.09em; text-transform:uppercase; } h1 { margin:0; font:500 clamp(2.2rem,5vw,3.65rem)/.98 var(--display); letter-spacing:-.04em; } h2 { margin:0 0 .75rem; font:650 1.3rem/1.2 var(--ui); letter-spacing:-.02em; } h3 { margin:1.35rem 0 .35rem; font:650 .98rem/1.2 var(--ui); } .sub { max-width:55rem; margin:.8rem 0 0; color:var(--muted); } .warning-badge { max-width:16rem; padding:.65rem .75rem; border:1px solid #e4a24d; border-radius:var(--radius-sm); background:var(--warning-soft); color:#68420f; font:700 .72rem/1.35 var(--mono); text-align:right; text-transform:uppercase; }
    .workspace { display:grid; grid-template-columns:minmax(0,1.38fr) minmax(280px,.72fr); gap:1rem; margin-top:1.35rem; } .panel { min-width:0; padding:clamp(1rem,2.5vw,1.45rem); border:1px solid var(--line); border-radius:var(--radius-md); background:var(--paper); } .panel--actions { background:#fbfcfe; } .panel--log { grid-column:1/-1; }
    .step { display:inline-block; margin-bottom:.6rem; color:var(--accent); font:700 .7rem/1 var(--mono); letter-spacing:.09em; text-transform:uppercase; } .muted { color:var(--muted); font-size:.88rem; } .field-grid { display:grid; grid-template-columns:1fr 1fr; gap:.8rem 1rem; } label { display:block; color:#35405a; font-size:.79rem; font-weight:650; } input { display:block; width:100%; min-width:0; min-height:40px; margin-top:.3rem; padding:.55rem .65rem; border:1px solid var(--line-strong); border-radius:var(--radius-sm); background:var(--paper); color:var(--ink); } input:hover { border-color:#8c98aa; } input:user-invalid { border-color:var(--danger); background:var(--danger-soft); } .actions { display:flex; flex-wrap:wrap; gap:.6rem; margin-top:1rem; } button,.download-link { display:inline-flex; align-items:center; justify-content:center; min-height:2.5rem; padding:.54rem .8rem; border:1px solid var(--accent); border-radius:var(--radius-sm); background:var(--accent); color:#fff; cursor:pointer; font-size:.82rem; font-weight:700; line-height:1.2; text-decoration:none; } button:hover,.download-link:hover { border-color:var(--accent-hover); background:var(--accent-hover); } button.secondary,.download-link.secondary { border-color:var(--line-strong); background:var(--paper); color:#35405a; } button.secondary:hover,.download-link.secondary:hover { border-color:#8fb0ff; color:var(--accent); background:var(--accent-soft); } button:disabled { cursor:wait; opacity:.55; } .download-grid { display:flex; flex-wrap:wrap; gap:.55rem; }
    .protocol { display:grid; gap:0; padding:0; margin:1rem 0 0; list-style:none; border-top:1px solid var(--line); } .protocol li { display:grid; grid-template-columns:1.7rem minmax(0,1fr); gap:.6rem; padding:.7rem 0; border-bottom:1px solid var(--line); } .protocol b { color:var(--accent); font-family:var(--mono); } code { overflow-wrap:anywhere; border:1px solid var(--line); border-radius:3px; background:var(--surface); padding:.1em .28em; color:#465063; font-family:var(--mono); font-size:.86em; } .status { display:flex; align-items:center; gap:.55rem; min-height:2.75rem; margin:1rem 0 0; padding:.62rem .75rem; border:1px solid #9ed1b6; border-left:3px solid var(--confirmed); border-radius:var(--radius-sm); background:var(--confirmed-soft); color:#18573b; font-size:.86rem; } .status[data-state="error"] { border-color:#d98b91; border-left-color:var(--danger); background:var(--danger-soft); color:#702a32; } .status[data-state="working"] { border-color:#e4a24d; border-left-color:var(--warning); background:var(--warning-soft); color:#68420f; } pre { max-width:100%; max-height:340px; margin:0; padding:1rem; overflow:auto; border:1px solid #27324a; border-radius:var(--radius-sm); background:var(--ink); color:#e8edf7; font:.78rem/1.55 var(--mono); white-space:pre-wrap; overflow-wrap:anywhere; } footer { margin:1.25rem 0 0; padding-top:1rem; border-top:1px solid var(--line); color:var(--muted); font-size:.8rem; } footer p { margin:.3rem 0; }
    @media (max-width:760px) { body { padding:1rem .8rem 1.5rem; } .masthead,.workspace { grid-template-columns:1fr; } .warning-badge { max-width:none; text-align:left; } .field-grid { grid-template-columns:1fr; } .panel--log { grid-column:auto; } .actions > *,.download-grid > * { flex:1 1 100%; } }
    @media (prefers-reduced-motion:reduce) { * { scroll-behavior:auto!important; transition:none!important; animation:none!important; } }
  </style>
</head>
<body>
  <a class="skip" href="#registration-heading">Skip to tool registration</a>
  <header class="masthead">
    <div><p class="eyebrow">LTI integration rehearsal · local lab</p><h1>External tool admin</h1><p class="sub">Exercise a mock registration, LTI 1.3 launch, and AGS score path against the local Practice Relay API at <code>${esc(apiBase)}</code>. This page is an operator rehearsal surface, not a product application.</p></div>
    <p class="warning-badge">${esc(banner)}<br>${esc(status)} · not production<br>not a real LMS · not IMS certified</p>
  </header>
  <main class="workspace">
    <section class="panel" aria-labelledby="registration-heading">
      <p class="step">01 · tool registration</p><h2 id="registration-heading">Register the local tool</h2><p class="muted">Paste local tool endpoints as you would in a platform setup. Saving affects this in-memory mock only.</p>
      <form id="reg-form">
        <div class="field-grid">
          <label>Client ID <input name="clientId" value="${esc(tool.clientId ?? "practice-relay-tool")}" required /></label>
          <label>Deployment ID <input name="deploymentId" value="${esc(tool.deploymentId ?? "practice-relay-lab-deploy-1")}" required /></label>
          <label>Target Link URI <input name="targetLinkUri" value="${esc(tool.targetLinkUri ?? apiBase + "/lti/launch")}" required /></label>
          <label>OIDC Login Initiation URL <input name="oidcLoginInitiationUrl" value="${esc(tool.oidcLoginInitiationUrl ?? apiBase + "/lti/login")}" required /></label>
          <label>JWKS URL <input name="jwksUrl" value="${esc(tool.jwksUrl ?? apiBase + "/lti/jwks")}" required /></label>
          <label>AGS token URL <input name="agsTokenUrl" value="${esc(tool.agsTokenUrl ?? apiBase + "/lti/oauth/token")}" required /></label>
        </div>
        <div class="actions"><button type="submit">Save local registration</button><button type="button" class="secondary" id="btn-fixture">Load fixture</button></div>
      </form>
      <h3>Preflight files</h3><p class="muted">These JSON files are shaped for administrator fields only. They are not a platform installation or production configuration.</p>
      <div class="download-grid"><a class="download-link secondary" href="/fixtures/canvas-tool-config.json" download="canvas-tool-config.json">Canvas preflight JSON</a><a class="download-link secondary" href="/fixtures/moodle-tool-config.json" download="moodle-tool-config.json">Moodle preflight JSON</a><a class="download-link secondary" href="/fixtures/deployment-registration.json" download="deployment-registration.json">Deployment registration</a></div>
    </section>
    <section class="panel panel--actions" aria-labelledby="actions-heading">
      <p class="step">02 · platform exercise</p><h2 id="actions-heading">Run local checks</h2><p class="muted">Each action calls the local mock route and records its result below. No production LMS is contacted.</p>
      <label>User (login_hint / sub) <input id="userId" value="faculty-ada" required /></label>
      <ol class="protocol"><li><b>01</b><span>Fetch the tool <code>JWKS</code>.</span></li><li><b>02</b><span>Begin OIDC login initiation.</span></li><li><b>03</b><span>Issue and submit a lab launch.</span></li><li><b>04</b><span>Request an AGS token and post a lab score.</span></li></ol>
      <div class="actions"><button type="button" id="btn-jwks">Fetch JWKS</button><button type="button" id="btn-oidc">Start OIDC</button><button type="button" id="btn-launch">Issue launch</button><button type="button" id="btn-ags">Post AGS score</button></div>
      <p id="ui-status" class="status" role="status" aria-live="polite" data-state="idle">Ready for a local-only platform exercise.</p>
    </section>
    <section class="panel panel--log" aria-labelledby="log-heading"><p class="step">Exercise log</p><h2 id="log-heading">Latest response</h2><pre id="log" tabindex="0">${esc(log || "Ready. " + banner)}</pre></section>
  </main>
  <footer><p>Fixtures: <code>deployment-registration.json</code>, <code>canvas-tool-config.json</code>, <code>moodle-tool-config.json</code>.</p><p>Local-lab references: <code>practice-relay/docs/lab-only-tier.md</code> and <code>practice-relay/docs/lms-registration-preflight.md</code>.</p></footer>
  <script>
    const logEl = document.getElementById("log"); const statusEl = document.getElementById("ui-status");
    function log(value) { logEl.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2); }
    function setStatus(message, state = "idle") { statusEl.textContent = message; statusEl.dataset.state = state; }
    async function requestJson(path, options) { const response = await fetch(path, options); const text = await response.text(); let body; try { body = JSON.parse(text); } catch { body = { raw:text }; } if (!response.ok) throw new Error(body.error || "Request returned " + response.status); return body; }
    async function run(button, label, task) { const prior = button.textContent; button.disabled = true; button.textContent = "Working…"; setStatus(label + " is running against the local mock.", "working"); try { log(await task()); setStatus(label + " completed locally. Inspect the response log.", "success"); } catch (error) { log({ ok:false, error:error instanceof Error ? error.message : String(error) }); setStatus(label + " could not complete. No production system was contacted.", "error"); } finally { button.disabled = false; button.textContent = prior; } }
    function post(path, body) { return requestJson(path, { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify(body ?? {}) }); }
    document.getElementById("reg-form").addEventListener("submit", (event) => { event.preventDefault(); const button = event.submitter || event.currentTarget.querySelector("button[type='submit']"); const tool = Object.fromEntries(new FormData(event.currentTarget).entries()); void run(button, "Local registration", () => post("/api/register", { tool })); });
    document.getElementById("btn-fixture").addEventListener("click", (event) => { void run(event.currentTarget, "Fixture load", () => requestJson("/api/registration")); });
    document.getElementById("btn-jwks").addEventListener("click", (event) => { void run(event.currentTarget, "JWKS fetch", () => requestJson("/api/jwks")); });
    document.getElementById("btn-oidc").addEventListener("click", (event) => { void run(event.currentTarget, "OIDC initiation", () => post("/api/oidc-init", { loginHint:document.getElementById("userId").value })); });
    document.getElementById("btn-launch").addEventListener("click", (event) => { void run(event.currentTarget, "Launch exercise", () => post("/api/launch", { userId:document.getElementById("userId").value })); });
    document.getElementById("btn-ags").addEventListener("click", (event) => { void run(event.currentTarget, "AGS score exercise", () => post("/api/ags-score", { userId:document.getElementById("userId").value, recordId:"ps-mock-platform-demo", scoreGiven:1 })); });
  </script>
</body>
</html>`;
}

/** Escape interpolated values before they enter the administrative document. */
function esc(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
