import type { ChangeEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ExternalLink, Loader2, MessageCircle, Send } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ChatBubbleContent } from "@/components/chat/ChatBubbleContent";
import { ChatComposerQuickActionsPanel } from "@/components/chat/ChatComposerQuickActionsPanel";
import { MessageStatusIndicator } from "@/components/chat/MessageStatusIndicator";
import { ScheduleChatMessageDialog } from "@/components/chat/ScheduleChatMessageDialog";
import { chatScheduledMessagesQueryKey } from "@/components/chat/ChatScheduledMessagesStrip";
import { toast } from "@/components/ui/sonner";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { useFloatingChatOptional } from "@/features/floating-chat";
import { buildFloatingComposerQuickSections } from "@/features/floating-chat/buildFloatingComposerQuickSections";
import { useChatOutboundQueue } from "@/hooks/useChatOutboundQueue";
import { useIsMobile } from "@/hooks/use-mobile";
import { REALTIME_WINDOW_EVENTS } from "@/services/realtimeClient";
import { chatService, type ChatConversation, type ChatMessage } from "@/services/chat";
import {
  classifyChatOutgoingFile,
  inferDocumentMimeForSend,
  validateChatOutgoingFileSize,
} from "@/utils/chatComposerOutgoingFile";
import { chatCommercialGates } from "@/utils/chatCommercialGates";
import { cn } from "@/lib/utils";

type LeadLike = {
  id: string;
  name?: string | null;
  phone?: string | null;
  whatsapp_avatar_url?: string | null;
};

type Props = {
  lead: LeadLike;
  active: boolean;
  conversationId: string | null;
  inboxScope: "tenant" | "owner";
  onConversationReady: (conversationId: string) => void;
  onOpenFloating?: (conversationId: string) => void;
};

function formatHour(d: string | Date | undefined | null): string {
  if (!d) return "";
  try {
    return format(new Date(d), "HH:mm");
  } catch {
    return "";
  }
}

