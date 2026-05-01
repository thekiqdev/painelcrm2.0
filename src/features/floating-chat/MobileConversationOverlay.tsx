import { useCallback, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useChatOutboundQueue } from '@/hooks/useChatOutboundQueue';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowLeft, ExternalLink, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChatBubbleContent } from '@/components/chat/ChatBubbleContent';
import { MessageStatusIndicator } from '@/components/chat/MessageStatusIndicator';
import { chatService, type ChatConversation, type ChatMessage } from '@/services/chat';
import { REALTIME_WINDOW_EVENTS } from '@/services/realtimeClient';
import { resolveConversationIdentity } from '@/utils/chatIdentityDisplay';
import { chatAvatarUrlForImgSrc } from '@/lib/chatAvatarUrl';
import { cn } from '@/lib/utils';
import { useFloatingChat } from './floatingChatContext';
import { floatingAttendanceLabel } from './attendanceUi';
import { Badge } from '@/components/ui/badge';

const OVERLAY_Z = 160;

function formatHour(d: string | Date | undefined): string {
  if (!d) return '';
  try {
    return format(new Date(d), 'HH:mm');
  } catch {
    return '';
  }
}

type Props = {
  conversationId: string;
  onClose: () => void;
};

export function MobileConversationOverlay({ conversationId, onClose }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef('');
  const pendingWsFifoRef = useRef<string[]>([]);
  const { composerDrafts, setComposerDraft, instanceIds, inboxScope } = useFloatingChat();

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

  const afterSend = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ['floating-chat', 'conversation-meta', conversationId],
    });
    void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'conversations'] });
  }, [queryClient, conversationId]);

  const { enqueueText, retryFailed } = useChatOutboundQueue({
    conversationId,
    applyMessages,
    pendingWsFifoRef,
    afterItemDone: afterSend,
  });

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
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const identity = useMemo(
    () => resolveConversationIdentity(conversation ?? ({ id: conversationId } as ChatConversation), null, null),
    [conversation, conversationId],
  );

  const avatarSrc = chatAvatarUrlForImgSrc(identity.avatarUrl);
  const draft = composerDrafts[conversationId] ?? '';

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const submit = useCallback(() => {
    const t = draftRef.current.trim();
    if (!t) return;
    draftRef.current = '';
    setComposerDraft(conversationId, '');
    enqueueText(t, null);
  }, [conversationId, setComposerDraft, enqueueText]);

  const root = typeof document !== 'undefined' ? document.body : null;
  if (!root) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Chat: ${identity.displayName}`}
      className="fixed inset-0 flex flex-col bg-background md:hidden"
      style={{
        zIndex: OVERLAY_Z,
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-2 pr-1">
        <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label="Voltar" onClick={onClose}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Avatar className="h-9 w-9 shrink-0 border border-border/60">
          {avatarSrc ? <AvatarImage src={avatarSrc} alt="" className="object-cover" /> : null}
          <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
            {identity.initials.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <p className="truncate text-sm font-semibold leading-tight">{identity.displayName}</p>
            {(() => {
              const att = floatingAttendanceLabel(conversation?.attendance_status);
              return att ? (
                <Badge variant="outline" className="h-4 shrink-0 px-1 py-0 text-[9px] font-normal">
                  {att}
                </Badge>
              ) : null;
            })()}
          </div>
          {identity.phoneLine ? (
            <p className="truncate text-[11px] tabular-nums text-muted-foreground">{identity.phoneLine}</p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          title="Abrir no Chat"
          aria-label="Abrir no Chat"
          onClick={() => {
            onClose();
            navigate(`/chat/${encodeURIComponent(conversationId)}`);
          }}
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
      </header>

      <div
        ref={scrollRef}
        className={cn(
          'min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/30 px-2 py-2',
          'touch-pan-y [&_img]:max-h-[min(200px,38dvh)] [&_img]:w-auto [&_img]:max-w-full [&_img]:rounded-md [&_img]:object-contain',
        )}
      >
        <div className="space-y-1.5 pb-2">
          {isLoading ? (
            <p className="py-10 text-center text-xs text-muted-foreground">Carregando mensagens…</p>
          ) : messages.length === 0 ? (
            <p className="py-10 text-center text-xs text-muted-foreground">Sem mensagens.</p>
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
                    'w-fit max-w-[min(100%,20rem)] shrink-0 rounded-2xl px-2.5 py-1.5 text-[15px] leading-snug shadow-sm',
                    message.direction === 'outgoing'
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border bg-card text-foreground',
                  )}
                >
                  <ChatBubbleContent message={message} />
                  <span
                    className={cn(
                      'mt-1 flex items-center gap-1 text-[10px]',
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
                            className="ml-0.5 text-[10px] font-semibold underline underline-offset-2"
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

      <div className="shrink-0 border-t border-border bg-background px-2 py-2">
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => {
              const v = e.target.value;
              draftRef.current = v;
              setComposerDraft(conversationId, v);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!draftRef.current.trim()) return;
                submit();
              }
            }}
            placeholder="Mensagem…"
            rows={2}
            className="min-h-[48px] flex-1 resize-none text-base"
          />
          <Button
            type="button"
            size="icon"
            className="h-11 w-11 shrink-0 rounded-xl"
            title="Enviar"
            aria-label="Enviar"
            disabled={!draft.trim()}
            onClick={() => submit()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>,
    root,
  );
}
