/**
 * Multi-tab Motif session sync: BroadcastChannel, optional Yjs, or in-process memory.
 *
 * Modes: `broadcast` | `yjs` | `memory`
 * Feature flag for Yjs: pass mode "yjs" or set MVEI_WORKBENCH_COLLAB=yjs / COLLAB=1.
 *
 * Not freeform canvas collab. Bounded Motif document snapshot fan-out
 * (same pattern family as @practice-relay/collaboration document rooms).
 */
import { emitMotif, loadMotif } from "./motif.mjs";
import { SESSION_KEY } from "./session-store.mjs";

/** Default BroadcastChannel name for MvEI Workbench Motif multi-tab sync. */
export const SYNC_CHANNEL = "mvei.workbench.motif.sync.v1";

/** Supported transport modes. */
export const SYNC_MODES = Object.freeze(["broadcast", "yjs", "memory"]);

/**
 * @typedef {{ type: "motif-doc", key: string, rev: number, docJson: string, origin?: string }} SyncMessage
 * @typedef {{ postMessage: (data: unknown) => void, close?: () => void, onmessage: ((ev: { data: unknown }) => void) | null }} ChannelLike
 * @typedef {"broadcast"|"yjs"|"memory"} SyncMode
 */

/**
 * Resolve sync mode from opts / env (feature flag).
 * @param {{ mode?: string }} [opts]
 * @param {{ env?: Record<string, string | undefined> }} [globals]
 * @returns {SyncMode}
 */
export function resolveSyncMode(opts = {}, globals = {}) {
  const raw = syncModeInput(opts, globals).toLowerCase().trim();
  if (raw === "yjs" || raw === "broadcast" || raw === "memory") return raw;
  return "broadcast";
}

/** Select the explicit or feature-flagged sync mode before normalizing it. */
function syncModeInput(opts, globals) {
  const env = globals.env ?? {};
  if (opts.mode !== undefined) return String(opts.mode);
  if (env.MVEI_WORKBENCH_COLLAB !== undefined) return String(env.MVEI_WORKBENCH_COLLAB);
  if (env.COLLAB_MODE !== undefined) return String(env.COLLAB_MODE);
  return env.COLLAB === "1" || env.COLLAB === "true" ? "yjs" : "";
}

/**
 * In-process multi-subscriber bus (tests / same-realm / memory mode).
 * @returns {ChannelLike & { _subscribers: Set<Function>, mode: "memory" }}
 */
export function createMemoryChannel() {
  /** @type {Set<(ev: { data: unknown }) => void>} */
  const subscribers = new Set();
  /** @type {ChannelLike & { _subscribers: Set<Function>, mode: "memory" }} */
  const ch = {
    mode: "memory",
    _subscribers: subscribers,
    onmessage: null,
    postMessage(data) {
      const ev = { data };
      for (const sub of subscribers) {
        try {
          sub(ev);
        } catch {
          /* ignore subscriber errors */
        }
      }
      if (typeof ch.onmessage === "function") {
        ch.onmessage(ev);
      }
    },
    close() {
      subscribers.clear();
      ch.onmessage = null;
    },
  };
  return ch;
}

/**
 * Subscribe a handler to a memory channel (in addition to onmessage).
 * @param {ReturnType<typeof createMemoryChannel>} channel
 * @param {(ev: { data: unknown }) => void} handler
 * @returns {() => void} unsubscribe
 */
export function subscribeMemoryChannel(channel, handler) {
  channel._subscribers.add(handler);
  return () => channel._subscribers.delete(handler);
}

/**
 * Yjs-backed Motif channel (document map: key → { rev, docJson, origin }).
 * Mirrors the bounded collaboration pattern: Motif snapshots only, not a freeform canvas.
 *
 * @param {{
 *   Y?: { Doc: new () => { getMap: (n: string) => any, destroy?: () => void, transact: (fn: () => void) => void } },
 *   doc?: { getMap: (n: string) => any, destroy?: () => void, transact: (fn: () => void) => void },
 *   mapName?: string,
 *   roomKey?: string,
 * }} [opts]
 * @returns {ChannelLike & { mode: "yjs", doc: unknown, _subscribers: Set<Function> }}
 */
