/**
 * F5.5 — confirmação de commands após sucesso HTTP.
 */

import type { ChatCommandName } from './commandState';
import { syncStoreFromCommandResult } from './integration';
import { getChatDomainStoreSession } from './session';
import { dequeueCommand } from './commandQueue';
import { recordCommandConfirmLatency } from './commandMetrics';
import { chatDomainActionCreators } from './actions';
import { toDomainMessage } from './repositorySync';
import { recordStoreEventApplied } from './metrics';

export function confirmCommand(token: string, command: ChatCommandName, result: unknown): void {
  const store = getChatDomainStoreSession();
  if (!store) return;
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const entry = store.getState().commands.rollbackStack.find((e) => e.id === token);

  if (
    command === 'sendMessage' &&
    entry?.snapshot.conversationId &&
    entry.snapshot.optimisticMessageId
  ) {
    const conversationId = entry.snapshot.conversationId;
    const optimisticId = entry.snapshot.optimisticMessageId;
    const message = toDomainMessage(result);
    if (message.id && message.conversationId) {
      if (store.getState().messages.byId[optimisticId]) {
        store.dispatch(chatDomainActionCreators.removeMessage(conversationId, optimisticId));
      }
      const currentIds = store.getState().messages.byConversationId[conversationId] ?? [];
      if (currentIds.includes(message.id)) {
        store.dispatch(
          chatDomainActionCreators.updateMessage(conversationId, message.id, {
            status: message.status ?? 'sent',
            body: message.body,
            sentAt: message.sentAt,
            raw: message.raw,
          }),
        );
      } else {
        store.dispatch(chatDomainActionCreators.appendMessage(conversationId, message));
      }
      recordStoreEventApplied('command');
    } else {
      syncStoreFromCommandResult(command, result);
    }
  } else {
    syncStoreFromCommandResult(command, result);
  }

  store.dispatch({ type: 'commands/confirm', token });
  dequeueCommand(token);
  recordCommandConfirmLatency(
    Math.max(0, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0)),
  );
}
