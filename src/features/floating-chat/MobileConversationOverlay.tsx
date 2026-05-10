import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useChatOutboundQueue } from '@/hooks/useChatOutboundQueue';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowLeft, Headphones, Info, Plus, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChatBubbleContent } from '@/components/chat/ChatBubbleContent';
import { MessageStatusIndicator } from '@/components/chat/MessageStatusIndicator';
import { chatService, resolveChatKanbanTagsForUi, type ChatConversation, type ChatMessage } from '@/services/chat';
import { REALTIME_WINDOW_EVENTS } from '@/services/realtimeClient';
import { cn } from '@/lib/utils';
import { useFloatingChat } from './floatingChatContext';
import { useFloatingConversationIdentity } from './useFloatingConversationIdentity';
import { floatingAttendanceRowModel } from './attendanceUi';
import { Badge } from '@/components/ui/badge';
import { FloatingCompactProfile } from './FloatingCompactProfile';
import { getCachedFloatingConversationById } from './queryCache';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChatComposerDropZone } from '@/components/chat/ChatComposerDropZone';
import { ChatComposerQuickActionsPanel } from '@/components/chat/ChatComposerQuickActionsPanel';
import { chatScheduledMessagesQueryKey } from '@/components/chat/ChatScheduledMessagesStrip';
import { ScheduleChatMessageDialog } from '@/components/chat/ScheduleChatMessageDialog';
import {
  classifyChatOutgoingFile,
  inferDocumentMimeForSend,
  validateChatOutgoingFileSize,
} from '@/utils/chatComposerOutgoingFile';
import { buildFloatingComposerQuickSections } from './buildFloatingComposerQuickSections';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { ChatKanbanTagBadge } from '@/components/chat/ChatKanbanTagBadge';
import { chatAvatarUrlForImgSrc } from '@/lib/chatAvatarUrl';
import { useModulePermissions } from '@/contexts/ModulePermissionsContext';
import { chatCommercialGates } from '@/utils/chatCommercialGates';

const OVERLAY_Z = 160;

