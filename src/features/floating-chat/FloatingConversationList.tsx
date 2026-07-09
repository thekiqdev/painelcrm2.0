import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { resolveChatKanbanTagsForUi, type ChatConversation } from '@/services/chat';
import { resolveConversationIdentity } from '@/utils/chatIdentityDisplay';
import { beginConversationDragSession, endConversationDragSession } from '@/lib/chatKanbanConversationDrag';
import {
  applyConversationDragPreview,
  conversationDragPreviewFromChatConversation,
} from '@/lib/conversationDragPreview';
import { useFloatingChat } from './floatingChatContext';
import { ChatKanbanTagBadge } from '@/components/chat/ChatKanbanTagBadge';
import { ConversationListSkeleton } from '@/components/chat/skeletons/ConversationListSkeleton';
import { FloatingChatListShell } from '@/components/chat/FloatingChatListShell';
import { useFloatingConversationListData } from '@/features/chat-core/store/public';

type QuickFilter = 'all' | 'mine' | 'unread';

function previewLine(c: ChatConversation): string {
  const p = c.lastMessagePreview?.trim();
  if (p) return p.length > 72 ? `${p.slice(0, 72)}…` : p;
  return 'Sem mensagens recentes';
}

export function FloatingConversationList({ className }: { className?: string }) {
  const navigate = useNavigate();
  const { instanceIds, inboxScope, openOrFocusConversation, listOpen } = useFloatingChat();
  const [search, setSearch] = useState('');
  const [quick, setQuick] = useState<QuickFilter>('all');

  const { conversations, isLoading, isFetching } = useFloatingConversationListData({
    instanceIds,
    inboxScope,
    quick,
    listOpen,
  });

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return conversations;
    return conversations.filter((c) => {
      const id = resolveConversationIdentity(c, null, null);
      return (
        id.displayName.toLowerCase().includes(t) ||
        (c.phoneNumber || '').toLowerCase().includes(t) ||
        id.phoneLine.toLowerCase().includes(t)
      );
    });
  }, [conversations, search]);

  let listBody: ReactNode;
  if (isLoading && conversations.length === 0) {
    listBody = <ConversationListSkeleton rows={6} className="px-0.5" />;
  } else if (filtered.length === 0) {
    listBody = <p className="px-2 py-5 text-center text-xs text-muted-foreground">Nenhuma conversa.</p>;
  } else {
    listBody = (
      <ul className="space-y-0">
        {filtered.map((c) => {
          const id = resolveConversationIdentity(c, null, null);
          const unread = c.unreadCount ?? 0;
          const tagUi = resolveChatKanbanTagsForUi(c);
          const tagVisible = tagUi.slice(0, 3);
          const tagMore = tagUi.length - tagVisible.length;
          return (
            <li key={c.id}>
              <button
                type="button"
                draggable
                className="flex w-full cursor-grab items-start gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-neutral-100 active:cursor-grabbing dark:hover:bg-slate-800"
                title="Arrastar para o Kanban"
                onDragStart={(e) => {
                  beginConversationDragSession(e.dataTransfer, {
                    type: 'conversation',
                    conversationId: c.id,
                    hasClient: Boolean(c.client_id),
                    hasLead: Boolean(c.leadId),
                  });
                  applyConversationDragPreview(
                    e,
                    conversationDragPreviewFromChatConversation(c, c.id),
                  );
                }}
                onDragEnd={() => endConversationDragSession()}
                onClick={() => openOrFocusConversation(c.id)}
              >
                <Avatar className="h-9 w-9 shrink-0 border border-border/50">
                  {id.avatarUrl ? (
                    <AvatarImage src={id.avatarUrl} alt="" className="object-cover" />
                  ) : null}
                  <AvatarFallback className="bg-primary/15 text-[10px] font-medium text-primary">
                    {id.initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="truncate text-[13px] font-medium leading-tight">{id.displayName}</span>
                    {unread > 0 ? (
                      <Badge
                        variant="secondary"
                        className="h-4 min-w-[1rem] justify-center px-1 text-[9px] tabular-nums"
                      >
                        {unread > 99 ? '99+' : unread}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                    {previewLine(c)}
                  </p>
                  {tagVisible.length > 0 ? (
                    <div className="mt-0.5 flex max-w-full flex-wrap items-center gap-1">
                      {tagVisible.map((t) => (
                        <ChatKanbanTagBadge
                          key={t.id}
                          label={t.label}
                          color={t.color}
                          className="max-w-[44%]"
                        />
                      ))}
                      {tagMore > 0 ? (
                        <span className="shrink-0 text-[10px] font-medium tabular-nums text-muted-foreground">
                          +{tagMore}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  <p className="mt-0.5 text-[10px] text-muted-foreground/90">
                    {c.lastMessageAt
                      ? formatDistanceToNow(new Date(c.lastMessageAt), {
                          addSuffix: true,
                          locale: ptBR,
                        })
                      : 'Sem mensagens recentes'}
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <FloatingChatListShell
      className={className}
      quick={quick}
      onQuickChange={setQuick}
      search={search}
      onSearchChange={setSearch}
      onOpenFullChat={() => navigate('/chat')}
      isFetching={isFetching}
      hasCachedRows={conversations.length > 0}
    >
      {listBody}
    </FloatingChatListShell>
  );
}
