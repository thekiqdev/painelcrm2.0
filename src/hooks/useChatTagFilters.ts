import { useCallback, useMemo, useState } from 'react';
import {
  resolveChatKanbanTagsForUi,
  type ChatConversation,
  type ChatKanbanTagUi,
} from '@/services/chat';

export type ChatSidebarTagFilterState = {
  tagId: string | null;
};

export type UseChatTagFiltersOptions = {
  conversations: ChatConversation[];
  catalogTags: ChatKanbanTagUi[];
};

export type UseChatTagFiltersResult = {
  selectedTagId: string | null;
  setSelectedTagId: (tagId: string | null) => void;
  tagCounts: ReadonlyMap<string, number>;
  filterConversationsByTag: (list: ChatConversation[]) => ChatConversation[];
  clearTagFilter: () => void;
  sidebarFilterState: ChatSidebarTagFilterState;
};

function conversationHasTag(conversation: ChatConversation, tagId: string): boolean {
  return resolveChatKanbanTagsForUi(conversation).some((t) => t.id === tagId);
}

export function useChatTagFilters({
  conversations,
  catalogTags,
}: UseChatTagFiltersOptions): UseChatTagFiltersResult {
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tag of catalogTags) {
      counts.set(tag.id, 0);
    }
    for (const conv of conversations) {
      const seen = new Set<string>();
      for (const t of resolveChatKanbanTagsForUi(conv)) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        counts.set(t.id, (counts.get(t.id) ?? 0) + 1);
      }
    }
    return counts;
  }, [conversations, catalogTags]);

  const filterConversationsByTag = useCallback(
    (list: ChatConversation[]) => {
      if (!selectedTagId) return list;
      return list.filter((c) => conversationHasTag(c, selectedTagId));
    },
    [selectedTagId],
  );

  const clearTagFilter = useCallback(() => {
    setSelectedTagId(null);
  }, []);

  const sidebarFilterState = useMemo(
    (): ChatSidebarTagFilterState => ({ tagId: selectedTagId }),
    [selectedTagId],
  );

  return {
    selectedTagId,
    setSelectedTagId,
    tagCounts,
    filterConversationsByTag,
    clearTagFilter,
    sidebarFilterState,
  };
}