function crmBadgeLabel(conversation: ChatConversation | null | undefined): string {
  if (!conversation) return 'Contato WhatsApp';
  if (conversation.conversation_type === 'group' || conversation.external_chat_id?.endsWith('@g.us')) return 'Grupo';
  if (conversation.client_id) return 'Cliente';
  if (conversation.leadId) return 'Lead';
  return 'Contato WhatsApp';
}

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
  const { canChatReply, hasPermissionKey } = useModulePermissions();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const attachComboInputRef = useRef<HTMLInputElement>(null);
  const draftRef = useRef('');
  const [scheduleChatDlgOpen, setScheduleChatDlgOpen] = useState(false);
  const pendingWsFifoRef = useRef<string[]>([]);
  const {
    composerDrafts,
    setComposerDraft,
    instanceIds,
    inboxScope,
    compactProfileOpenByConversationId,
    toggleCompactProfile,
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
    queryKey: ['floating-chat', 'conversation-meta', conversationId],
    queryFn: async (): Promise<ChatConversation | null> => {
      const cached = getCachedFloatingConversationById(queryClient, conversationId);
      if (cached) return cached;
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
    placeholderData: () => getCachedFloatingConversationById(queryClient, conversationId),
  });

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['floating-chat', 'messages', conversationId],
    queryFn: async () => {
      void chatService.syncConversationMessages(conversationId, {}).catch(() => {});
      return chatService.getConversationMessages(conversationId);
    },
    staleTime: 5_000,
  });

  const { data: connectedInstances = [] } = useQuery({
    queryKey: ['floating-chat', 'connected-instances'],
    queryFn: async () => {
      const rows = await chatService.listInstances();
      return rows.filter((instance) => {
        const status = String(instance.status || '').toLowerCase();
        const enabled = (instance.metadata as Record<string, unknown> | null | undefined)?.enabled_in_chat !== false;
        return enabled && (status === 'connected' || status === 'open');
      });
    },
    staleTime: 30_000,
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

  const identity = useFloatingConversationIdentity(conversationId, conversation);
  const compactProfileOpen = compactProfileOpenByConversationId[conversationId] === true;
  const headerTags = resolveChatKanbanTagsForUi(conversation);
  const draft = composerDrafts[conversationId] ?? '';
  const commercial = useMemo(() => chatCommercialGates(hasPermissionKey), [hasPermissionKey]);
  const permDenied = 'Seu perfil não tem permissão para esta ação.';
  const isEmptyLeadConversation = !isLoading && messages.length === 0 && Boolean(conversation?.leadId);
  const selectedInstanceId = conversation?.instance_id ?? '';

  const dispatchCompactAction = useCallback(
    (action: string) => {
      if (!compactProfileOpen) toggleCompactProfile(conversationId);
      window.dispatchEvent(
        new CustomEvent('floating-chat:compact-action', {
          detail: { conversationId, action },
        }),
      );
    },
    [compactProfileOpen, toggleCompactProfile, conversationId],
  );

  const readFileAsDataUrl = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Falha ao ler ficheiro'));
      reader.readAsDataURL(file);
    });
  }, []);

  const sendMobileImageFile = async (file: File) => {
    const sizeOk = validateChatOutgoingFileSize(file);
    if (!sizeOk.ok) {
      toast.error(sizeOk.message);
      return;
    }
    if (classifyChatOutgoingFile(file) !== 'image') {
      toast.error('Arquivo inválido para imagem');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const comma = dataUrl.indexOf(',');
      const fileBase64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
      await chatService.sendImageMessage(conversationId, {
        fileBase64,
        mimeType: file.type || 'image/jpeg',
      });
      void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'messages', conversationId] });
      toast.success('Imagem enviada');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Falha ao enviar imagem');
    }
  };

  const sendMobileDocumentFile = async (file: File) => {
    const sizeOk = validateChatOutgoingFileSize(file);
    if (!sizeOk.ok) {
      toast.error(sizeOk.message);
      return;
    }
    if (classifyChatOutgoingFile(file) !== 'document') {
      toast.error('Tipo de documento não suportado');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const comma = dataUrl.indexOf(',');
      const fileBase64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
      await chatService.sendDocumentMessage(conversationId, {
        fileBase64,
        mimeType: inferDocumentMimeForSend(file),
        fileName: file.name,
      });
      void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'messages', conversationId] });
      toast.success('Documento enviado');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Falha ao enviar documento');
    }
  };

  const handleAttachComboChange = async (ev: ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    const kind = classifyChatOutgoingFile(file);
    if (kind === 'image') await sendMobileImageFile(file);
    else if (kind === 'document') await sendMobileDocumentFile(file);
    else toast.error('Tipo de arquivo não suportado.');
  };

  const floatingComposerSections = useMemo(
    () =>
      buildFloatingComposerQuickSections({
        conversation,
        commercial,
        canCreateInvoice: Boolean(conversation?.client_id && commercial.canCreateInvoiceFromChatFull),
        canCreateProposal: Boolean(
          (conversation?.client_id || conversation?.leadId) && commercial.canCreateProposalFromChatFull,
        ),
        canCreateContract: Boolean(conversation?.client_id && commercial.canCreateContractFromChatFull),
        hasSchedulePermission: hasPermissionKey('chat.schedule_from_chat'),
        canManageGroupUi: hasPermissionKey('chat.manage_groups'),
        canManageKanbanTags: hasPermissionKey('chat.manage_tags'),
        permDenied,
        isMobile: true,
        canScheduleChatMessage: hasPermissionKey('chat.send_message'),
        onAttachFile: () => attachComboInputRef.current?.click(),
        onScheduleMessage: () => setScheduleChatDlgOpen(true),
        onTemplate: () =>
          toast.info('Templates no floating entram na próxima etapa. Use o chat completo para modelos.'),
        dispatchAction: dispatchCompactAction,
        onOpenProfileForTags: () => {
          if (!compactProfileOpen) toggleCompactProfile(conversationId);
        },
        onOpenClient: () => {
          if (conversation?.client_id && commercial.canViewClientNav) {
            navigate(`/clients/${conversation.client_id}`);
          }
        },
      }),
    [
      conversation,
      commercial,
      compactProfileOpen,
      toggleCompactProfile,
      conversationId,
      dispatchCompactAction,
      navigate,
      hasPermissionKey,
      permDenied,
    ],
  );

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

  const changePreparedInstance = useCallback(
    async (nextInstanceId: string) => {
      if (!nextInstanceId || nextInstanceId === selectedInstanceId || messages.length > 0) return;
      try {
        const updated = await chatService.patchPreparedConversationInstance(conversationId, nextInstanceId);
        queryClient.setQueryData(['floating-chat', 'conversation-meta', conversationId], updated);
        void queryClient.invalidateQueries({ queryKey: ['floating-chat'] });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível alterar a instância');
      }
    },
    [conversationId, messages.length, queryClient, selectedInstanceId],
  );

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
          {identity.avatarUrl ? (
            <AvatarImage src={identity.avatarUrl} alt="" className="object-cover" />
          ) : null}
          <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
            {identity.initials.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <button
              type="button"
              className="min-w-0 truncate text-left text-sm font-semibold leading-tight hover:underline"
              onClick={() => toggleCompactProfile(conversationId)}
            >
              {identity.displayName}
            </button>
            {conversation?.conversation_type !== 'group' &&
            !conversation?.external_chat_id?.endsWith('@g.us') &&
            !conversation?.client_id ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="h-5 w-5 shrink-0 rounded-full" title="Ações CRM">
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="bottom" align="start" className="w-48">
                  {conversation?.leadId ? (
                    <DropdownMenuItem
                      disabled={!commercial.canConvertLeadToClient}
                      title={commercial.canConvertLeadToClient ? undefined : permDenied}
                      onSelect={(e) => { e.preventDefault(); dispatchCompactAction('convert_lead'); }}
                    >
                      Converter para cliente
                    </DropdownMenuItem>
                  ) : (
                    <>
                      <DropdownMenuItem
                        disabled={!commercial.canCreateLeadFromChat}
                        title={commercial.canCreateLeadFromChat ? undefined : permDenied}
                        onSelect={(e) => { e.preventDefault(); dispatchCompactAction('create_lead'); }}
                      >
                        Adicionar como lead
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={!commercial.canCreateClientFromChat}
                        title={commercial.canCreateClientFromChat ? undefined : permDenied}
                        onSelect={(e) => { e.preventDefault(); dispatchCompactAction('create_client'); }}
                      >
                        Criar cliente
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            <Badge variant="outline" className="h-4 shrink-0 px-1 py-0 text-[9px] font-normal">
              {crmBadgeLabel(conversation)}
            </Badge>
            {(() => {
              const m = floatingAttendanceRowModel(conversation);
              if (!m) return null;
              if (m.kind === 'assignee') {
                const src = chatAvatarUrlForImgSrc(m.avatarUrl);
                return (
                  <Badge
                    variant="default"
                    className="h-4 max-w-[min(9rem,50vw)] shrink-0 gap-0.5 px-1 py-0 pr-1 text-[9px] font-normal"
                    title={conversation?.assignee_display?.trim() ?? undefined}
                  >
                    <Headphones className="h-2.5 w-2.5 shrink-0 opacity-90" aria-hidden />
                    <Avatar className="h-3 w-3 shrink-0 border border-primary-foreground/25">
                      {src ? <AvatarImage src={src} alt="" className="object-cover" /> : null}
                      <AvatarFallback className="bg-primary/30 text-[6px] font-semibold text-primary-foreground">
                        {m.initials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 truncate">{m.shortName}</span>
                  </Badge>
                );
              }
              return (
                <Badge variant="outline" className="h-4 shrink-0 px-1 py-0 text-[9px] font-normal">
                  {m.label}
                </Badge>
              );
            })()}
          </div>
          {identity.phoneLine ? (
            <p className="truncate text-[11px] tabular-nums text-muted-foreground">{identity.phoneLine}</p>
          ) : null}
          {headerTags.length ? (
            <div className="mt-0.5 flex max-w-full flex-wrap gap-1">
              {headerTags.slice(0, 4).map((tag) => (
                <ChatKanbanTagBadge key={tag.id} label={tag.label} color={tag.color} className="max-w-[min(100px,32vw)]" />
              ))}
            </div>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          title={compactProfileOpen ? 'Ocultar perfil' : 'Ver perfil'}
          aria-label={compactProfileOpen ? 'Ocultar perfil' : 'Ver perfil'}
          onClick={() => toggleCompactProfile(conversationId)}
        >
          <Info className="h-4 w-4" />
        </Button>
      </header>
      {compactProfileOpen ? (
        <FloatingCompactProfile conversationId={conversationId} conversation={conversation} />
      ) : null}

      <ChatComposerDropZone
        disabled
        className="flex min-h-0 flex-1 flex-col"
        onSendImageFile={(f) => void sendMobileImageFile(f)}
        onSendDocumentFile={(f) => void sendMobileDocumentFile(f)}
      >
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
          ) : isEmptyLeadConversation ? (
            <div className="flex min-h-[55dvh] flex-col items-center justify-center px-5 py-10 text-center">
              <Avatar className="mb-3 h-14 w-14 border border-border/70">
                {identity.avatarUrl ? <AvatarImage src={identity.avatarUrl} alt="" /> : null}
                <AvatarFallback>{identity.initials}</AvatarFallback>
              </Avatar>
              <Badge variant="secondary" className="mb-2">Lead</Badge>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Nova conversa com Lead</p>
              <p className="mt-1 text-base font-semibold text-foreground">Conversa ainda não iniciada</p>
              <p className="mt-1 max-w-[280px] text-sm text-muted-foreground">
                Envie a primeira mensagem pelo WhatsApp.
              </p>
              {connectedInstances.length === 0 ? (
                <div className="mt-4 rounded-lg border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
                  <p>Nenhuma instância WhatsApp conectada.</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => navigate('/superadmin/conexoes/uazapi')}
                  >
                    Conectar WhatsApp
                  </Button>
                </div>
              ) : null}
            </div>
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
        {isEmptyLeadConversation && connectedInstances.length > 1 ? (
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="shrink-0">Enviar por:</span>
            <Select value={selectedInstanceId} onValueChange={(v) => void changePreparedInstance(v)}>
              <SelectTrigger className="h-9 flex-1 text-xs">
                <SelectValue placeholder="Instância WhatsApp" />
              </SelectTrigger>
              <SelectContent>
                {connectedInstances.map((instance) => (
                  <SelectItem key={instance.id} value={instance.id}>
                    {instance.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {canChatReply() ? (
        <div className="flex items-end gap-2">
          <input
            ref={attachComboInputRef}
            type="file"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,.rar,.ppt,.pptx"
            className="hidden"
            onChange={handleAttachComboChange}
          />
          <ChatComposerQuickActionsPanel
            sections={floatingComposerSections}
            density="compact"
            triggerLabel="Ações rápidas"
            headerTitle="Ações rápidas"
            contentClassName="z-[190]"
            side="top"
            align="start"
          />
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
            placeholder={isEmptyLeadConversation ? "Digite a primeira mensagem..." : "Mensagem…"}
            rows={2}
            className="min-h-[48px] flex-1 resize-none text-base"
            disabled={isEmptyLeadConversation && connectedInstances.length === 0}
          />
          <Button
            type="button"
            size="icon"
            className="h-11 w-11 shrink-0 rounded-xl"
            title="Enviar"
            aria-label="Enviar"
            disabled={!draft.trim() || (isEmptyLeadConversation && connectedInstances.length === 0)}
            onClick={() => submit()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        ) : (
          <p className="px-2 py-3 text-sm text-muted-foreground">Seu perfil não tem permissão para enviar mensagens.</p>
        )}
      </div>
      </ChatComposerDropZone>
      <ScheduleChatMessageDialog
        open={scheduleChatDlgOpen}
        onOpenChange={setScheduleChatDlgOpen}
        conversationId={conversationId}
        density="compact"
        onSuccess={() => {
          void queryClient.invalidateQueries({
            queryKey: chatScheduledMessagesQueryKey(conversationId),
          });
        }}
      />
    </div>,
    root,
  );
}
