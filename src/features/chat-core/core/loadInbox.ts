/**
 * F5.9 — único pipeline Repository → Command → Domain Store (inbox).
 */

import type { ChatConversation } from '@/services/chat';
import type { ChatDomainConversation, ChatInboxScope, ChatInstanceId } from '../domain/types';
import { mapLegacyConversationToDomain } from '../store/domainMappers';
import {
  applyStoreConversationListInternal,
  readStoreConversationCount,
} from '../store/consolidation';
import { ensureChatDomainStoreSession } from '../store/session';
import { shouldUseChatDomainStore } from '../store/flags';
import { fetchInboxConversations, type LoadInboxFetchParams, type LoadInboxSurface } from './inboxFetch';

export type LoadInboxParams = LoadInboxFetchParams & {
  /** Quando true, permite gravar lista vazia no Store. */
  allowEmpty?: boolean;
};

export type LoadInboxResult = {
  items: ChatConversation[];
  domain: ChatDomainConversation[];
  /** Store recebeu a lista (false se stale ou skip empty). */
  applied: boolean;
  /** Resposta descartada por generation mais recente. */
  stale: boolean;
};

let loadInboxGeneration = 0;
const inFlight = new Map<string, Promise<LoadInboxResult>>();

function buildLoadKey(params: LoadInboxParams): string {
  const {
    instanceIds,
    inboxScope,
    surface = 'chat',
    quickFilter = 'all',
    attendanceFilter = '',
    channelOrigin = 'all',
    conversationFilter,
    allowEmpty = false,
  } = params;
  return JSON.stringify({
    ids: [...instanceIds].sort(),
    inboxScope,
    surface,
    quickFilter,
    attendanceFilter: attendanceFilter ?? '',
    channelOrigin,
    conversationFilter: conversationFilter ?? '',
    allowEmpty,
  });
}

function shouldWriteToStore(items: ChatConversation[], allowEmpty: boolean): boolean {
  if (items.length > 0) return true;
  if (allowEmpty) return true;
  return readStoreConversationCount() === 0;
}

function writeInboxToStore(items: ChatConversation[], generation: number): boolean {
  if (generation !== loadInboxGeneration) return false;
  if (!shouldUseChatDomainStore()) return false;
  ensureChatDomainStoreSession();
  applyStoreConversationListInternal(items);
  return true;
}

/** Invalida loads em voo e opcionalmente limpa o Store. */
export function clearInboxCommand(options?: { allowEmpty?: boolean }): void {
  loadInboxGeneration += 1;
  inFlight.clear();
  if (!shouldUseChatDomainStore()) return;
  if (options?.allowEmpty !== false) {
    ensureChatDomainStoreSession();
    applyStoreConversationListInternal([]);
  }
}

/** @internal testes — generation atual do loader. */
export function getLoadInboxGenerationForTests(): number {
  return loadInboxGeneration;
}

/** @internal testes — reseta estado do loader. */
export function resetLoadInboxStateForTests(): void {
  loadInboxGeneration = 0;
  inFlight.clear();
}

/**
 * Único command oficial de hidratação de inbox.
 * Repository → normalização → Store (quando CHAT_CORE_STORE ON).
 */
export async function loadInboxCommand(params: LoadInboxParams): Promise<LoadInboxResult> {
  const loadKey = buildLoadKey(params);
  const existing = inFlight.get(loadKey);
  if (existing) {
    return existing;
  }

  const task = (async (): Promise<LoadInboxResult> => {
    const generation = ++loadInboxGeneration;
    try {
      const items = await fetchInboxConversations(params);
      const domain = items.map(mapLegacyConversationToDomain);

      if (generation !== loadInboxGeneration) {
        return { items, domain, applied: false, stale: true };
      }

      if (!shouldUseChatDomainStore()) {
        return { items, domain, applied: false, stale: false };
      }

      const allowEmpty = params.allowEmpty === true;
      if (!shouldWriteToStore(items, allowEmpty)) {
        return { items, domain, applied: false, stale: false };
      }

      const applied = writeInboxToStore(items, generation);
      return { items, domain, applied, stale: !applied && generation !== loadInboxGeneration };
    } finally {
      inFlight.delete(loadKey);
    }
  })();

  inFlight.set(loadKey, task);
  return task;
}

export type { LoadInboxSurface };