export function createYjsChannel(opts = {}) {
  /** @type {Set<(ev: { data: unknown }) => void>} */
  const subscribers = new Set();
  const Ymod = opts.Y;
  const doc =
    opts.doc ??
    (Ymod && typeof Ymod.Doc === "function" ? new Ymod.Doc() : createFallbackYDoc());
  const mapName = opts.mapName ?? "motif";
  const roomKey = opts.roomKey ?? SESSION_KEY;
  const root = doc.getMap(mapName);

  /**
   * @param {unknown} data
   */
  function fanOut(data) {
    const ev = { data };
    for (const sub of subscribers) {
      try {
        sub(ev);
      } catch {
        /* ignore */
      }
    }
    if (typeof ch.onmessage === "function") {
      ch.onmessage(ev);
    }
  }

  // Observe map updates from other peers sharing the same doc.
  if (typeof root.observe === "function") root.observe((event) => {
    const payload = changedRoomKey(event, root, roomKey) && readYjsPayload(root, roomKey);
    if (payload) fanOut(payload);
  });

  /** @type {ChannelLike & { mode: "yjs", doc: unknown, _subscribers: Set<Function>, _roomKey: string }} */
  const ch = {
    mode: "yjs",
    doc,
    _subscribers: subscribers,
    _roomKey: roomKey,
    onmessage: null,
    postMessage(data) {
      if (
        !data ||
        typeof data !== "object" ||
        /** @type {SyncMessage} */ (data).type !== "motif-doc"
      ) {
        fanOut(data);
        return;
      }
      const msg = /** @type {SyncMessage} */ (data);
      const apply = () => {
        root.set(roomKey, {
          rev: msg.rev,
          docJson: msg.docJson,
          origin: msg.origin,
        });
      };
      if (typeof doc.transact === "function") {
        doc.transact(apply);
      } else {
        apply();
      }
      // Local fan-out so same-process peers on observe-less fallback still sync
      fanOut(msg);
    },
    close() {
      subscribers.clear();
      ch.onmessage = null;
      if (typeof doc.destroy === "function") doc.destroy();
    },
  };
  return ch;
}

/** Determine whether an observed Yjs map change can affect this room. */
function changedRoomKey(event, root, roomKey) {
  const keys = event?.keysChanged ?? (event?.changes?.keys ? event.changes.keys.keys() : null);
  const changed = keys ? [...keys] : typeof root.keys === "function" ? [...root.keys()] : [roomKey];
  return changed.some((key) => key === roomKey || key == null);
}

/** Read a Motif snapshot payload from a Yjs map in the channel wire shape. */
function readYjsPayload(root, roomKey) {
  const payload = root.get(roomKey);
  if (!payload || typeof payload !== "object") return null;
  return {
    type: "motif-doc", key: roomKey,
    rev: /** @type {{ rev?: number }} */ (payload).rev ?? 0,
    docJson: /** @type {{ docJson?: string }} */ (payload).docJson ?? "",
    origin: /** @type {{ origin?: string }} */ (payload).origin,
  };
}

/**
 * Minimal Map-backed stand-in when yjs package is not loaded (tests / dry environments).
 * Speaks the same getMap/set/observe surface used by createYjsChannel.
 */
function createFallbackYDoc() {
  /** @type {Map<string, Map<string, unknown>>} */
  const maps = new Map();
  /** @type {Map<string, Set<Function>>} */
  const observers = new Map();

  return {
    getMap(name) {
      if (!maps.has(name)) maps.set(name, new Map());
      const m = maps.get(name);
      return {
        get(k) {
          return m.get(k);
        },
        set(k, v) {
          m.set(k, v);
          const obs = observers.get(name);
          if (obs) {
            const ev = { keysChanged: new Set([k]) };
            for (const fn of obs) fn(ev);
          }
        },
        keys() {
          return m.keys();
        },
        observe(fn) {
          if (!observers.has(name)) observers.set(name, new Set());
          observers.get(name).add(fn);
        },
        unobserve(fn) {
          observers.get(name)?.delete(fn);
        },
      };
    },
    transact(fn) {
      fn();
    },
    destroy() {
      maps.clear();
      observers.clear();
    },
  };
}

/**
 * Open a channel for the given mode.
 * @param {SyncMode | string} [mode]
 * @param {{
 *   name?: string,
 *   BroadcastChannel?: typeof BroadcastChannel,
 *   Y?: object,
 *   doc?: object,
 *   roomKey?: string,
 * }} [opts]
 * @returns {ChannelLike & { mode?: string }}
 */
export function openSyncChannel(mode = "broadcast", opts = {}) {
  const m = SYNC_MODES.includes(/** @type {SyncMode} */ (mode))
    ? /** @type {SyncMode} */ (mode)
    : "broadcast";
  if (m === "memory") return createMemoryChannel();
  if (m === "yjs") {
    return createYjsChannel({
      Y: opts.Y,
      doc: opts.doc,
      roomKey: opts.roomKey,
    });
  }
  // broadcast
  const name = opts.name ?? SYNC_CHANNEL;
  const BC = opts.BroadcastChannel ?? globalThis.BroadcastChannel;
  if (typeof BC === "function") {
    const ch = new BC(name);
    return Object.assign(ch, { mode: "broadcast" });
  }
  // Node / no BC → memory fallback, still labelled for tests
  const mem = createMemoryChannel();
  mem.mode = "memory";
  return mem;
}

