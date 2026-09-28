/**
 * F5.1 — event bus do Domain Store (implementação real, shadow).
 */

import type { ChatDomainEvent } from '../domain/types';
import {
  applyChatStoreBootstrap,
  applyChatStoreReconnect,
  applyChatStoreReset,
  syncStoreFromCommandResult,
  syncStoreFromRepositoryResponse,
  syncStoreFromSocketEvent,
  type ChatStoreBootstrapParams,
} from './integration';
import type { ChatDomainEventBus } from './types';
import type { RepositorySyncSource } from './repositorySync';

export function createChatDomainEventBusImpl(): ChatDomainEventBus {
  return {
    applySocketEvent(event: ChatDomainEvent): void {
      syncStoreFromSocketEvent(event);
    },
    applyRepositoryResponse(source: string, payload: unknown): void {
      syncStoreFromRepositoryResponse(source as RepositorySyncSource, payload);
    },
    applyCommandResult(command: string, payload: unknown): void {
      syncStoreFromCommandResult(command, payload);
    },
    applyReconnect(): void {
      applyChatStoreReconnect();
    },
    applyBootstrap(params?: ChatStoreBootstrapParams): void {
      void applyChatStoreBootstrap(params);
    },
    applyReset(): void {
      applyChatStoreReset();
    },
  };
}