function initials(name?: string | null): string {
  const raw = name?.trim() || "Lead";
  return raw
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function isConnectedInstance(instance: { status?: string; metadata?: Record<string, unknown> | null }): boolean {
  const status = String(instance.status || "").toLowerCase();
  const enabled = instance.metadata?.enabled_in_chat !== false;
  return enabled && (status === "connected" || status === "open");
}

export function EmbeddedLeadConversationPanel({
  lead,
  active,
  conversationId,
  inboxScope,
  onConversationReady,
  onOpenFloating,
}: Props) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const floatingChat = useFloatingChatOptional();
  const { canView, canChatReply, hasPermissionKey } = useModulePermissions();
  const commercial = useMemo(() => chatCommercialGates(hasPermissionKey), [hasPermissionKey]);
  const permDenied = "Seu perfil não tem permissão para esta ação.";
  const canUseChat = canView("chat");
  const canSendMessage = canChatReply();
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(conversationId);
  const [draft, setDraft] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [scheduleChatDlgOpen, setScheduleChatDlgOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef("");
  const attachComboInputRef = useRef<HTMLInputElement>(null);
  const pendingWsFifoRef = useRef<string[]>([]);

  useEffect(() => {
    setCurrentConversationId(conversationId);
  }, [conversationId]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const messagesQueryKey = useMemo(
    () => ["lead-profile", "conversation-messages", currentConversationId] as const,
    [currentConversationId],
  );

  const applyMessages = useCallback(
    (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      queryClient.setQueryData<ChatMessage[]>(messagesQueryKey, (old) => updater(old ?? []));
    },
    [messagesQueryKey, queryClient],
  );

  const afterSend = useCallback(() => {
    if (!currentConversationId) return;
    void queryClient.invalidateQueries({ queryKey: ["lead-profile", "conversation-meta", currentConversationId] });
    void queryClient.invalidateQueries({ queryKey: ["floating-chat"] });
    void queryClient.invalidateQueries({ queryKey: ["leads"] });
  }, [currentConversationId, queryClient]);

  const { enqueueText, retryFailed } = useChatOutboundQueue({
    conversationId: currentConversationId,
    applyMessages,
    pendingWsFifoRef,
    afterItemDone: afterSend,
  });

  const { data: connectedInstances = [], isLoading: loadingInstances } = useQuery({
    queryKey: ["lead-profile", "connected-chat-instances"],
    queryFn: async () => {
      const rows = await chatService.listInstances();
      return rows.filter(isConnectedInstance);
    },
    enabled: active && canUseChat,
    staleTime: 30_000,
  });

  const { data: conversation = null } = useQuery({
    queryKey: ["lead-profile", "conversation-meta", currentConversationId],
    queryFn: async (): Promise<ChatConversation | null> => {
      if (!currentConversationId) return null;
      const rows = await chatService.getConversations({ inboxScope });
      return rows.find((row) => row.id === currentConversationId) ?? null;
    },
    enabled: active && canUseChat && Boolean(currentConversationId),
    staleTime: 10_000,
  });

  const { data: messages = [], isLoading: loadingMessages } = useQuery({
    queryKey: messagesQueryKey,
    queryFn: async () => {
      if (!currentConversationId) return [];
      void chatService.syncConversationMessages(currentConversationId, {}).catch(() => {});
      return chatService.getConversationMessages(currentConversationId);
    },
    enabled: active && canUseChat && Boolean(currentConversationId),
    staleTime: 5_000,
  });

  useEffect(() => {
    if (!active || !canUseChat || currentConversationId || preparing) return;
    if (!lead.phone?.trim()) return;
    if (loadingInstances) return;
    const firstInstance = connectedInstances[0];
    if (!firstInstance) return;
    let cancelled = false;
    setPreparing(true);
    void chatService
      .prepareLeadConversation({ lead_id: lead.id, instance_id: firstInstance.id })
      .then((result) => {
        if (cancelled) return;
        setCurrentConversationId(result.conversation.id);
        queryClient.setQueryData(["lead-profile", "conversation-meta", result.conversation.id], result.conversation);
        onConversationReady(result.conversation.id);
      })
      .catch((error) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Não foi possível preparar a conversa");
      })
      .finally(() => {
        if (!cancelled) setPreparing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    active,
    canUseChat,
    connectedInstances,
    currentConversationId,
    lead.id,
    lead.phone,
    loadingInstances,
    onConversationReady,
    preparing,
    queryClient,
  ]);

  useEffect(() => {
    if (!currentConversationId) return;
    const onMsg = (e: Event) => {
      const d = (e as CustomEvent<Record<string, unknown>>).detail;
      const cid = (d?.conversation_id as string) || (d?.conversationId as string);
      if (cid !== currentConversationId) return;
      void queryClient.invalidateQueries({ queryKey: messagesQueryKey });
      void queryClient.invalidateQueries({ queryKey: ["lead-profile", "conversation-meta", currentConversationId] });
    };
    const onConv = (e: Event) => {
      const d = (e as CustomEvent<Record<string, unknown>>).detail;
      const cid = (d?.conversation_id as string) || (d?.conversationId as string);
      if (typeof cid === "string" && cid !== currentConversationId) return;
      void queryClient.invalidateQueries({ queryKey: messagesQueryKey });
      void queryClient.invalidateQueries({ queryKey: ["lead-profile", "conversation-meta", currentConversationId] });
    };
    const onDeleted = (e: Event) => {
      const d = (e as CustomEvent<Record<string, unknown>>).detail;
      const cid = (d?.conversation_id as string) || (d?.id as string);
      if (cid !== currentConversationId) return;
      setCurrentConversationId(null);
      void queryClient.invalidateQueries({ queryKey: ["lead-profile", "conversation-meta"] });
    };
    window.addEventListener(REALTIME_WINDOW_EVENTS.messageCreated, onMsg);
    window.addEventListener(REALTIME_WINDOW_EVENTS.conversationUpdated, onConv);
    window.addEventListener(REALTIME_WINDOW_EVENTS.conversationDeleted, onDeleted);
    return () => {
      window.removeEventListener(REALTIME_WINDOW_EVENTS.messageCreated, onMsg);
      window.removeEventListener(REALTIME_WINDOW_EVENTS.conversationUpdated, onConv);
      window.removeEventListener(REALTIME_WINDOW_EVENTS.conversationDeleted, onDeleted);
    };
  }, [currentConversationId, messagesQueryKey, queryClient]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, currentConversationId]);

  const changePreparedInstance = useCallback(
    async (instanceId: string) => {
      if (!currentConversationId || !instanceId || instanceId === conversation?.instance_id || messages.length > 0) return;
      try {
        const updated = await chatService.patchPreparedConversationInstance(currentConversationId, instanceId);
        queryClient.setQueryData(["lead-profile", "conversation-meta", currentConversationId], updated);
        void queryClient.invalidateQueries({ queryKey: ["floating-chat"] });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Não foi possível alterar a instância");
      }
    },
    [conversation?.instance_id, currentConversationId, messages.length, queryClient],
  );

  const readFileAsDataUrl = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Falha ao ler ficheiro"));
      reader.readAsDataURL(file);
    });
  }, []);

  const sendEmbedImageFile = useCallback(
    async (file: File) => {
      if (!currentConversationId) return;
      const sizeOk = validateChatOutgoingFileSize(file);
      if (!sizeOk.ok) {
        toast.error(sizeOk.message);
        return;
      }
      if (classifyChatOutgoingFile(file) !== "image") {
        toast.error("Arquivo inválido para imagem");
        return;
      }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const comma = dataUrl.indexOf(",");
        const fileBase64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
        await chatService.sendImageMessage(currentConversationId, {
          fileBase64,
          mimeType: file.type || "image/jpeg",
        });
        void queryClient.invalidateQueries({ queryKey: messagesQueryKey });
        toast.success("Imagem enviada");
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Falha ao enviar imagem");
      }
    },
    [currentConversationId, messagesQueryKey, queryClient, readFileAsDataUrl],
  );

  const sendEmbedDocumentFile = useCallback(
    async (file: File) => {
      if (!currentConversationId) return;
      const sizeOk = validateChatOutgoingFileSize(file);
      if (!sizeOk.ok) {
        toast.error(sizeOk.message);
        return;
      }
      if (classifyChatOutgoingFile(file) !== "document") {
        toast.error("Tipo de documento não suportado");
        return;
      }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const comma = dataUrl.indexOf(",");
        const fileBase64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
        await chatService.sendDocumentMessage(currentConversationId, {
          fileBase64,
          mimeType: inferDocumentMimeForSend(file),
          fileName: file.name,
        });
        void queryClient.invalidateQueries({ queryKey: messagesQueryKey });
        toast.success("Documento enviado");
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Falha ao enviar documento");
      }
    },
    [currentConversationId, messagesQueryKey, queryClient, readFileAsDataUrl],
  );

  const handleAttachComboChange = async (ev: ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;
    const kind = classifyChatOutgoingFile(file);
    if (kind === "image") await sendEmbedImageFile(file);
    else if (kind === "document") await sendEmbedDocumentFile(file);
    else toast.error("Tipo de arquivo não suportado.");
  };

  const dispatchEmbeddedAction = useCallback(
    (action: string) => {
      if (!currentConversationId) {
        toast.error("Conversa ainda não disponível.");
        return;
      }
      const fc = floatingChat;
      if (fc) {
        fc.openConversationInContext(currentConversationId);
        fc.setCompactProfileOpen(currentConversationId, true);
        queueMicrotask(() => {
          window.dispatchEvent(
            new CustomEvent("floating-chat:compact-action", {
              detail: { conversationId: currentConversationId, action },
            }),
          );
        });
        return;
      }
      navigate(`/chat/${currentConversationId}`);
      toast.message("Chat completo", {
        description: 'Use o menu «+» na página do Chat para a mesma lista de ações.',
      });
    },
    [currentConversationId, floatingChat, navigate],
  );

  const openFloatingProfileForTags = useCallback(() => {
    if (!currentConversationId) return;
    floatingChat?.openConversationInContext(currentConversationId);
    floatingChat?.setCompactProfileOpen(currentConversationId, true);
  }, [currentConversationId, floatingChat]);

  const composerQuickSections = useMemo(
    () =>
      buildFloatingComposerQuickSections({
        conversation,
        commercial,
        canCreateInvoice: Boolean(conversation?.client_id && commercial.canCreateInvoiceFromChatFull),
        canCreateProposal: Boolean(
          (conversation?.client_id || conversation?.leadId) && commercial.canCreateProposalFromChatFull,
        ),
        canCreateContract: Boolean(conversation?.client_id && commercial.canCreateContractFromChatFull),
        hasSchedulePermission: hasPermissionKey("chat.schedule_from_chat"),
        canManageGroupUi: hasPermissionKey("chat.manage_groups"),
        canManageKanbanTags: hasPermissionKey("chat.manage_tags"),
        permDenied,
        isMobile,
        canScheduleChatMessage: hasPermissionKey("chat.send_message"),
        onAttachFile: () => attachComboInputRef.current?.click(),
        onScheduleMessage: () => setScheduleChatDlgOpen(true),
        onTemplate: () =>
          toast.info("Templates no painel embutido: use o chat completo (/chat) para modelos WhatsApp."),
        dispatchAction: dispatchEmbeddedAction,
        onOpenProfileForTags: openFloatingProfileForTags,
        onOpenClient: () => {
          if (conversation?.client_id && commercial.canViewClientNav) {
            navigate(`/clients/${conversation.client_id}`);
          }
        },
      }),
    [
      conversation,
      commercial,
      dispatchEmbeddedAction,
      openFloatingProfileForTags,
      hasPermissionKey,
      isMobile,
      navigate,
      permDenied,
    ],
  );

  const submit = useCallback(() => {
    const text = draftRef.current.trim();
    if (!text || !currentConversationId || !canSendMessage) return;
    draftRef.current = "";
    setDraft("");
    enqueueText(text, null);
  }, [canSendMessage, currentConversationId, enqueueText]);

  const isEmptyConversation = Boolean(currentConversationId) && !loadingMessages && messages.length === 0;
  const displayName = conversation?.displayName || conversation?.contactName || lead.name || "Lead";
  const avatarUrl = conversation?.avatarUrl || lead.whatsapp_avatar_url || null;

  if (!canUseChat) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">Sem permissão para visualizar o Chat.</CardContent>
      </Card>
    );
  }

  if (!lead.phone?.trim()) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          Este lead não possui telefone para iniciar conversa WhatsApp.
        </CardContent>
      </Card>
    );
  }

  if (!currentConversationId && !preparing && !loadingInstances && connectedInstances.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6 text-center text-sm text-muted-foreground">
          <p>Nenhuma instância WhatsApp conectada.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => window.open("/superadmin/conexoes/uazapi", "_self")}>
            Conectar WhatsApp
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border bg-muted/20 px-3 py-2">
        <Avatar className="h-9 w-9 border border-border/70">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
          <AvatarFallback>{initials(displayName)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-semibold">{displayName}</p>
            <Badge variant="secondary" className="h-5 shrink-0">Lead</Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground">{lead.phone}</p>
        </div>
        {currentConversationId && onOpenFloating ? (
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenFloating(currentConversationId)}>
            <ExternalLink className="mr-2 h-3.5 w-3.5" />
            Abrir em janela
          </Button>
        ) : null}
      </div>

      {isEmptyConversation && connectedInstances.length > 1 ? (
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground">
          <span className="shrink-0">Enviar por:</span>
          <Select value={conversation?.instance_id ?? ""} onValueChange={(value) => void changePreparedInstance(value)}>
            <SelectTrigger className="h-8 flex-1 text-xs">
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

      <div ref={scrollRef} className="h-[360px] overflow-y-auto bg-muted/20 px-3 py-3">
        {preparing || (loadingInstances && !currentConversationId) ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Preparando conversa...
          </div>
        ) : loadingMessages ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando mensagens...
          </div>
        ) : isEmptyConversation ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <MessageCircle className="mb-3 h-10 w-10 text-muted-foreground/60" />
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Nova conversa com Lead</p>
            <p className="mt-1 text-sm font-semibold">Conversa ainda não iniciada</p>
            <p className="mt-1 text-xs text-muted-foreground">Envie a primeira mensagem para começar.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn("flex w-full min-w-0", message.direction === "outgoing" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "w-fit max-w-[min(100%,28rem)] rounded-2xl px-3 py-2 text-sm leading-snug shadow-sm",
                    message.direction === "outgoing"
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-background text-foreground",
                  )}
                >
                  <ChatBubbleContent message={message} />
                  <span
                    className={cn(
                      "mt-1 flex items-center gap-1 text-[10px]",
                      message.direction === "outgoing" ? "text-primary-foreground/75" : "text-muted-foreground",
                    )}
                  >
                    <span>{formatHour(message.sentAt)}</span>
                    {message.direction === "outgoing" ? (
                      <>
                        <MessageStatusIndicator status={message.status} className="h-2.5 w-2.5" />
                        {message.status === "failed" ? (
                          <button className="ml-1 font-semibold underline" type="button" onClick={() => retryFailed(message)}>
                            Reenviar
                          </button>
                        ) : null}
                      </>
                    ) : null}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border bg-background p-3">
        {currentConversationId ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-end gap-2">
              {isMobile ? (
                <input
                  ref={attachComboInputRef}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,.rar,.ppt,.pptx"
                  className="hidden"
                  onChange={(e) => void handleAttachComboChange(e)}
                />
              ) : null}
              <ChatComposerQuickActionsPanel
                sections={composerQuickSections}
                density="compact"
                triggerLabel="Ações rápidas"
                headerTitle="Ações rápidas"
                contentClassName="z-[200]"
                side="top"
                align="start"
              />
              {canSendMessage ? (
                <>
                  <Textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        submit();
                      }
                    }}
                    placeholder={isEmptyConversation ? "Digite a primeira mensagem..." : "Mensagem..."}
                    rows={2}
                    disabled={connectedInstances.length === 0}
                    className="min-h-[48px] flex-1 resize-none"
                  />
                  <Button
                    type="button"
                    size="icon"
                    className="h-10 w-10 shrink-0"
                    disabled={!draft.trim() || connectedInstances.length === 0}
                    onClick={submit}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <p className="min-w-0 flex-1 rounded-lg border border-dashed border-border px-2 py-2 text-xs text-muted-foreground">
                  Seu perfil não tem permissão para enviar mensagens — as ações acima utilizam o mesmo menu do chat.
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-center text-xs text-muted-foreground">A preparar conversa WhatsApp…</p>
        )}
      </div>
      <ScheduleChatMessageDialog
        open={scheduleChatDlgOpen}
        onOpenChange={setScheduleChatDlgOpen}
        conversationId={currentConversationId}
        density="compact"
        onSuccess={() => {
          void queryClient.invalidateQueries({
            queryKey: chatScheduledMessagesQueryKey(currentConversationId),
          });
        }}
      />
    </Card>
  );
}
