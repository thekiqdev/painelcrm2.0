import { useCallback, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { chatService, type ChatConversation } from '@/services/chat';
import {
  isChatAggregatedSurfaceEnabled,
} from '@/lib/chatAggregatedFlags';
import { listChatConversations } from '@/repositories/chatConversationsRepository';
import { resolveConversationIdentity } from '@/utils/chatIdentityDisplay';
import { cn } from '@/lib/utils';
import { useFloatingChat } from './floatingChatContext';
import { FLOATING_Z_MINIMIZED } from './constants';
import { beginConversationDragSession, endConversationDragSession } from '@/lib/chatKanbanConversationDrag';
import {
  applyConversationDragPreview,
  conversationDragPreviewFromChatConversation,
} from '@/lib/conversationDragPreview';
import { getCachedFloatingConversationById } from './queryCache';
import { shouldUseChatDomainStore } from '@/features/chat-core/store/flags';
import { getChatDomainStoreSession } from '@/features/chat-core/store/session';
import { EMPTY_CHAT_DOMAIN_STATE } from '@/features/chat-core/store/state';
import { selectCurrentConversation } from '@/features/chat-core/store/chatSelectors';

function shortName(displayName: string): string {
  const first = displayName.split(/\s+/)[0]?.trim();
  if (!first) return 'Chat';
  return first.length > 14 ? `${first.slice(0, 13)}…` : first;
}

const dockBottom =
  'calc(var(--floating-chat-bottom) + env(safe-area-inset-bottom, 0px))';

export function MinimizedChatDock({
  dockRightPx,
  onDockWidthChange,
}: {
  /** CSS `right` em px (do layout engine). */
  dockRightPx: number;
  onDockWidthChange?: (widthPx: number) => void;
}) {
  const { panels, expandPanel, closeFloatingConversation, instanceIds, inboxScope, pulseUntil } =
    useFloatingChat();
  const queryClient = useQueryClient();
  const minimized = panels.filter((p) => p.minimized);
  const shellRef = useRef<HTMLDivElement>(null);
  const minimizedIdsKey = minimized.map((p) => p.conversationId).join(',');

  useLayoutEffect(() => {
    if (!onDockWidthChange) return;
    if (minimized.length === 0) {
      onDockWidthChange(0);
      return;
    }
    const el = shellRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      onDockWidthChange(el.offsetWidth);
    });
    ro.observe(el);
    onDockWidthChange(el.offsetWidth);
    return () => ro.disconnect();
  }, [minimized.length, minimizedIdsKey, onDockWidthChange]);

  const idsKey = minimizedIdsKey;
  const useStore = shouldUseChatDomainStore();

  const subscribeStore = useCallback((onChange: () => void) => {
    const store = getChatDomainStoreSession();
    if (!store) return () => undefined;
    return store.subscribe(() => onChange());
  }, []);
  const getStoreSnapshot = useCallback(
    () => getChatDomainStoreSession()?.getState() ?? EMPTY_CHAT_DOMAIN_STATE,
    [],
  );
  const storeState = useSyncExternalStore(subscribeStore, getStoreSnapshot, getStoreSnapshot);

  const storeMetas = useMemo(() => {
    if (!useStore || minimized.length === 0) return {} as Record<string, ChatConversation | null>;
    const out: Record<string, ChatConversation | null> = {};
    for (const p of minimized) {
      out[p.conversationId] = selectCurrentConversation(storeState, p.conversationId);
    }
    return out;
  }, [useStore, minimized, storeState]);

  const { data: rqMetas = {} } = useQuery({
    queryKey: ['floating-chat', 'minimized-meta', idsKey, instanceIds.join(','), inboxScope],
    enabled: !useStore && minimized.length > 0,
    queryFn: async (): Promise<Record<string, ChatConversation | null>> => {
      const out: Record<string, ChatConversation | null> = {};
      for (const p of minimized) {
        out[p.conversationId] = getCachedFloatingConversationById(queryClient, p.conversationId);
      }
      const missingIds = minimized
        .map((p) => p.conversationId)
        .filter((id) => !out[id]);
      if (missingIds.length === 0) return out;

      if (isChatAggregatedSurfaceEnabled('float') && instanceIds.length > 0) {
        // TF6 — no máximo 2 GETs agregados (50 → 200); sem loop por instanceId.
        for (const limit of [50, 200] as const) {
          try {
            const { items } = await listChatConversations({
              surface: 'float',
              instanceIds,
              inboxScope,
              quickFilter: 'all',
              limit,
            });
            for (const conversationId of missingIds) {
              if (out[conversationId]) continue;
              const hit = items.find((r) => r.id === conversationId);
              if (hit) out[conversationId] = hit;
            }
            const still = missingIds.filter((id) => !out[id]);
            if (still.length === 0) return out;
          } catch {
            break;
          }
        }
        return out;
      }

      const stillAfterAgg = missingIds.filter((id) => !out[id]);
      if (stillAfterAgg.length === 0) return out;

      for (const instanceId of instanceIds) {
        const rows = await chatService.getConversations({ instanceId, inboxScope });
        for (const conversationId of stillAfterAgg) {
          if (out[conversationId]) continue;
          const hit = rows.find((r) => r.id === conversationId);
          if (hit) out[conversationId] = hit;
        }
      }
      const stillMissing = minimized.filter((p) => !out[p.conversationId]);
      if (stillMissing.length > 0) {
        try {
          const broad = await chatService.getConversations({ inboxScope });
          for (const p of stillMissing) {
            const hit = broad.find((r) => r.id === p.conversationId);
            if (hit) out[p.conversationId] = hit;
          }
        } catch {
          /* ignore */
        }
      }
      return out;
    },
    staleTime: 20_000,
    placeholderData: () => {
      const out: Record<string, ChatConversation | null> = {};
      for (const p of minimized) {
        out[p.conversationId] = getCachedFloatingConversationById(queryClient, p.conversationId);
      }
      return out;
    },
  });

  const metas = useStore ? storeMetas : rqMetas;

  if (minimized.length === 0) return null;

  const now = Date.now();

  return (
    <div
      ref={shellRef}
      className="pointer-events-auto fixed flex max-w-[calc(100vw-6rem)] flex-row-reverse flex-wrap items-end justify-start gap-2"
      style={{
        zIndex: FLOATING_Z_MINIMIZED,
        bottom: dockBottom,
        right: `calc(${dockRightPx}px + env(safe-area-inset-right, 0px))`,
      }}
    >
      {minimized.map((p) => {
        const c = metas[p.conversationId];
        const id = c
          ? resolveConversationIdentity(c, null, null)
          : resolveConversationIdentity({ id: p.conversationId } as ChatConversation, null, null);
        const unread = c?.unreadCount ?? 0;
        const pulsing = (pulseUntil[p.conversationId] ?? 0) > now;
        return (
          <div
            key={p.conversationId}
            draggable
            title="Arrastar para o Kanban"
            className={cn(
              'group relative flex max-w-[11rem] cursor-grab items-stretch rounded-full border shadow-md transition active:cursor-grabbing',
              'border-primary/25 bg-background/95 hover:border-primary/40 hover:bg-muted/90 hover:shadow-lg',
              'dark:border-border/80 dark:bg-background/95',
              pulsing && 'floating-chat-minimized-pulse border-primary/50 ring-2 ring-primary/25',
            )}
            onDragStart={(e) => {
              const conv = c;
              beginConversationDragSession(e.dataTransfer, {
                type: 'conversation',
                conversationId: p.conversationId,
                hasClient: Boolean(conv?.client_id),
                hasLead: Boolean(conv?.leadId),
              });
              applyConversationDragPreview(
                e,
                conversationDragPreviewFromChatConversation(conv ?? null, p.conversationId),
              );
            }}
            onDragEnd={() => endConversationDragSession()}
          >
            <button
              type="button"
              draggable={false}
              title={id.displayName}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-full py-1 pl-1 pr-2.5 text-left"
              onClick={() => expandPanel(p.conversationId)}
            >
              <Avatar className="h-8 w-8 shrink-0 ring-2 ring-background">
                {id.avatarUrl ? (
                  <AvatarImage src={id.avatarUrl} alt="" className="object-cover" />
                ) : null}
                <AvatarFallback className="text-[9px] font-medium">{id.initials}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 truncate text-xs font-semibold text-foreground">
                {shortName(id.displayName)}
              </span>
              {unread > 0 ? (
                <Badge
                  variant="destructive"
                  className="h-5 min-w-[1.125rem] justify-center px-1.5 text-[10px] font-semibold tabular-nums shadow-sm"
                >
                  {unread > 99 ? '99+' : unread}
                </Badge>
              ) : null}
            </button>
            <button
              type="button"
              draggable={false}
              className={cn(
                'absolute -right-0.5 -top-0.5 z-10 flex h-5 w-5 items-center justify-center rounded-full',
                'border border-border/80 bg-background/95 text-muted-foreground shadow-sm',
                'transition hover:bg-destructive/15 hover:text-destructive',
                'pointer-coarse:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100',
              )}
              title="Remover da barra"
              aria-label={`Remover conversa ${id.displayName} da barra`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                closeFloatingConversation(p.conversationId);
              }}
            >
              <X className="h-3 w-3" strokeWidth={2.5} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
