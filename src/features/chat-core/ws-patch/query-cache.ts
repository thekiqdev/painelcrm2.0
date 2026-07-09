/**
 * Helpers de patch no cache React Query do Floating Chat (F2).
 * Usa setQueryData — não altera configuração global do React Query.
 */

import type { QueryClient } from '@tanstack/react-query';
import type { ChatConversation, ChatMessage } from '@/services/chat';
import { mergeChatConversationRealtimePatch, sortConversationsByRecent } from './conversation-merge';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function pickConversationId(raw: unknown): string | null {
  const r = asRecord(raw);
  const id =
    r.conversation_id ?? r.conversationId ?? r.id ?? asRecord(r.conversation).id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

export function patchFloatingChatMessages(
  queryClient: QueryClient,
  conversationId: string,
  updater: (prev: ChatMessage[]) => ChatMessage[],
): boolean {
  const key = ['floating-chat', 'messages', conversationId] as const;
  if (!queryClient.getQueryCache().find({ queryKey: key })) return false;
  queryClient.setQueryData<ChatMessage[]>(key, (old) => updater(old ?? []));
  return true;
}

function patchConversationRow(
  prev: ChatConversation,
  incoming: ChatConversation,
): ChatConversation {
  const merged = mergeChatConversationRealtimePatch(prev, incoming);
  return {
    ...merged,
    lastMessageAt: incoming.lastMessageAt ?? prev.lastMessageAt ?? null,
    lastMessagePreview: incoming.lastMessagePreview ?? prev.lastMessagePreview ?? null,
    unreadCount:
      typeof incoming.unreadCount === 'number' ? incoming.unreadCount : prev.unreadCount,
  };
}

export function patchFloatingChatConversationMeta(
  queryClient: QueryClient,
  conversationId: string,
  incoming: ChatConversation,
): boolean {
  const key = ['floating-chat', 'conversation-meta', conversationId] as const;
  let touched = false;
  queryClient.setQueryData<ChatConversation | null>(key, (prev) => {
    if (!prev) return prev;
    touched = true;
    return patchConversationRow(prev, incoming);
  });
  return touched;
}

export function patchAllFloatingConversationLists(
  queryClient: QueryClient,
  conversationId: string,
  buildIncoming: (prev: ChatConversation | undefined) => ChatConversation | null,
): boolean {
  let touched = false;
  const lists = queryClient.getQueriesData<ChatConversation[]>({
    queryKey: ['floating-chat', 'conversations'],
  });
  for (const [queryKey, rows] of lists) {
    if (!Array.isArray(rows)) continue;
    const idx = rows.findIndex((r) => r?.id === conversationId);
    const incoming = buildIncoming(idx >= 0 ? rows[idx] : undefined);
    if (!incoming) continue;
    queryClient.setQueryData<ChatConversation[]>(queryKey, (old) => {
      const base = old ?? [];
      const i = base.findIndex((r) => r.id === conversationId);
      if (i < 0) {
        touched = true;
        return sortConversationsByRecent([incoming, ...base]);
      }
      const next = [...base];
      next[i] = patchConversationRow(base[i], incoming);
      touched = true;
      return sortConversationsByRecent(next);
    });
  }

  const bubbleLists = queryClient.getQueriesData<ChatConversation[]>({
    queryKey: ['floating-chat', 'bubble-recent'],
  });
  for (const [queryKey, rows] of bubbleLists) {
    if (!Array.isArray(rows)) continue;
    const idx = rows.findIndex((r) => r?.id === conversationId);
    const incoming = buildIncoming(idx >= 0 ? rows[idx] : undefined);
    if (!incoming) continue;
    queryClient.setQueryData<ChatConversation[]>(queryKey, (old) => {
      const base = old ?? [];
      const i = base.findIndex((r) => r.id === conversationId);
      if (i < 0) {
        touched = true;
        return sortConversationsByRecent([incoming, ...base]).slice(0, base.length || 8);
      }
      const next = [...base];
      next[i] = patchConversationRow(base[i], incoming);
      touched = true;
      return sortConversationsByRecent(next);
    });
  }

  return touched;
}

export function patchFloatingChatMinimizedMeta(
  queryClient: QueryClient,
  conversationId: string,
  incoming: ChatConversation,
): boolean {
  let touched = false;
  const maps = queryClient.getQueriesData<Record<string, ChatConversation | null>>({
    queryKey: ['floating-chat', 'minimized-meta'],
  });
  for (const [queryKey, map] of maps) {
    if (!map || typeof map !== 'object' || !(conversationId in map)) continue;
    const prev = map[conversationId];
    if (!prev) continue;
    queryClient.setQueryData<Record<string, ChatConversation | null>>(queryKey, (old) => {
      if (!old) return old;
      touched = true;
      return {
        ...old,
        [conversationId]: patchConversationRow(prev, incoming),
      };
    });
  }
  return touched;
}

export function removeConversationFromFloatingCaches(
  queryClient: QueryClient,
  conversationId: string,
): boolean {
  let touched = false;

  const lists = queryClient.getQueriesData<ChatConversation[]>({
    queryKey: ['floating-chat', 'conversations'],
  });
  for (const [queryKey, rows] of lists) {
    if (!Array.isArray(rows) || !rows.some((r) => r.id === conversationId)) continue;
    queryClient.setQueryData<ChatConversation[]>(queryKey, (old) =>
      (old ?? []).filter((r) => r.id !== conversationId),
    );
    touched = true;
  }

  const bubbleLists = queryClient.getQueriesData<ChatConversation[]>({
    queryKey: ['floating-chat', 'bubble-recent'],
  });
  for (const [queryKey, rows] of bubbleLists) {
    if (!Array.isArray(rows) || !rows.some((r) => r.id === conversationId)) continue;
    queryClient.setQueryData<ChatConversation[]>(queryKey, (old) =>
      (old ?? []).filter((r) => r.id !== conversationId),
    );
    touched = true;
  }

  const metaKey = ['floating-chat', 'conversation-meta', conversationId] as const;
  if (queryClient.getQueryCache().find({ queryKey: metaKey })) {
    queryClient.setQueryData(metaKey, null);
    touched = true;
  }

  const maps = queryClient.getQueriesData<Record<string, ChatConversation | null>>({
    queryKey: ['floating-chat', 'minimized-meta'],
  });
  for (const [queryKey, map] of maps) {
    if (!map || !(conversationId in map)) continue;
    queryClient.setQueryData<Record<string, ChatConversation | null>>(queryKey, (old) => {
      if (!old) return old;
      const next = { ...old };
      delete next[conversationId];
      return next;
    });
    touched = true;
  }

  const messagesKey = ['floating-chat', 'messages', conversationId] as const;
  if (queryClient.getQueryCache().find({ queryKey: messagesKey })) {
    queryClient.removeQueries({ queryKey: messagesKey });
    touched = true;
  }

  return touched;
}

export function conversationExistsInFloatingCaches(
  queryClient: QueryClient,
  conversationId: string,
): boolean {
  const meta = queryClient.getQueryData<ChatConversation | null>([
    'floating-chat',
    'conversation-meta',
    conversationId,
  ]);
  if (meta?.id === conversationId) return true;

  const lists = queryClient.getQueriesData<ChatConversation[]>({
    queryKey: ['floating-chat', 'conversations'],
  });
  for (const [, rows] of lists) {
    if (Array.isArray(rows) && rows.some((r) => r.id === conversationId)) return true;
  }
  return false;
}
