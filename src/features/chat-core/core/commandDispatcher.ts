/**
 * F5.5 — dispatcher central de commands (optimistic → HTTP → confirm/rollback).
 */

import type { ChatCommandName } from '../store/commandState';
import { shouldUseChatDomainStore } from '../store/flags';
import { isChatPhaseFlagEnabled } from '../feature-flags';
import { getChatDomainStoreSession } from '../store/session';
import { confirmCommand } from '../store/confirm';
import { dequeueCommand } from '../store/commandQueue';
import {
  recordCommandExecutionMs,
  recordCommandFailure,
  recordCommandOptimisticLatency,
  recordCommandRollbackCount,
  recordCommandRollbackLatency,
  recordCommandRetry,
} from '../store/commandMetrics';
import { mapLegacyConversationToDomain } from '../store/domainMappers';

export type ExecuteChatCommandOptions<T> = {
  command: ChatCommandName;
  conversationId?: string;
  applyOptimistic: () => string;
  execute: () => Promise<T>;
  mapConfirmPayload?: (result: T) => unknown;
  retries?: number;
};

function useCommandPipeline(): boolean {
  return isChatPhaseFlagEnabled('CHAT_CORE_STORE') && shouldUseChatDomainStore();
}

function rollbackCommand(token: string): void {
  const store = getChatDomainStoreSession();
  if (!store) return;
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  store.dispatch({ type: 'commands/rollback', token });
  dequeueCommand(token);
  recordCommandRollbackCount();
  recordCommandRollbackLatency(
    Math.max(0, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0)),
  );
}

export async function executeChatCommand<T>(options: ExecuteChatCommandOptions<T>): Promise<T> {
  if (!useCommandPipeline()) {
    return options.execute();
  }

  const maxAttempts = Math.max(1, (options.retries ?? 0) + 1);
  let lastError: unknown;
  const execStart = typeof performance !== 'undefined' ? performance.now() : Date.now();

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) recordCommandRetry();
    const optStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const token = options.applyOptimistic();
    recordCommandOptimisticLatency(
      Math.max(0, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - optStart)),
    );

    try {
      const result = await options.execute();
      const payload = options.mapConfirmPayload ? options.mapConfirmPayload(result) : result;
      confirmCommand(token, options.command, payload);

      recordCommandExecutionMs(
        Math.max(0, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - execStart)),
      );
      return result;
    } catch (error) {
      lastError = error;
      rollbackCommand(token);
      recordCommandFailure();
      if (attempt + 1 >= maxAttempts) break;
    }
  }

  throw lastError;
}

export function mapLegacyConversationResult(result: unknown): unknown {
  if (result && typeof result === 'object' && 'conversation' in result) {
    const conv = (result as { conversation?: unknown }).conversation;
    if (conv && typeof conv === 'object') {
      return mapLegacyConversationToDomain(conv as Parameters<typeof mapLegacyConversationToDomain>[0]);
    }
  }
  return result;
}
