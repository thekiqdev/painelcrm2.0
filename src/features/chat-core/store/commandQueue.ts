/**
 * F5.5 — fila interna de commands pendentes.
 */

import type { ChatCommandName } from './commandState';
import type { ChatConversationId } from '../domain/types';

type QueueEntry = {
  token: string;
  command: ChatCommandName;
  conversationId?: ChatConversationId;
  enqueuedAt: number;
};

const globalQueue: QueueEntry[] = [];
const perConversationQueues = new Map<string, QueueEntry[]>();

export function enqueueCommand(entry: QueueEntry): void {
  globalQueue.push(entry);
  if (entry.conversationId) {
    const list = perConversationQueues.get(entry.conversationId) ?? [];
    list.push(entry);
    perConversationQueues.set(entry.conversationId, list);
  }
}

export function dequeueCommand(token: string): void {
  const idx = globalQueue.findIndex((e) => e.token === token);
  if (idx >= 0) globalQueue.splice(idx, 1);
  for (const [cid, list] of perConversationQueues.entries()) {
    const i = list.findIndex((e) => e.token === token);
    if (i >= 0) {
      list.splice(i, 1);
      if (list.length === 0) perConversationQueues.delete(cid);
      else perConversationQueues.set(cid, list);
      break;
    }
  }
}

export function getPendingCommandCount(conversationId?: string): number {
  if (conversationId) return perConversationQueues.get(conversationId)?.length ?? 0;
  return globalQueue.length;
}

export function getGlobalCommandQueue(): readonly QueueEntry[] {
  return globalQueue;
}

export function resetCommandQueueForTests(): void {
  globalQueue.length = 0;
  perConversationQueues.clear();
}

export function createCommandToken(): string {
  return `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
