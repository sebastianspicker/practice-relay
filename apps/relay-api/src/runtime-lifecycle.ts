/** Bounded startup, periodic durable cleanup, and orderly dependency shutdown. */
import type { ApiRuntime } from "./runtime.ts";

const cleanup = new WeakMap<ApiRuntime, { timer: ReturnType<typeof setInterval>; pending?: Promise<unknown> }>();

/** Check configured dependencies and recover abandoned operations before accepting traffic. */
export async function initializeRuntime(runtime: ApiRuntime): Promise<void> {
  await runtime.recordStore.checkHealth();
  await runtime.coordination.checkHealth();
  await runtime.mediaStore.initialize();
  const isReferenced = async (meta: { recordId: string; storageKey: string }) => {
    const record = await runtime.recordStore.get(meta.recordId);
    return record?.takes.some((take) => take.storageKey === meta.storageKey) ?? false;
  };
  await runtime.mediaStore.recover({ isReferenced });
  if (cleanup.has(runtime)) return;
  const state: { timer: ReturnType<typeof setInterval>; pending?: Promise<unknown> } = {
    timer: setInterval(() => {
      if (state.pending) return;
      state.pending = runtime.mediaStore.recover({ isReferenced }).catch(() => undefined).finally(() => { state.pending = undefined; });
    }, 30_000),
  };
  state.timer.unref();
  cleanup.set(runtime, state);
}

/** Stop local resources; durable unfinished work remains in the database for recovery. */
export async function closeRuntime(runtime: ApiRuntime): Promise<void> {
  const state = cleanup.get(runtime);
  if (state) { clearInterval(state.timer); cleanup.delete(runtime); await state.pending; }
  await runtime.mediaStore.close();
  await runtime.coordination.close();
  await runtime.recordStore.close();
  await runtime.database?.close();
}
