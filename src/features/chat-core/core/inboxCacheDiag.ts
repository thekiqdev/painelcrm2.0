/**
 * TF7 E4 — observabilidade de warm / skip GET (DEV ou VITE_CHAT_LIST_DIAG=1).
 */

import { markChatPerf, isChatPerfEnabled } from '@/lib/chatPerformance';

export type InboxCacheDiagEvent =
  | 'inbox_warm_hit'
  | 'inbox_warm_miss'
  | 'inbox_fetch_skipped_fresh'
  | 'inbox_fetch_network'
  | 'inbox_soft_reconcile';

function isInboxCacheDiagEnabled(): boolean {
  return (
    import.meta.env.DEV ||
    import.meta.env.VITE_CHAT_LIST_DIAG === '1' ||
    import.meta.env.VITE_CHAT_PERF === '1'
  );
}

/** Log + markChatPerf quando telemetria de chat estiver ON. */
export function logInboxCacheEvent(
  event: InboxCacheDiagEvent,
  detail?: Record<string, unknown>,
): void {
  if (!isInboxCacheDiagEnabled()) return;
  console.info(`[inbox-cache] ${event}`, detail ?? {});
  if (
    isChatPerfEnabled() &&
    (event === 'inbox_warm_hit' ||
      event === 'inbox_fetch_skipped_fresh' ||
      event === 'inbox_soft_reconcile')
  ) {
    markChatPerf(event);
  }
}
