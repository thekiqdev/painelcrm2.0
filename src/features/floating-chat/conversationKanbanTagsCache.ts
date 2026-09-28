import type { QueryClient } from '@tanstack/react-query';
import type { ChatConversation, ChatKanbanTagUi } from '@/services/chat';

/** Sincroniza tags (e metadata.kanban_tags) em caches do floating chat após add/remove. */
export function patchConversationKanbanTagsEverywhere(
  queryClient: QueryClient,
  conversationId: string,
  tags: ChatKanbanTagUi[],
): void {
  const kanban_tags = tags.map((t) => ({ id: t.id, label: t.label, color: t.color }));

  queryClient.setQueryData<ChatConversation | null>(['floating-chat', 'conversation-meta', conversationId], (prev) => {
    if (!prev) return prev;
    return {
      ...prev,
      tags,
      metadata: {
        ...((prev.metadata && typeof prev.metadata === 'object' ? prev.metadata : {}) as Record<string, unknown>),
        kanban_tags,
      },
    };
  });

  const conversationLists = queryClient.getQueriesData<ChatConversation[]>({
    queryKey: ['floating-chat', 'conversations'],
  });
  for (const [key, rows] of conversationLists) {
    if (!Array.isArray(rows)) continue;
    queryClient.setQueryData<ChatConversation[]>(
      key,
      rows.map((row) =>
        row?.id === conversationId
          ? {
              ...row,
              tags,
              metadata: {
                ...((row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<string, unknown>),
                kanban_tags,
              },
            }
          : row,
      ),
    );
  }

  const minimizedMetaMaps = queryClient.getQueriesData<Record<string, ChatConversation | null>>({
    queryKey: ['floating-chat', 'minimized-meta'],
  });
  for (const [key, map] of minimizedMetaMaps) {
    if (!map || typeof map !== 'object') continue;
    const prevRow = map[conversationId];
    if (!prevRow) continue;
    queryClient.setQueryData<Record<string, ChatConversation | null>>(key, {
      ...map,
      [conversationId]: {
        ...prevRow,
        tags,
        metadata: {
          ...((prevRow.metadata && typeof prevRow.metadata === 'object'
            ? prevRow.metadata
            : {}) as Record<string, unknown>),
          kanban_tags,
        },
      },
    });
  }
}
