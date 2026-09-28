/**
 * F5.0 — gate do Domain Store via painel Super Admin.
 */

import { isChatMigrationFlagEnabled } from '@/lib/chatMigrationFlagManager';

/** Verdadeiro quando CHAT_CORE_STORE está ligada no painel (default OFF). */
export function shouldUseChatDomainStore(): boolean {
  return isChatMigrationFlagEnabled('CHAT_CORE_STORE');
}
