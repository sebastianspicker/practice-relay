/** Session-scoped summaries and full records; previews never mutate remote data. */
import { requestJson } from "./api-client.mjs";
import { toWorkspaceRecord } from "./workspace-record.mjs";

/** Standard cancellation error used when an obsolete response must be ignored. */
function superseded() {
  return new DOMException("Superseded request", "AbortError");
}

/** Create an isolated controller with cancellable reads and independent commands. */
export function createWorkspaceState(base, {
  request = requestJson,
  changed = () => {},
  expired = () => {},
} = {}) {
  const state = {
    session: null,
    summaries: [],
    selected: null,
    nextCursor: null,
    query: "",
    demo: false,
  };
  const cache = new Map();
  const lanes = new Map();
  let timer;
  let generation = 0;
  let selectionGeneration = 0;
  let commandSequence = 0;

  const abort = (lane) => {
    lanes.get(lane)?.abort();
    lanes.delete(lane);
  };
  const clear = () => {
    generation += 1;
    selectionGeneration += 1;
    clearTimeout(timer);
    for (const lane of [...lanes.keys()]) abort(lane);
    cache.clear();
    Object.assign(state, {
      session: null,
      summaries: [],
      selected: null,
      nextCursor: null,
      query: "",
      demo: false,
    });
  };
  const run = async (lane, path, options = {}, { replace = true, expireOnForbidden = false } = {}) => {
    if (replace) abort(lane);
    const controller = new AbortController();
    lanes.set(lane, controller);
    const epoch = generation;
    try {
      const value = await request(base, path, {
        ...options,
        token: state.session?.token,
        signal: controller.signal,
      });
      if (controller.signal.aborted || epoch !== generation) throw superseded();
      return value;
    } catch (error) {
      const sessionEnded = error.status === 401
        || (expireOnForbidden && error.status === 403);
      if (epoch === generation && !controller.signal.aborted && sessionEnded) {
        clear();
        changed();
        expired();
      }
      throw error;
    } finally {
      if (lanes.get(lane) === controller) lanes.delete(lane);
    }
  };

  /** Adapt and retain a returned canonical record without reviving an old selection. */
  const accept = (record) => {
    if (!record || typeof record !== "object" || record.id == null) {
      throw new Error("Invalid canonical WorkRecord.");
    }
    const workspace = toWorkspaceRecord(record);
    for (const [key, cached] of cache) {
      if (cached.id === workspace.id) cache.delete(key);
    }
    cache.set(JSON.stringify([state.session?.userId ?? "demo", workspace.id, workspace.revision]), workspace);
    const index = state.summaries.findIndex((summary) => String(summary.id) === workspace.id);
    if (index >= 0) {
      state.summaries = state.summaries.map((summary, itemIndex) =>
        itemIndex === index ? workspace : summary);
    } else {
      state.summaries = [...state.summaries, workspace];
    }
    if (state.selected && state.selected.id === workspace.id) state.selected = workspace;
    changed();
    return workspace;
  };

  return {
    apiBase: String(base).replace(/\/$/u, ""),
    state,
    accept,
    logout() { clear(); changed(); },
    async login(userId, password) {
      clear();
      changed();
      const session = await run("login", "/auth/login", { body: { userId, password } });
      const duration = Date.parse(session.expiresAt) - Date.now();
      if (!session.token || !session.userId || !Number.isFinite(duration) || duration <= 0) {
        throw new Error("Invalid or expired login session.");
      }
      state.session = session;
      timer = setTimeout(() => {
        clear();
        changed();
        expired();
      }, Math.min(duration, 2_147_483_647));
      changed();
    },
    async list(query = "", append = false) {
      if (!state.session) throw new Error("Sign in to load records.");
      abort("detail");
      state.query = query;
      if (!append) {
        state.summaries = [];
        state.nextCursor = null;
      }
      const params = new URLSearchParams({ limit: "50", title: query });
      if (append && state.nextCursor) params.set("cursor", state.nextCursor);
      const payload = await run(
        "list",
        `/work-records?${params}`,
        {},
        { expireOnForbidden: true },
      );
      if (!Array.isArray(payload.items)) throw new Error("Invalid record collection.");
      state.summaries = append ? [...state.summaries, ...payload.items] : payload.items;
      state.nextCursor = payload.nextCursor;
      changed();
    },
    async select(summary) {
      if (!state.session) throw new Error("Sign in to load records.");
      const selection = ++selectionGeneration;
      abort("detail");
      const key = JSON.stringify([state.session.userId, summary.id, summary.revision]);
      if (cache.has(key)) {
        state.selected = cache.get(key);
        return state.selected;
      }
      const record = await run(
        "detail",
        `/work-records/${encodeURIComponent(summary.id)}`,
        {},
        { expireOnForbidden: true },
      );
      if (selection !== selectionGeneration) throw superseded();
      const workspace = toWorkspaceRecord(record);
      cache.set(JSON.stringify([state.session.userId, workspace.id, workspace.revision]), workspace);
      state.selected = workspace;
      return workspace;
    },
    /** Run one operation without cancelling other commands in flight. */
    request(path, options = {}) {
      if (state.demo) return Promise.reject(new Error("Remote operations are unavailable in demo mode."));
      if (!state.session) return Promise.reject(new Error("Sign in to use record operations."));
      const lane = `command:${++commandSequence}`;
      return run(lane, path, options, { replace: false });
    },
    /** Reload the selected canonical record, bypassing the revision cache. */
    async refresh() {
      if (state.demo) throw new Error("Remote operations are unavailable in demo mode.");
      if (!state.session) throw new Error("Sign in to refresh records.");
      const selectedId = state.selected?.id;
      if (!selectedId) throw new Error("Select a record first.");
      const selection = selectionGeneration;
      const record = await run(
        `refresh:${++commandSequence}`,
        `/work-records/${encodeURIComponent(selectedId)}`,
        {},
        { replace: false, expireOnForbidden: true },
      );
      if (selection !== selectionGeneration || state.selected?.id !== selectedId) throw superseded();
      accept(record);
      return record;
    },
    demo(records) {
      clear();
      state.demo = true;
      state.summaries = records.map(toWorkspaceRecord);
      state.selected = state.summaries[0] ?? null;
      changed();
    },
  };
}
