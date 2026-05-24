import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ExternalLink, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { resolveChatKanbanTagsForUi, type ChatConversation } from '@/services/chat';
import { fetchMergedChatConversations } from '@/lib/chatConversationsFetch';
import {
  FLOATING_CHAT_LIST_STALE_MS,
  floatingChatConversationsQueryKey,
} from './floatingChatQueries';
import { resolveConversationIdentity } from '@/utils/chatIdentityDisplay';
import { cn } from '@/lib/utils';
import { beginConversationDragSession, endConversationDragSession } from '@/lib/chatKanbanConversationDrag';
import {
  applyConversationDragPreview,
  conversationDragPreviewFromChatConversation,
} from '@/lib/conversationDragPreview';
import { useFloatingChat } from './floatingChatContext';
import { FLOATING_LIST_WIDTH_PX } from './constants';
import { ChatKanbanTagBadge } from '@/components/chat/ChatKanbanTagBadge';

type QuickFilter = 'all' | 'mine' | 'unread';

function previewLine(c: ChatConversation): string {
  const p = c.lastMessagePreview?.trim();
  if (p) return p.length > 72 ? `${p.slice(0, 72)}…` : p;
  return 'Sem mensagens recentes';
}

const scrollbarNone =
  '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden';

export function FloatingConversationList({ className }: { className?: string }) {
  const navigate = useNavigate();
  const { instanceIds, inboxScope, openOrFocusConversation, listOpen } = useFloatingChat();
  const [search, setSearch] = useState('');
  const [quick, setQuick] = useState<QuickFilter>('all');

  const { data: conversations = [], isLoading, isFetching } = useQuery({
    queryKey: floatingChatConversationsQueryKey(instanceIds, inboxScope, quick),
    /** Lista só quando o painel está aberto; cache pré-aquecido no provider. */
    enabled: listOpen && instanceIds.length > 0,
    queryFn: () =>
      fetchMergedChatConversations({
        instanceIds,
        inboxScope,
        quickFilter: quick,
      }),
    staleTime: FLOATING_CHAT_LIST_STALE_MS,
    placeholderData: (prev) => prev,
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

  return (
    <div
      className={cn(
        'floating-conversation-list flex min-h-0 flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950',
        className,
      )}
      style={{ width: FLOATING_LIST_WIDTH_PX }}
    >
      <div className="floating-conversation-list-header flex shrink-0 items-center justify-between gap-2 border-b border-neutral-200 bg-neutral-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-semibold text-foreground">
          Conversas
          {isFetching && conversations.length > 0 ? (
            <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">· atualizando</span>
          ) : null}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1 text-xs"
          draggable={false}
          onClick={() => navigate('/chat')}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Central completa
        </Button>
      </div>
      <div className="floating-conversation-list-filters shrink-0 border-b border-neutral-200 bg-neutral-50 px-3 py-1.5 dark:border-slate-800 dark:bg-slate-900">
        <Tabs value={quick} onValueChange={(v) => setQuick(v as QuickFilter)}>
          <TabsList className="grid h-8 w-full grid-cols-3 bg-muted/60">
            <TabsTrigger value="all" className="px-1 text-[11px]">
              Todas
            </TabsTrigger>
            <TabsTrigger value="mine" className="px-1 text-[11px]">
              Minhas
            </TabsTrigger>
            <TabsTrigger value="unread" className="px-1 text-[11px]">
              Não lidas
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="floating-conversation-list-search shrink-0 bg-neutral-50 px-3 pb-2 pt-1 dark:bg-slate-900">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar…"
            draggable={false}
            className="h-8 border-neutral-200 bg-white pl-8 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
        </div>
      </div>
      <div
        className={cn(
          'floating-conversation-list-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white dark:bg-slate-950',
          scrollbarNone,
          'touch-pan-y',
        )}
      >
        <div className="px-2 pb-2 pt-0">
          {isLoading && conversations.length === 0 ? (
            <p className="px-2 py-5 text-center text-xs text-muted-foreground">Carregando…</p>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-5 text-center text-xs text-muted-foreground">Nenhuma conversa.</p>
          ) : (
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
          )}
        </div>
      </div>
    </div>
  );
}
