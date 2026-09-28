/**
 * F5.11 — política de realtime unificado (Domain Store como SoT).
 */

import { shouldUseChatDomainStore } from '../store/flags';

/** Com CHAT_CORE_STORE ON, inbox/thread são atualizados apenas via Domain Store. */
export function isChatStoreRealtimeSourceOfTruth(): boolean {
  return shouldUseChatDomainStore();
}
