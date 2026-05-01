import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useChatOutboundQueue } from '@/hooks/useChatOutboundQueue';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ExternalLink, Minus, Send, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChatBubbleContent } from '@/components/chat/ChatBubbleContent';
import { MessageStatusIndicator } from '@/components/chat/MessageStatusIndicator';
import { chatService, type ChatConversation, type ChatMessage } from '@/services/chat';
import { REALTIME_WINDOW_EVENTS } from '@/services/realtimeClient';
import { cn } from '@/lib/utils';
import { useFloatingChat } from './floatingChatContext';
import { useFloatingConversationIdentity } from './useFloatingConversationIdentity';
import { FLOATING_WINDOW_WIDTH_PX, FLOATING_Z_WINDOWS } from './constants';
import { floatingAttendanceLabel } from './attendanceUi';
import { Badge } from '@/components/ui/badge';
import { beginConversationDragSession, endConversationDragSession } from '@/lib/chatKanbanConversationDrag';
import {
  applyConversationDragPreview,
  conversationDragPreviewFromChatConversation,
} from '@/lib/conversationDragPreview';

const FLOATING_Z_WINDOW_ACTIVE = 49;

function formatHour(d: string | Date | undefined): string {
  if (!d) return '';
  try {
    return format(new Date(d), 'HH:mm');
  } catch {
    return '';
  }
}

