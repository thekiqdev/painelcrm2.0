import type { QueryClient } from '@tanstack/react-query';
import type { ChatConversation } from '@/services/chat';

function isConversationLike(value: unknown): value is ChatConversation {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as { id?: unknown }).id === 'string',
  );
}

function pickNewest(a: ChatConversation | null, b: ChatConversation | null): ChatConversation | null {
  if (!a) return b;
  if (!b) return a;
  const at = a.updated_at ? Date.parse(a.updated_at) : 0;
  const bt = b.updated_at ? Date.parse(b.updated_at) : 0;
  return bt >= at ? b : a;
}

export function getCachedFloatingConversationById(
  queryClient: QueryClient,
  conversationId: string,
): ChatConversation | null {
  let best: ChatConversation | null = null;

  const direct = queryClient.getQueryData<ChatConversation | null>([
    'floating-chat',
    'conversation-meta',
    conversationId,
  ]);
  if (direct && isConversationLike(direct) && direct.id === conversationId) {
    best = pickNewest(best, direct);
  }

  const conversationLists = queryClient.getQueriesData<ChatConversation[]>({
    queryKey: ['floating-chat', 'conversations'],
  });
  for (const [, rows] of conversationLists) {
    if (!Array.isArray(rows)) continue;
    const hit = rows.find((row) => row?.id === conversationId) ?? null;
    if (hit) best = pickNewest(best, hit);
  }

  const minimizedMetaMaps = queryClient.getQueriesData<Record<string, ChatConversation | null>>({
    queryKey: ['floating-chat', 'minimized-meta'],
  });
  for (const [, map] of minimizedMetaMaps) {
    if (!map || typeof map !== 'object') continue;
    const hit = map[conversationId];
    if (hit && isConversationLike(hit)) best = pickNewest(best, hit);
  }

  return best;
}