/**
 * Session sync controller: publish Motif snapshots; apply the greatest revision/origin snapshot.
 *
 * @param {{
 *   mode?: SyncMode | string,
 *   channel?: ChannelLike,
 *   key?: string,
 *   origin?: string,
 *   Y?: object,
 *   doc?: object,
 *   BroadcastChannel?: typeof BroadcastChannel,
 *   env?: Record<string, string | undefined>,
 *   onRemote?: (doc: import("./motif.mjs").MotifDocument, meta: { rev: number, origin?: string }) => void,
 * }} [opts]
 */
export function createSessionSync(opts = {}) {
  const { mode, channel } = resolveSessionChannel(opts);
  const key = opts.key ?? SESSION_KEY;
  const origin =
    opts.origin ?? `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  let rev = 0;
  /** Origin of the snapshot currently selected at `rev`; breaks equal-revision ties. */
  let revOrigin = "";
  let closed = false;
  /** Track last published payload to suppress echo from yjs local fan-out */
  let lastLocalOrigin = origin;

  /**
   * @param {unknown} data
   * @returns {data is SyncMessage}
   */
  function isSyncMessage(data) {
    return (
      !!data &&
      typeof data === "object" &&
      /** @type {SyncMessage} */ (data).type === "motif-doc" &&
      typeof /** @type {SyncMessage} */ (data).docJson === "string" &&
      Number.isSafeInteger(/** @type {SyncMessage} */ (data).rev) &&
      /** @type {SyncMessage} */ (data).rev >= 0
    );
  }

  function handleMessage(ev) {
    const data = ev?.data;
    if (closed || !acceptRemoteMessage(data, { key, origin, lastLocalOrigin, rev, revOrigin, isSyncMessage })) return;
    const remoteOrigin = data.origin ?? "";
    try {
      const doc = loadMotif(data.docJson);
      rev = data.rev;
      revOrigin = remoteOrigin;
      opts.onRemote?.(doc, { rev: data.rev, origin: data.origin });
    } catch {
      /* ignore malformed remote */
    }
  }

  channel.onmessage = handleMessage;
  let unsub = null;
  if (channel._subscribers) {
    unsub = subscribeMemoryChannel(
      /** @type {ReturnType<typeof createMemoryChannel>} */ (channel),
      handleMessage,
    );
  }

  return {
    origin,
    key,
    mode: channel.mode ?? mode,
    get rev() {
      return rev;
    },
    /**
     * Publish current Motif document to other tabs/subscribers.
     * @param {import("./motif.mjs").MotifDocument} doc
     */
    publish(doc) {
      if (closed) return rev;
      if (rev >= Number.MAX_SAFE_INTEGER) {
        throw new Error("session revision exhausted");
      }
      const docJson = emitMotif(doc);
      rev += 1;
      lastLocalOrigin = origin;
      revOrigin = origin;
      /** @type {SyncMessage} */
      const msg = {
        type: "motif-doc",
        key,
        rev,
        docJson,
        origin,
      };
      channel.postMessage(msg);
      return rev;
    },
    /**
     * Apply a local authoritative rev (e.g. after load from storage) without broadcast.
     * @param {number} next
     */
    setRev(next) {
      if (!Number.isSafeInteger(next) || next < 0) {
        throw new Error("session revision must be a nonnegative safe integer");
      }
      rev = next;
      revOrigin = "";
      return rev;
    },
    close() {
      closed = true;
      if (typeof unsub === "function") unsub();
      if (typeof channel.close === "function") channel.close();
      channel.onmessage = null;
    },
  };
}

/** Resolve a supplied channel or construct the requested transport once. */
function resolveSessionChannel(opts) {
  const mode = resolveSyncMode(opts, { env: opts.env ?? globalThis.process?.env });
  const channel = opts.channel ?? openSyncChannel(mode, { Y: opts.Y, doc: opts.doc, BroadcastChannel: opts.BroadcastChannel, roomKey: opts.key ?? SESSION_KEY });
  return { mode, channel };
}

/** Reject messages that cannot advance this controller's selected snapshot. */
function acceptRemoteMessage(data, context) {
  if (!context.isSyncMessage(data) || data.key !== context.key) return false;
  if (data.origin === context.origin || data.origin === context.lastLocalOrigin) return false;
  const remoteOrigin = data.origin ?? "";
  return data.rev > context.rev || (data.rev === context.rev && remoteOrigin > context.revOrigin);
}
