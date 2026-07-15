import { chatService, type ChatConversation } from '@/services/chat';

export type ChatInboxScope = 'tenant' | 'owner';

export type FetchMergedConversationsParams = {
  instanceIds: string[];
  inboxScope: ChatInboxScope;
  /** Filtro rápido do float: unread só no cliente após merge. */
  quickFilter?: 'all' | 'mine' | 'unread';
  attendanceFilter?: 'mine' | 'queue' | 'team' | 'closed' | 'wa_archived' | '';
  channelOrigin?: 'all' | 'uazapi' | 'official';
  conversationFilter?: 'groups';
  includeOfficialWhenAll?: boolean;
};

function sortConversationsByRecent(list: ChatConversation[]): ChatConversation[] {
  return [...list].sort((a, b) => {
    const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    if (ta && tb) return tb - ta;
    if (ta && !tb) return -1;
    if (!ta && tb) return 1;
    const ca = a.created_at ? new Date(a.created_at).getTime() : 0;
    const cb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return cb - ca;
  });
}

/** Agrega conversas de várias instâncias + oficial (dedupe por id). */
export async function fetchMergedChatConversations(
  params: FetchMergedConversationsParams,
): Promise<ChatConversation[]> {
  const {
    instanceIds,
    inboxScope,
    quickFilter = 'all',
    attendanceFilter,
    channelOrigin,
    conversationFilter,
    includeOfficialWhenAll = true,
  } = params;

  const attendance =
    attendanceFilter === 'mine' || quickFilter === 'mine' ? ('mine' as const) : attendanceFilter || undefined;

  const base: Parameters<typeof chatService.getConversations>[0] = {
    inboxScope,
    attendanceFilter: attendance,
  };
  if (channelOrigin && channelOrigin !== 'all') {
    base.channelOrigin = channelOrigin;
  }
  if (conversationFilter === 'groups') {
    base.conversationFilter = 'groups';
  }

  const merged: ChatConversation[] = [];

  if (channelOrigin === 'official') {
    try {
      const data = await chatService.getConversations({
        ...base,
        includeWhatsAppOfficial: true,
        channelOrigin: 'official',
      });
      merged.push(...data);
    } catch {
      /* ignore */
    }
  } else {
    for (const instanceId of instanceIds) {
      try {
        const rows = await chatService.getConversations({ instanceId, ...base });
        merged.push(...rows);
      } catch {
        /* ignora instância */
      }
    }
    if (
      includeOfficialWhenAll &&
      (!channelOrigin || channelOrigin === 'all')
    ) {
      try {
        const officialRows = await chatService.getConversations({
          ...base,
          includeWhatsAppOfficial: true,
          channelOrigin: 'official',
        });
        merged.push(...officialRows);
      } catch {
        /* ignore */
      }
    }
  }

  const byId = new Map<string, ChatConversation>();
  for (const c of merged) {
    if (!byId.has(c.id)) byId.set(c.id, c);
  }
  let list = sortConversationsByRecent(Array.from(byId.values()));
  if (quickFilter === 'unread') {
    list = list.filter((c) => (c.unreadCount ?? 0) > 0 && !c.wa_archived);
  }
  // Inbox isolation (MB-003/039): archived only when filter=wa_archived (groups included).
  if (attendanceFilter === 'wa_archived') {
    list = list.filter((c) => Boolean(c.wa_archived));
  } else {
    list = list.filter((c) => !c.wa_archived);
  }
  return list;
}

/** Pré-visualização do bubble (até 4 itens). */
export async function fetchBubbleRecentConversations(
  instanceIds: string[],
  inboxScope: ChatInboxScope,
): Promise<ChatConversation[]> {
  const list = await fetchMergedChatConversations({
    instanceIds,
    inboxScope,
    quickFilter: 'all',
  });
  return list.slice(0, 4);
}
