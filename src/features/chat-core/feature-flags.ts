/**
 * Feature flags das fases F1–F5 do Master Plan Chat Enterprise.
 * Leitura exclusiva via Chat Migration Flag Manager (painel Super Admin).
 */

import {
  isChatMigrationFlagEnabled,
  getChatMigrationFlagsSnapshot,
} from '@/lib/chatMigrationFlagManager';

export type ChatMigrationPhaseFlag =
  | 'CHAT_SINGLE_SOCKET'
  | 'CHAT_WS_PATCH'
  | 'CHAT_INSTANCE_REGISTRY'
  | 'CHAT_AGGREGATED_CONVERSATIONS'
  | 'CHAT_CORE_STORE'
  | 'CHAT_INBOX_CURSOR'
  | 'CHAT_REDIS_WS';

/** Sub-flags F2 — uma por tipo de evento WS (todas OFF por default). */
export type ChatWsPatchFlag =
  | 'CHAT_WS_PATCH_MESSAGE'
  | 'CHAT_WS_PATCH_CONVERSATION'
  | 'CHAT_WS_PATCH_MESSAGE_UPDATED'
  | 'CHAT_WS_PATCH_DELETE'
  | 'CHAT_WS_PATCH_ATTENDANCE';

/** Sub-flags F3 — registry / unread / reconcile (todas OFF por default). */
export type ChatF3Flag = 'CHAT_UNREAD_ENGINE' | 'CHAT_ATTENDANCE_RECONCILE';

/** Verdadeiro somente se a flag estiver ligada no painel Super Admin. */
export function isChatPhaseFlagEnabled(flag: ChatMigrationPhaseFlag): boolean {
  switch (flag) {
    case 'CHAT_SINGLE_SOCKET':
      return isChatMigrationFlagEnabled('CHAT_SINGLE_SOCKET');
    case 'CHAT_WS_PATCH':
      return isChatWsPatchPhaseStable();
    case 'CHAT_INSTANCE_REGISTRY':
      return isChatMigrationFlagEnabled('CHAT_INSTANCE_REGISTRY');
    case 'CHAT_AGGREGATED_CONVERSATIONS':
      return (
        isChatMigrationFlagEnabled('CHAT_AGGREGATED_FLOAT') ||
        isChatMigrationFlagEnabled('CHAT_AGGREGATED_LEAD') ||
        isChatMigrationFlagEnabled('CHAT_AGGREGATED_SIDEBAR') ||
        isChatMigrationFlagEnabled('CHAT_AGGREGATED_CHAT')
      );
    case 'CHAT_CORE_STORE':
      return isChatMigrationFlagEnabled('CHAT_CORE_STORE');
    case 'CHAT_INBOX_CURSOR':
    case 'CHAT_REDIS_WS':
      return false;
    default:
      return false;
  }
}

/** Sub-flag F2 por tipo de evento. */
export function isChatWsPatchFlagEnabled(flag: ChatWsPatchFlag): boolean {
  return isChatMigrationFlagEnabled(flag);
}

/** Sub-flag F3 (unread / reconcile). */
export function isChatF3FlagEnabled(flag: ChatF3Flag): boolean {
  return isChatMigrationFlagEnabled(flag);
}

export function shouldUseChatInstanceRegistry(): boolean {
  return isChatMigrationFlagEnabled('CHAT_INSTANCE_REGISTRY');
}

export function shouldUseChatUnreadEngine(): boolean {
  return isChatMigrationFlagEnabled('CHAT_UNREAD_ENGINE');
}

export function shouldUseChatAttendanceReconcile(): boolean {
  return isChatMigrationFlagEnabled('CHAT_ATTENDANCE_RECONCILE');
}

/** Snapshot das sub-flags F2. */
export function getChatWsPatchFlagsFromEnv(): Readonly<Record<ChatWsPatchFlag, boolean>> {
  return {
    CHAT_WS_PATCH_MESSAGE: isChatWsPatchFlagEnabled('CHAT_WS_PATCH_MESSAGE'),
    CHAT_WS_PATCH_CONVERSATION: isChatWsPatchFlagEnabled('CHAT_WS_PATCH_CONVERSATION'),
    CHAT_WS_PATCH_MESSAGE_UPDATED: isChatWsPatchFlagEnabled('CHAT_WS_PATCH_MESSAGE_UPDATED'),
    CHAT_WS_PATCH_DELETE: isChatWsPatchFlagEnabled('CHAT_WS_PATCH_DELETE'),
    CHAT_WS_PATCH_ATTENDANCE: isChatWsPatchFlagEnabled('CHAT_WS_PATCH_ATTENDANCE'),
  };
}

/** Fase F2 completa quando todas as sub-flags estão estáveis (ON). */
export function isChatWsPatchPhaseStable(): boolean {
  return Object.values(getChatWsPatchFlagsFromEnv()).every(Boolean);
}

/** Snapshot das sub-flags F3. */
export function getChatF3FlagsFromEnv(): Readonly<Record<ChatF3Flag, boolean>> {
  return {
    CHAT_UNREAD_ENGINE: isChatF3FlagEnabled('CHAT_UNREAD_ENGINE'),
    CHAT_ATTENDANCE_RECONCILE: isChatF3FlagEnabled('CHAT_ATTENDANCE_RECONCILE'),
  };
}

/** Fase F3 estável quando registry + ambas sub-flags ON. */
export function isChatF3PhaseStable(): boolean {
  return (
    shouldUseChatInstanceRegistry() &&
    isChatF3FlagEnabled('CHAT_UNREAD_ENGINE') &&
    isChatF3FlagEnabled('CHAT_ATTENDANCE_RECONCILE')
  );
}

/** Snapshot imutável de todas as flags de fase (útil para métricas / diagnóstico). */
export function getChatPhaseFlagsSnapshot(): Readonly<Record<ChatMigrationPhaseFlag, boolean>> {
  return {
    CHAT_SINGLE_SOCKET: isChatPhaseFlagEnabled('CHAT_SINGLE_SOCKET'),
    CHAT_WS_PATCH: isChatPhaseFlagEnabled('CHAT_WS_PATCH'),
    CHAT_INSTANCE_REGISTRY: isChatPhaseFlagEnabled('CHAT_INSTANCE_REGISTRY'),
    CHAT_AGGREGATED_CONVERSATIONS: isChatPhaseFlagEnabled('CHAT_AGGREGATED_CONVERSATIONS'),
    CHAT_CORE_STORE: isChatPhaseFlagEnabled('CHAT_CORE_STORE'),
    CHAT_INBOX_CURSOR: false,
    CHAT_REDIS_WS: false,
  };
}

/** Mapeamento fase → flag (documentação operacional). */
export const CHAT_PHASE_TO_FLAG = {
  F1: 'CHAT_SINGLE_SOCKET',
  F2: 'CHAT_WS_PATCH',
  F3: 'CHAT_INSTANCE_REGISTRY',
  F4: 'CHAT_AGGREGATED_CONVERSATIONS',
  F5: 'CHAT_CORE_STORE',
  F6: 'CHAT_INBOX_CURSOR',
  F7: 'CHAT_REDIS_WS',
} as const satisfies Record<string, ChatMigrationPhaseFlag>;
