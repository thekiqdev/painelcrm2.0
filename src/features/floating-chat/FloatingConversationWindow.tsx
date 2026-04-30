import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ExternalLink, Minus, Send, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/components/ui/sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChatBubbleContent } from '@/components/chat/ChatBubbleContent';
import { chatService, type ChatConversation } from '@/services/chat';
import { REALTIME_WINDOW_EVENTS } from '@/services/realtimeClient';
import { resolveConversationIdentity } from '@/utils/chatIdentityDisplay';
import { cn } from '@/lib/utils';
import { useFloatingChat } from './FloatingChatProvider';
import { FLOATING_WINDOW_WIDTH_PX, FLOATING_Z_WINDOWS } from './constants';
import { floatingAttendanceLabel } from './attendanceUi';
import { Badge } from '@/components/ui/badge';

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
  const {
    minimizePanel,
    closePanel,
    composerDrafts,
    setComposerDraft,
    instanceIds,
    inboxScope,
  } = useFloatingChat();

  const { data: conversation } = useQuery({
    queryKey: ['floating-chat', 'conversation-meta', conversationId, instanceIds.join(','), inboxScope],
    enabled: instanceIds.length > 0,
    queryFn: async (): Promise<ChatConversation | null> => {
      for (const instanceId of instanceIds) {
        const rows = await chatService.getConversations({ instanceId, inboxScope });
        const hit = rows.find((r) => r.id === conversationId);
        if (hit) return hit;
      }
      return null;
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

  const identity = useMemo(
    () => resolveConversationIdentity(conversation ?? ({ id: conversationId } as ChatConversation), null, null),
    [conversation, conversationId],
  );

  const draft = composerDrafts[conversationId] ?? '';

  const send = useCallback(async () => {
    const t = draft.trim();
    if (!t) return;
    try {
      await chatService.sendMessage(conversationId, t);
      setComposerDraft(conversationId, '');
      void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'messages', conversationId] });
      void queryClient.invalidateQueries({ queryKey: ['floating-chat'] });
    } catch (err) {
      toast.error('Não foi possível enviar', {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }, [conversationId, draft, queryClient, setComposerDraft]);

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
      onMouseDown={onFocusWindow}
    >
      <div className="floating-chat-window-header flex shrink-0 items-center gap-1.5 border-b border-neutral-200 bg-neutral-50 px-2 py-1.5 dark:border-slate-800 dark:bg-slate-900">
        <Avatar className="h-7 w-7 shrink-0 border border-border/50">
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
          title="Fechar"
          onClick={() => closePanel(conversationId)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div
        ref={scrollRef}
        className={cn(
          'floating-chat-window-message-history min-h-0 flex-1 overflow-y-auto overscroll-contain bg-neutral-50 dark:bg-slate-900',
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
                      'mt-0.5 block text-[9px]',
                      message.direction === 'outgoing' ? 'text-primary-foreground/75' : 'text-muted-foreground',
                    )}
                  >
                    {formatHour(message.sentAt)}
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
            value={draft}
            onChange={(e) => setComposerDraft(conversationId, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
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
            onClick={() => void send()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
