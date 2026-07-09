/**
 * F5.7 — logging de shadow/parity somente com CHAT_CORE_METRICS.
 */

import { isChatMigrationFlagEnabled } from '@/lib/chatMigrationFlagManager';

export function logShadowDev(event: string, payload: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  if (!isChatMigrationFlagEnabled('CHAT_CORE_METRICS')) return;
  console.debug(`[chat-core-store-shadow] ${event}`, payload);
}