export function FloatingConversationWindow({
  conversationId,
  rightPx,
  isActive,
  onFocusWindow,
}: {
  conversationId: string;
  /** Distância da borda direita (px), do layout engine. */
  rightPx: number;
  isActive: boolean;
  onFocusWindow: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const floatingDraftRef = useRef('');
  const pendingWsFifoRef = useRef<string[]>([]);
  const {
    minimizePanel,
    closePanel,
    composerDrafts,
    setComposerDraft,
    instanceIds,
    inboxScope,
  } = useFloatingChat();

  const messagesQueryKey = useMemo(
    () => ['floating-chat', 'messages', conversationId] as const,
    [conversationId],
  );

  const applyMessages = useCallback(
    (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      queryClient.setQueryData<ChatMessage[]>(messagesQueryKey, (old) => updater(old ?? []));
    },
    [queryClient, messagesQueryKey],
  );

  const afterFloatingSend = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ['floating-chat', 'conversation-meta', conversationId],
    });
    void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'conversations'] });
  }, [queryClient, conversationId]);

  const { enqueueText, retryFailed } = useChatOutboundQueue({
    conversationId,
    applyMessages,
    pendingWsFifoRef,
    afterItemDone: afterFloatingSend,
  });

  const { data: conversation } = useQuery({
    queryKey: ['floating-chat', 'conversation-meta', conversationId, instanceIds.join(','), inboxScope],
    queryFn: async (): Promise<ChatConversation | null> => {
      for (const instanceId of instanceIds) {
        try {
          const rows = await chatService.getConversations({ instanceId, inboxScope });
          const hit = rows.find((r) => r.id === conversationId);
          if (hit) return hit;
        } catch {
          /* ignora instância */
        }
      }
      try {
        const rows = await chatService.getConversations({ inboxScope });
        return rows.find((r) => r.id === conversationId) ?? null;
      } catch {
        return null;
      }
    },
    staleTime: 20_000,
  });

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['floating-chat', 'messages', conversationId],
    queryFn: async () => {
      void chatService.syncConversationMessages(conversationId, {}).catch(() => {});
      return chatService.getConversationMessages(conversationId);
    },
    staleTime: 5_000,
  });

  useEffect(() => {
    const onMsg = (e: Event) => {
      const d = (e as CustomEvent<Record<string, unknown>>).detail;
      const cid = (d?.conversation_id as string) || (d?.conversationId as string);
      if (typeof cid !== 'string' || cid !== conversationId) return;
      void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'messages', conversationId] });
      void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'conversation-meta', conversationId] });
    };
    const onConv = (e: Event) => {
      const d = (e as CustomEvent<Record<string, unknown>>).detail;
      const cid = (d?.conversation_id as string) || (d?.conversationId as string);
      if (typeof cid === 'string' && cid !== conversationId) return;
      void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'messages', conversationId] });
      void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'conversation-meta', conversationId] });
      void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'conversations'] });
    };
    window.addEventListener(REALTIME_WINDOW_EVENTS.messageCreated, onMsg);
    window.addEventListener(REALTIME_WINDOW_EVENTS.conversationUpdated, onConv);
    return () => {
      window.removeEventListener(REALTIME_WINDOW_EVENTS.messageCreated, onMsg);
      window.removeEventListener(REALTIME_WINDOW_EVENTS.conversationUpdated, onConv);
    };
  }, [conversationId, queryClient]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length]);

  const identity = useFloatingConversationIdentity(conversationId, conversation);

  const draft = composerDrafts[conversationId] ?? '';

  useEffect(() => {
    floatingDraftRef.current = draft;
  }, [draft]);

  const submitFloating = useCallback(() => {
    const t = floatingDraftRef.current.trim();
    if (!t) return;
    floatingDraftRef.current = '';
    setComposerDraft(conversationId, '');
    enqueueText(t, null);
  }, [conversationId, setComposerDraft, enqueueText]);

  const rightCss = `calc(${rightPx}px + env(safe-area-inset-right, 0px))`;

  return (
    <div
      role="dialog"
      aria-label={`Chat: ${identity.displayName}`}
      className={cn(
        'floating-chat-window fixed flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-lg animate-in zoom-in-95 duration-200 dark:border-slate-800 dark:bg-slate-950',
      )}
      style={{
        zIndex: isActive ? FLOATING_Z_WINDOW_ACTIVE : FLOATING_Z_WINDOWS,
        width: FLOATING_WINDOW_WIDTH_PX,
        height: 'min(460px, calc(100dvh - 120px))',
        maxHeight: 'calc(100dvh - 120px)',
        bottom: 'calc(var(--floating-chat-bottom) + env(safe-area-inset-bottom, 0px))',
        right: rightCss,
      }}
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest('[data-floating-chat-skip-focus-mousedown]')) return;
        onFocusWindow();
      }}
    >
      <div
        data-floating-chat-skip-focus-mousedown
        className="floating-chat-window-header flex shrink-0 cursor-grab items-center gap-1.5 border-b border-neutral-200 bg-neutral-50 px-2 py-1.5 active:cursor-grabbing dark:border-slate-800 dark:bg-slate-900"
        draggable
        title="Arrastar conversa para o Kanban"
        onDragStart={(e) => {
          if (!conversation) {
            return;
          }
          beginConversationDragSession(e.dataTransfer, {
            type: 'conversation',
            conversationId,
            hasClient: Boolean(conversation.client_id),
            hasLead: Boolean(conversation.leadId),
          });
          applyConversationDragPreview(
            e,
            conversationDragPreviewFromChatConversation(conversation, conversationId),
          );
        }}
        onDragEnd={() => endConversationDragSession()}
      >
        <Avatar className="h-7 w-7 shrink-0 border border-border/50" draggable={false}>
          {identity.avatarUrl ? (
            <AvatarImage src={identity.avatarUrl} alt="" className="object-cover" />
          ) : null}
          <AvatarFallback className="bg-primary/15 text-[10px] font-medium text-primary">
            {identity.initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <p className="truncate text-[13px] font-semibold leading-tight">{identity.displayName}</p>
            {(() => {
              const att = floatingAttendanceLabel(conversation?.attendance_status);
              return att ? (
                <Badge variant="outline" className="h-4 shrink-0 px-1 py-0 text-[9px] font-normal">
                  {att}
                </Badge>
              ) : null;
            })()}
            {(conversation?.unreadCount ?? 0) > 0 ? (
              <Badge variant="secondary" className="h-4 shrink-0 px-1 py-0 text-[9px] tabular-nums">
                {(conversation?.unreadCount ?? 0) > 99 ? '99+' : conversation?.unreadCount}
              </Badge>
            ) : null}
          </div>
          {identity.phoneLine ? (
            <p className="truncate text-[10px] text-muted-foreground">{identity.phoneLine}</p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          draggable={false}
          title="Abrir na central"
          onClick={() => navigate(`/chat?conversationId=${encodeURIComponent(conversationId)}`)}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          draggable={false}
          title="Minimizar"
          onClick={() => minimizePanel(conversationId)}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          draggable={false}
          title="Fechar"
          onClick={() => closePanel(conversationId)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div
        ref={scrollRef}
        draggable
        title="Arrastar conversa para o Kanban"
        onDragStart={(e) => {
          beginConversationDragSession(e.dataTransfer, {
            type: 'conversation',
            conversationId,
            hasClient: Boolean(conversation?.client_id),
            hasLead: Boolean(conversation?.leadId),
          });
          applyConversationDragPreview(
            e,
            conversationDragPreviewFromChatConversation(conversation ?? null, conversationId),
          );
        }}
        onDragEnd={() => endConversationDragSession()}
        className={cn(
          'floating-chat-window-message-history min-h-0 flex-1 cursor-grab overflow-y-auto overscroll-contain bg-neutral-50 active:cursor-grabbing dark:bg-slate-900',
          '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
          'touch-pan-y [&_img]:max-h-[min(200px,38dvh)] [&_img]:w-auto [&_img]:max-w-full [&_img]:rounded-md [&_img]:object-contain',
        )}
      >
        <div className="space-y-1.5 px-2 py-1.5">
          {isLoading ? (
            <p className="py-8 text-center text-xs text-muted-foreground">Carregando mensagens…</p>
          ) : messages.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">Sem mensagens.</p>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                draggable={false}
                className={cn(
                  'flex w-full min-w-0',
                  message.direction === 'outgoing' ? 'justify-end' : 'justify-start',
                )}
              >
                <div
                  className={cn(
                    'w-fit max-w-[min(100%,17.5rem)] shrink-0 rounded-2xl px-2 py-1 text-[13px] leading-snug shadow-sm',
                    message.direction === 'outgoing'
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-neutral-200 bg-white text-foreground dark:border-slate-700 dark:bg-slate-800',
                  )}
                >
                  <ChatBubbleContent message={message} />
                  <span
                    className={cn(
                      'mt-0.5 flex items-center gap-1 text-[9px]',
                      message.direction === 'outgoing' ? 'text-primary-foreground/75' : 'text-muted-foreground',
                    )}
                  >
                    <span>{formatHour(message.sentAt)}</span>
                    {message.direction === 'outgoing' ? (
                      <>
                        <MessageStatusIndicator status={message.status} className="h-2.5 w-2.5" />
                        {message.status === 'failed' ? (
                          <button
                            type="button"
                            className="ml-0.5 text-[9px] font-semibold underline underline-offset-2"
                            onClick={() => retryFailed(message)}
                          >
                            Reenviar
                          </button>
                        ) : null}
                      </>
                    ) : null}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="floating-chat-window-composer shrink-0 border-t border-neutral-200 bg-white px-2 py-1.5 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-end gap-1.5">
          <Textarea
            draggable={false}
            value={draft}
            onChange={(e) => {
              const v = e.target.value;
              floatingDraftRef.current = v;
              setComposerDraft(conversationId, v);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!floatingDraftRef.current.trim()) return;
                submitFloating();
              }
            }}
            placeholder="Mensagem…"
            rows={2}
            className="min-h-[44px] flex-1 resize-none border-neutral-200 bg-white text-sm dark:border-slate-700 dark:bg-slate-950"
          />
          <Button
            type="button"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-xl"
            title="Enviar"
            aria-label="Enviar"
            draggable={false}
            disabled={!draft.trim()}
            onClick={() => submitFloating()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
