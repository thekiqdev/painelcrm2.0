/**
 * Diagnóstico de abertura do /chat (DEV, VITE_CHAT_PERF=1 ou VITE_CHAT_ROUTE_DIAG=1).
 * Mede: clique/rota → fallback Suspense → chunk → mount → cache → dados.
 */
const marks = new Map<string, number>();
let routeEnterOrigin: string | null = null;

export function isChatRouteDiagEnabled(): boolean {
  return (
    import.meta.env.DEV ||
    import.meta.env.VITE_CHAT_PERF === '1' ||
    import.meta.env.VITE_CHAT_ROUTE_DIAG === '1'
  );
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function chatRouteTime(label: string, detail?: Record<string, unknown>): void {
  if (!isChatRouteDiagEnabled()) return;
  const t = now();
  marks.set(label, t);
  if (typeof console.time === 'function' && !marks.has(`__timer_${label}`)) {
    try {
      console.time(`[chat-route] ${label}`);
      marks.set(`__timer_${label}`, t);
    } catch {
      /* ignore duplicate console.time */
    }
  }
  console.info(`[chat-route] ${label}`, { ms: Math.round(t), ...detail });
}

export function chatRouteTimeEnd(label: string, detail?: Record<string, unknown>): void {
  if (!isChatRouteDiagEnabled()) return;
  marks.set(label, now());
  try {
    console.timeEnd(`[chat-route] ${label}`);
  } catch {
    /* timer may not exist */
  }
  const startKey = Object.keys(Object.fromEntries(marks)).find((k) => k === `__timer_${label}`);
  if (startKey) {
    const start = marks.get(`__timer_${label}`);
    const end = marks.get(label);
    if (start != null && end != null) {
      console.info(`[chat-route] ${label} Δ`, { ms: Math.round(end - start), ...detail });
    }
  }
}

export function chatRouteMarkRouteEnter(origin = 'navigate'): void {
  if (!isChatRouteDiagEnabled()) return;
  routeEnterOrigin = origin;
  const t = now();
  marks.clear();
  marks.set('route_enter', t);
  console.info('[chat-route] route_enter', { origin, ms: Math.round(t) });
  try {
    console.time('[chat-route] route_enter→shell_visible');
    console.time('[chat-route] route_enter→chat_mount');
    console.time('[chat-route] route_enter→chunk_loaded');
  } catch {
    /* ignore */
  }
}

export function chatRouteMarkSuspenseFallback(): void {
  chatRouteTime('suspense_fallback_shown');
  chatRouteTimeEnd('route_enter→shell_visible');
}

export function chatRouteMarkChunkLoaded(): void {
  chatRouteTime('chunk_loaded');
  try {
    console.timeEnd('[chat-route] route_enter→chunk_loaded');
  } catch {
    /* ignore */
  }
}

export function chatRouteMarkChatMount(): void {
  chatRouteTime('chat_component_mount');
  try {
    console.timeEnd('[chat-route] route_enter→chat_mount');
  } catch {
    /* ignore */
  }
}

export function chatRouteMarkIndexedDbRestoreDone(): void {
  chatRouteTime('indexeddb_restore_done');
}

export function chatRouteMarkInstancesLoaded(count: number): void {
  chatRouteTime('instances_loaded', { count });
}

export function chatRouteMarkConversationsLoaded(count: number): void {
  chatRouteTime('conversations_loaded', { count });
}

export function chatRouteSummary(): void {
  if (!isChatRouteDiagEnabled()) return;
  const order = [
    'route_enter',
    'chunk_preload_start',
    'chunk_preload_done',
    'suspense_fallback_shown',
    'chunk_loaded',
    'chat_component_mount',
    'indexeddb_restore_done',
    'chat_first_paint',
    'instances_loaded',
    'conversations_loaded',
  ];
  const rows: Record<string, number | null> = {};
  const t0 = marks.get('route_enter') ?? marks.get('chunk_preload_start') ?? 0;
  for (const key of order) {
    const t = marks.get(key);
    rows[key] = t != null ? Math.round(t - t0) : null;
  }
  console.info('[chat-route] summary', { origin: routeEnterOrigin, deltas_ms: rows });
}
