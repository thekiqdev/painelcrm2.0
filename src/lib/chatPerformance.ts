/** Métricas temporárias de abertura do chat (DEV ou VITE_CHAT_PERF=1). */

const marks = new Map<string, number>();

export function isChatPerfEnabled(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_CHAT_PERF === '1';
}

export function markChatPerf(label: string): void {
  if (!isChatPerfEnabled()) return;
  marks.set(label, performance.now());
  console.info(`[chat-perf] ${label}`, { t: performance.now() });
  if (label === 'chat_first_paint') {
    void import('@/lib/chatRouteTiming').then((m) => {
      m.chatRouteTime('chat_first_paint');
    });
  }
}

export function measureChatPerf(from: string, to: string): void {
  if (!isChatPerfEnabled()) return;
  const a = marks.get(from);
  const b = marks.get(to) ?? performance.now();
  if (a == null) return;
  console.info(`[chat-perf] ${from} → ${to}`, { ms: Math.round(b - a) });
}
