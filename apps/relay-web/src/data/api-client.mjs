/** Bounded browser requests; callers own cancellation and session lifetime. */

/** Resolve the configured API target without allowing a path to replace its origin. */
function requestTarget(base, path) {
  const baseText = String(base).replace(/\/$/u, "");
  if (typeof path === "string" && /^https?:\/\//u.test(path)) {
    let target;
    let api;
    try {
      target = new URL(path);
      api = new URL(baseText);
    } catch {
      throw new Error("API request target is invalid.");
    }
    if (target.origin !== api.origin) {
      throw new Error("API requests cannot send credentials to another origin.");
    }
    return target.href;
  }
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
    throw new Error("API request paths must be same-origin absolute paths.");
  }
  return `${baseText}${path}`;
}

/** Parse JSON when possible so problem details and denied decisions remain inspectable. */
async function responsePayload(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); }
  catch { return text; }
}

/** Fetch API JSON or media with authentication, cancellation, and a bounded deadline. */
export async function requestJson(base, path, {
  token,
  body,
  rawBody,
  method,
  headers,
  responseType = "json",
  signal,
  timeoutMs = 10_000,
} = {}) {
  if (body !== undefined && rawBody !== undefined) {
    throw new Error("Provide either a JSON body or a raw body, not both.");
  }
  const target = requestTarget(base, path);
  const requestHeaders = new Headers(headers);
  if (token) requestHeaders.set("Authorization", `Bearer ${token}`);
  if (body !== undefined && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }
  const response = await fetch(target, {
    method: method ?? (body !== undefined || rawBody !== undefined ? "POST" : "GET"),
    headers: requestHeaders,
    body: body !== undefined ? JSON.stringify(body) : rawBody,
    signal: AbortSignal.any([
      signal ?? new AbortController().signal,
      AbortSignal.timeout(timeoutMs),
    ]),
  });
  if (!response.ok) {
    const payload = await responsePayload(response);
    const reason = payload && typeof payload === "object"
      && Array.isArray(payload.decision?.reasons)
      ? payload.decision.reasons.find((item) => typeof item === "string" && item.trim())
      : undefined;
    const detail = payload && typeof payload === "object" && typeof payload.detail === "string"
      ? payload.detail
      : reason ?? `The record service returned ${response.status}.`;
    const error = new Error(detail);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  if (responseType === "blob") return response.blob();
  if (response.status === 204) return null;
  return responsePayload(response);
}
