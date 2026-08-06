import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChatOutboundQueue } from '@/hooks/useChatOutboundQueue';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Info, Minus, Plus, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChatBubbleContent } from '@/components/chat/ChatBubbleContent';
import { MessageStatusIndicator } from '@/components/chat/MessageStatusIndicator';
import {
  chatService,
  resolveChatKanbanTagsForUi,
  type ChatConversation,
  type ChatKanbanTagUi,
  type ChatMessage,
} from '@/services/chat';
import { chatKanbanService } from '@/services/chatKanban';
import { apiClient } from '@/integrations/api/client';
import { DEFAULT_CHAT_TAG_COLOR, normalizeHexColor } from '@/lib/chatKanbanTagStyle';
import { REALTIME_WINDOW_EVENTS } from '@/services/realtimeClient';
import { tryApplyChatWsPatch } from '@/features/chat-core/ws-patch';
import { shouldUseChatDomainStore } from '@/features/chat-core/store/flags';
import { applyStoreConversationPartialPatch, useFloatingConversationMessages, useFloatingConversationMeta } from '@/features/chat-core/store/public';
import { useLoadMoreMessages } from '@/features/chat-core/store/hooks/useLoadMoreMessages';
import { ensureChatInstances, filterConnectedChatInstances } from '@/features/chat-core/runtime';
import { cn } from '@/lib/utils';
import { useFloatingChat } from './floatingChatContext';
import {
  invalidateFloatingChatAggregates,
  invalidateFloatingChatCrmSurfaces,
  scheduleInvalidateFloatingChatAggregates,
} from './floatingChatQueries';
import { useFloatingConversationIdentity } from './useFloatingConversationIdentity';
import { FLOATING_WINDOW_WIDTH_PX, FLOATING_Z_WINDOWS } from './constants';
import { floatingAttendanceRowModel } from './attendanceUi';
import { ChatAssigneePresence } from '@/components/chat/ChatAssigneePresence';
import { Badge } from '@/components/ui/badge';
import { ChatComposerDropZone } from '@/components/chat/ChatComposerDropZone';
import { ChatComposerQuickActionsPanel } from '@/components/chat/ChatComposerQuickActionsPanel';
import { chatScheduledMessagesQueryKey } from '@/components/chat/ChatScheduledMessagesStrip';
import { ScheduleChatMessageDialog } from '@/components/chat/ScheduleChatMessageDialog';
import {
  classifyChatOutgoingFile,
  inferDocumentMimeForSend,
  validateChatOutgoingFileSize,
} from '@/utils/chatComposerOutgoingFile';
import { useIsMobile } from '@/hooks/use-mobile';
import { buildFloatingComposerQuickSections } from './buildFloatingComposerQuickSections';
import { beginConversationDragSession, endConversationDragSession } from '@/lib/chatKanbanConversationDrag';
import {
  applyConversationDragPreview,
  conversationDragPreviewFromChatConversation,
} from '@/lib/conversationDragPreview';
import { FloatingCompactProfile } from './FloatingCompactProfile';
import { useChatPerfRender } from '@/features/chat-core/metrics/renderMetrics';
import { useNavigate } from 'react-router-dom';
import { useModulePermissions } from '@/contexts/ModulePermissionsContext';
import { chatCommercialGates } from '@/utils/chatCommercialGates';
import { toast } from '@/components/ui/sonner';
import { ChatKanbanTagBadge } from '@/components/chat/ChatKanbanTagBadge';
import { MessageListSkeleton } from '@/components/chat/skeletons/MessageListSkeleton';
import { VirtualizedMessageList } from '@/components/chat/virtualized/VirtualizedMessageList';
import {
  isChatMessageVirtualizationEnabled,
  useVirtualizedMessages,
} from '@/components/chat/virtualized/useVirtualizedMessages';
import { ChatKanbanTagQuickPicker } from '@/components/chat/ChatKanbanTagQuickPicker';
import { patchConversationKanbanTagsEverywhere } from './conversationKanbanTagsCache';
import { dispatchFloatingCompactAction } from './dispatchFloatingCompactAction';
import { ChatAppointmentSchedulePanel } from '@/components/chat/ChatAppointmentSchedulePanel';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type LeadProfileForConversion = {
  id?: string;
  name?: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
};

const FLOATING_Z_WINDOW_ACTIVE = 49;

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
  useChatPerfRender('FloatingConversationWindow');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const attachComboInputRef = useRef<HTMLInputElement>(null);
  const floatingDraftRef = useRef('');
  const isMobile = useIsMobile();
  const [scheduleChatDlgOpen, setScheduleChatDlgOpen] = useState(false);
  const [meetNowConfirmOpen, setMeetNowConfirmOpen] = useState(false);
  const [meetNowSubmitting, setMeetNowSubmitting] = useState(false);
  const pendingWsFifoRef = useRef<string[]>([]);
  const {
    minimizePanel,
    closePanel,
    composerDrafts,
    setComposerDraft,
    instanceIds,
    inboxScope,
    compactProfileOpenByConversationId,
    toggleCompactProfile,
    appointmentPanelOpenByConversationId,
    openAppointmentPanel,
    closeAppointmentPanel,
  } = useFloatingChat();
  const compactProfileOpen = compactProfileOpenByConversationId[conversationId] === true;
  const appointmentPanelOpen = appointmentPanelOpenByConversationId[conversationId] === true;

  const { canChatReply, hasPermissionKey } = useModulePermissions();
  const commercial = useMemo(() => chatCommercialGates(hasPermissionKey), [hasPermissionKey]);
  const permDenied = 'Seu perfil não tem permissão para esta ação.';

  const { conversation } = useFloatingConversationMeta({
    conversationId,
    instanceIds,
    inboxScope,
  });

  const dispatchCompactAction = useCallback(
    (action: string) => {
      const handleMeetNow = dispatchFloatingCompactAction({
        conversationId,
        action,
        compactProfileOpen,
        ensureCompactProfileOpen: toggleCompactProfile,
        openAppointmentPanel,
      });
      if (handleMeetNow) {
        if (!conversation?.client_id && !conversation?.leadId) {
          toast.error('Vincule um cliente a esta conversa para agendar um compromisso.');
          return;
        }
        setMeetNowConfirmOpen(true);
      }
    },
    [compactProfileOpen, toggleCompactProfile, openAppointmentPanel, conversationId, conversation?.client_id, conversation?.leadId],
  );

  const handleFloatingMeetNowConfirmed = useCallback(async () => {
    setMeetNowConfirmOpen(false);
    setMeetNowSubmitting(true);
    try {
      const r = await chatService.createMeetNowFromChat(conversationId);
      void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'messages', conversationId] });
      if (r.warnings?.length) {
        for (const w of r.warnings) toast.message(w);
      }
      if (r.meet_link && r.message_sent) {
        toast.success('Reunião criada e link enviado no chat.');
      } else if (r.meet_link && !r.message_sent) {
        toast.warning('Reunião criada, mas o link não pôde ser enviado no WhatsApp.');
      } else {
        toast.warning('Reunião criada sem link do Meet. Verifique o Google Agenda ou a sincronização.');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível criar a reunião');
    } finally {
      setMeetNowSubmitting(false);
    }
  }, [conversationId, queryClient]);

  const readFileAsDataUrl = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Falha ao ler ficheiro'));
      reader.readAsDataURL(file);
    });
  }, []);

  const sendFloatingImageFile = async (file: File) => {
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

  const sendFloatingDocumentFile = async (file: File) => {
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

  const handleAttachComboChange = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    const kind = classifyChatOutgoingFile(file);
    if (kind === 'image') await sendFloatingImageFile(file);
    else if (kind === 'document') await sendFloatingDocumentFile(file);
    else toast.error('Tipo de arquivo não suportado.');
  };

  const { messages, isLoading, applyMessages } = useFloatingConversationMessages(conversationId);
  const loadMoreMessages = useLoadMoreMessages(conversationId);
  /** Único scroll container: virt + Load More + auto-scroll (Sprint TF1 — dual ref quebrava paint). */

  const afterFloatingSend = useCallback(() => {
    if (!shouldUseChatDomainStore()) {
      void queryClient.invalidateQueries({
        queryKey: ['floating-chat', 'conversation-meta', conversationId],
      });
    }
    invalidateFloatingChatAggregates(queryClient);
  }, [queryClient, conversationId]);

  const { enqueueText, retryFailed } = useChatOutboundQueue({
    conversationId,
    applyMessages,
    pendingWsFifoRef,
    afterItemDone: afterFloatingSend,
  });

  const { data: connectedInstances = [] } = useQuery({
    queryKey: ['floating-chat', 'connected-instances'],
    queryFn: async () => {
      const rows = await ensureChatInstances({ reason: 'bootstrap' });
      return filterConnectedChatInstances(rows);
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    const onMsg = (e: Event) => {
      if (shouldUseChatDomainStore()) return;
      const d = (e as CustomEvent<Record<string, unknown>>).detail;
      const cid = (d?.conversation_id as string) || (d?.conversationId as string);
      if (typeof cid !== 'string' || cid !== conversationId) return;
      const patch = tryApplyChatWsPatch(queryClient, 'message.created', d, {
        isActiveConversation: true,
      });
      if (patch.applied) return;
      void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'messages', conversationId] });
      void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'conversation-meta', conversationId] });
    };
    const onConv = (e: Event) => {
      if (shouldUseChatDomainStore()) return;
      const d = (e as CustomEvent<Record<string, unknown>>).detail;
      const cid = (d?.conversation_id as string) || (d?.conversationId as string);
      if (typeof cid === 'string' && cid !== conversationId) return;
      const patch = tryApplyChatWsPatch(queryClient, 'conversation.updated', d);
      if (patch.applied) return;
      void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'messages', conversationId] });
      void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'conversation-meta', conversationId] });
      invalidateFloatingChatAggregates(queryClient);
    };
    window.addEventListener(REALTIME_WINDOW_EVENTS.messageCreated, onMsg);
    window.addEventListener(REALTIME_WINDOW_EVENTS.conversationUpdated, onConv);
    return () => {
      window.removeEventListener(REALTIME_WINDOW_EVENTS.messageCreated, onMsg);
      window.removeEventListener(REALTIME_WINDOW_EVENTS.conversationUpdated, onConv);
    };
  }, [conversationId, queryClient]);

  const messageVirtualEnabled = isChatMessageVirtualizationEnabled(messages.length);

  const messageVirtual = useVirtualizedMessages({
    messages,
    scrollRef,
    conversationKey: conversationId,
    variant: 'floating',
    enabled: messageVirtualEnabled,
  });

  // Virt OFF: scroll nativo ao fim.
  // Virt ON: virtualizer cuida de append/prepend; TF1 só garante pin no open (ref vivo).
  useEffect(() => {
    if (messageVirtual.enabled) return;
    if (messages.length === 0) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, messageVirtual.enabled]);

  const hasFloatingMessages = messages.length > 0;
  useEffect(() => {
    if (!messageVirtual.enabled || !hasFloatingMessages) return;
    const id = requestAnimationFrame(() => {
      messageVirtual.scrollToBottom('auto');
    });
    return () => cancelAnimationFrame(id);
  }, [conversationId, messageVirtual.enabled, hasFloatingMessages, messageVirtual.scrollToBottom]);

  const identity = useFloatingConversationIdentity(conversationId, conversation);
  const headerTags = resolveChatKanbanTagsForUi(conversation);
  const isEmptyLeadConversation = !isLoading && messages.length === 0 && Boolean(conversation?.leadId);
  const selectedInstanceId = conversation?.instance_id ?? '';
  const isGroupHeader =
    conversation?.conversation_type === 'group' || Boolean(conversation?.external_chat_id?.endsWith('@g.us'));

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
        isMobile,
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
      isMobile,
    ],
  );

  const [tenantKanbanTagsCatalog, setTenantKanbanTagsCatalog] = useState<ChatKanbanTagUi[]>([]);
  const [tenantKanbanTagsLoading, setTenantKanbanTagsLoading] = useState(false);
  const [kanbanTagsBusy, setKanbanTagsBusy] = useState(false);

  useEffect(() => {
    if (!conversationId || isGroupHeader) {
      setTenantKanbanTagsCatalog([]);
      return;
    }
    let cancelled = false;
    setTenantKanbanTagsLoading(true);
    void chatKanbanService
      .listTenantKanbanTags()
      .then((rows) => {
        if (!cancelled) {
          setTenantKanbanTagsCatalog(
            rows
              .map((t) => ({
                id: t.id,
                label: t.label,
                color: t.color?.trim() ? normalizeHexColor(t.color) : DEFAULT_CHAT_TAG_COLOR,
              }))
              .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
          );
        }
      })
      .catch(() => {
        if (!cancelled) setTenantKanbanTagsCatalog([]);
      })
      .finally(() => {
        if (!cancelled) setTenantKanbanTagsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, isGroupHeader]);

  const applyFloatingCrmPatch = useCallback(
    (patch: Partial<ChatConversation>) => {
      // Sprint 2 / 10E — header lê Store ON; RQ meta só legado OFF.
      if (shouldUseChatDomainStore()) {
        applyStoreConversationPartialPatch(conversationId, patch);
        return;
      }
      queryClient.setQueryData<ChatConversation | null>(
        ['floating-chat', 'conversation-meta', conversationId],
        (prev) => (prev ? { ...prev, ...patch } : prev),
      );
      const conversationLists = queryClient.getQueriesData<ChatConversation[]>({
        queryKey: ['floating-chat', 'conversations'],
      });
      for (const [key, rows] of conversationLists) {
        if (!Array.isArray(rows)) continue;
        queryClient.setQueryData<ChatConversation[]>(
          key,
          rows.map((row) => (row?.id === conversationId ? { ...row, ...patch } : row)),
        );
      }
      const minimizedMetaMaps = queryClient.getQueriesData<Record<string, ChatConversation | null>>({
        queryKey: ['floating-chat', 'minimized-meta'],
      });
      for (const [key, map] of minimizedMetaMaps) {
        if (!map || typeof map !== 'object') continue;
        const prevRow = map[conversationId];
        if (!prevRow) continue;
        queryClient.setQueryData<Record<string, ChatConversation | null>>(key, {
          ...map,
          [conversationId]: { ...prevRow, ...patch },
        });
      }
    },
    [queryClient, conversationId],
  );

  const handleFloatingCrmAvatarPlus = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!conversation) return;
      if (isGroupHeader || conversation.client_id) return;
      try {
        if (conversation.leadId && !commercial.canConvertLeadToClient) {
          toast.error(permDenied);
          return;
        }
        if (!conversation.leadId && !commercial.canCreateLeadFromChat) {
          toast.error(permDenied);
          return;
        }
        if (conversation.leadId) {
          const prof = await chatService.getConversationProfile(conversationId);
          if (prof.type !== 'lead' || !prof.profile) {
            toast.error('Lead indisponível para conversão.');
            return;
          }
          const lead = prof.profile as LeadProfileForConversion;
          if (!lead.id) {
            toast.error('Lead inválido para conversão.');
            return;
          }
          const { addClient } = await import('@/utils/clients-helpers');
          const clientResult = await addClient({
            name: lead.name,
            company: lead.company || undefined,
            email: lead.email || undefined,
            phone: lead.phone || conversation.phoneNumber || undefined,
            notes: lead.notes || undefined,
            status: 'Ativo',
          });
          if (!clientResult.success || !clientResult.data || !(clientResult.data as { id?: string }).id) {
            throw new Error('Falha ao criar cliente');
          }
          const createdClientId = (clientResult.data as { id: string }).id;
          await apiClient.patch(`/api/leads/${lead.id}`, {
            status: 'Convertido',
            migrated_client_id: createdClientId,
          });
          applyFloatingCrmPatch({
            client_id: createdClientId,
            leadId: null,
          });
          toast.success('Lead convertido para cliente');
          void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'conversation-crm-profile', conversationId] });
          invalidateFloatingChatCrmSurfaces(queryClient, conversationId);
          void queryClient.invalidateQueries({ queryKey: ['clients', 'list'] });
          void queryClient.invalidateQueries({ queryKey: ['leads'] });
        } else {
          const leadData: Record<string, unknown> = {
            name:
              conversation.contactName ||
              conversation.profileName ||
              conversation.phoneNumber ||
              conversation.external_chat_id ||
              'Contato WhatsApp',
            source: 'WhatsApp',
            ...(conversation.phoneNumber ? { phone: conversation.phoneNumber } : {}),
          };
          const response = await apiClient.post<{ id: string }>('/api/leads', leadData);
          if (response.error || !response.data?.id) throw new Error(response.error || 'Lead criado sem ID');
          const updated = await chatService.linkConversation(conversationId, { type: 'lead', id: response.data.id });
          applyFloatingCrmPatch(updated);
          toast.success('Lead criado e vinculado');
          void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'conversation-crm-profile', conversationId] });
          invalidateFloatingChatCrmSurfaces(queryClient, conversationId);
          void queryClient.invalidateQueries({ queryKey: ['leads'] });
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Não foi possível concluir a ação');
      }
    },
    [conversation, conversationId, isGroupHeader, applyFloatingCrmPatch, queryClient, commercial, permDenied],
  );

  const handleAddFloatingTag = useCallback(
    async (opts: { tagId?: string; newLabel?: string; newColor?: string }) => {
      setKanbanTagsBusy(true);
      try {
        const body = opts.tagId
          ? { tag_id: opts.tagId }
          : {
              label: opts.newLabel?.trim() ?? '',
              ...(opts.newColor?.trim() ? { color: opts.newColor.trim() } : {}),
            };
        const res = await chatService.addConversationKanbanTag(conversationId, body);
        const tag: ChatKanbanTagUi = res.tag;
        const cur = resolveChatKanbanTagsForUi(conversation);
        const next = cur.some((t) => t.id === tag.id) ? cur : [...cur, tag];
        if (shouldUseChatDomainStore()) {
          applyStoreConversationPartialPatch(conversationId, {
            tags: next,
            metadata: {
              ...((conversation?.metadata && typeof conversation.metadata === 'object'
                ? conversation.metadata
                : {}) as Record<string, unknown>),
              kanban_tags: next.map((t) => ({ id: t.id, label: t.label, color: t.color })),
            },
          } as Partial<ChatConversation>);
        }
        patchConversationKanbanTagsEverywhere(queryClient, conversationId, next);
        setTenantKanbanTagsCatalog((prev) =>
          prev.some((t) => t.id === tag.id)
            ? prev
            : [...prev, tag].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
        );
        toast.success('Tag adicionada');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível adicionar a tag');
        throw e;
      } finally {
        setKanbanTagsBusy(false);
      }
    },
    [conversationId, conversation, queryClient],
  );

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

  const changePreparedInstance = useCallback(
    async (nextInstanceId: string) => {
      if (!nextInstanceId || nextInstanceId === selectedInstanceId || messages.length > 0) return;
      try {
        const updated = await chatService.patchPreparedConversationInstance(conversationId, nextInstanceId);
        if (shouldUseChatDomainStore()) {
          applyStoreConversationPartialPatch(conversationId, updated);
        } else {
          queryClient.setQueryData(['floating-chat', 'conversation-meta', conversationId], updated);
        }
        invalidateFloatingChatCrmSurfaces(queryClient, conversationId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível alterar a instância');
      }
    },
    [conversationId, messages.length, queryClient, selectedInstanceId],
  );

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
        <div className="relative shrink-0">
          <Avatar className="h-7 w-7 shrink-0 border border-border/50" draggable={false}>
            {identity.avatarUrl ? (
              <AvatarImage src={identity.avatarUrl} alt="" className="object-cover" />
            ) : null}
            <AvatarFallback className="bg-primary/15 text-[10px] font-medium text-primary">
              {identity.initials}
            </AvatarFallback>
          </Avatar>
          {!isGroupHeader && !conversation?.client_id ? (
            (conversation?.leadId
              ? commercial.canConvertLeadToClient
              : commercial.canCreateLeadFromChat) ? (
              <Button
                type="button"
                variant="default"
                size="icon"
                className="absolute -bottom-1 -left-1 z-[1] h-4 w-4 rounded-full border-2 border-background p-0 shadow-md"
                title={conversation?.leadId ? 'Converter para cliente' : 'Adicionar como lead'}
                aria-label={
                  conversation?.leadId ? 'Converter lead para cliente' : 'Adicionar como lead'
                }
                draggable={false}
                onClick={handleFloatingCrmAvatarPlus}
              >
                <Plus className="h-2.5 w-2.5 text-primary-foreground" />
              </Button>
            ) : null
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <button
              type="button"
              className="min-w-0 truncate text-left text-[13px] font-semibold leading-tight hover:underline"
              onClick={() => toggleCompactProfile(conversationId)}
            >
              {identity.displayName}
            </button>
            <Badge variant="outline" className="h-4 shrink-0 px-1 py-0 text-[9px] font-normal">
              {crmBadgeLabel(conversation)}
            </Badge>
            {(() => {
              const m = floatingAttendanceRowModel(conversation);
              if (!m) return null;
              if (m.kind === 'assignee') {
                return (
                  <Badge
                    variant="default"
                    className="h-4 max-w-[min(9rem,42vw)] shrink-0 gap-0.5 px-1 py-0 pr-1 text-[9px] font-normal"
                    title={conversation?.assignee_display?.trim() ?? undefined}
                  >
                    <ChatAssigneePresence
                      displayName={conversation?.assignee_display?.trim() || m.shortName}
                      avatarUrl={m.avatarUrl}
                      shortName={m.shortName}
                      size="xs"
                      headphonesClassName="opacity-90 text-primary-foreground"
                      avatarClassName="border-primary-foreground/25"
                      fallbackClassName="bg-primary/30 text-primary-foreground"
                      nameClassName="text-[9px] text-primary-foreground"
                    />
                  </Badge>
                );
              }
              return (
                <Badge variant="outline" className="h-4 shrink-0 px-1 py-0 text-[9px] font-normal">
                  {m.label}
                </Badge>
              );
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
          {!isGroupHeader ? (
            <div className="mt-0.5 flex max-w-full flex-wrap items-center gap-1">
              {headerTags.map((tag) => (
                <ChatKanbanTagBadge
                  key={tag.id}
                  label={tag.label}
                  color={tag.color}
                  className="max-w-[min(100px,32vw)]"
                />
              ))}
              <ChatKanbanTagQuickPicker
                tenantOptions={tenantKanbanTagsCatalog}
                tenantLoading={tenantKanbanTagsLoading}
                busy={kanbanTagsBusy}
                conversationKanbanTags={headerTags}
                onAddTag={handleAddFloatingTag}
              />
            </div>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          draggable={false}
          title={compactProfileOpen ? 'Ocultar perfil' : 'Ver perfil'}
          onClick={() => toggleCompactProfile(conversationId)}
        >
          <Info className="h-3.5 w-3.5" />
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
      {compactProfileOpen && !appointmentPanelOpen ? (
        <FloatingCompactProfile conversationId={conversationId} conversation={conversation} />
      ) : null}
      {appointmentPanelOpen ? (
        <ChatAppointmentSchedulePanel
          variant="floating"
          conversationId={conversationId}
          contactLabel={identity.displayName?.trim() || 'cliente'}
          onBack={() => closeAppointmentPanel(conversationId)}
          onSuccess={() => {
            void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'messages', conversationId] });
          }}
        />
      ) : (
      <ChatComposerDropZone
        disabled={!canChatReply() || isMobile}
        className="flex min-h-0 min-w-0 flex-1 flex-col"
        onSendImageFile={(f) => void sendFloatingImageFile(f)}
        onSendDocumentFile={(f) => void sendFloatingDocumentFile(f)}
      >
      <div
        ref={scrollRef}
        onScroll={messageVirtual.onScroll}
        draggable
        title="Arrastar conversa para o Kanban"
        onDragStart={(e) => {
          const t = e.target;
          if (
            t instanceof Element &&
            t.closest(
              '[data-chat-image-preview], button, a, input, textarea, select, audio, video, [contenteditable="true"]',
            )
          ) {
            // Evita drag da conversa (e abertura da URL da imagem numa nova aba no Chrome).
            e.preventDefault();
            return;
          }
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
          'touch-pan-y [&_img]:max-h-[min(200px,38dvh)] [&_img]:w-auto [&_img]:max-w-full [&_img]:rounded-md [&_img]:object-contain [&_img]:[-webkit-user-drag:none]',
        )}
      >
        <div className="space-y-1.5 px-2 py-1.5">
          {isLoading && messages.length === 0 ? (
            <MessageListSkeleton className="py-2" />
          ) : isEmptyLeadConversation ? (
            <div className="flex min-h-[210px] flex-col items-center justify-center px-4 py-8 text-center">
              <Avatar className="mb-3 h-12 w-12 border border-border/70">
                {identity.avatarUrl ? <AvatarImage src={identity.avatarUrl} alt="" /> : null}
                <AvatarFallback>{identity.initials}</AvatarFallback>
              </Avatar>
              <Badge variant="secondary" className="mb-2">Lead</Badge>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Nova conversa com Lead</p>
              <p className="mt-1 text-sm font-semibold text-foreground">Conversa ainda não iniciada</p>
              <p className="mt-1 max-w-[240px] text-xs text-muted-foreground">
                Envie a primeira mensagem pelo WhatsApp para iniciar o atendimento.
              </p>
              {connectedInstances.length === 0 ? (
                <div className="mt-4 rounded-lg border border-dashed border-border bg-background p-3 text-xs text-muted-foreground">
                  <p>Nenhuma instância WhatsApp conectada.</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2 h-8"
                    onClick={() => navigate('/superadmin/conexoes/uazapi')}
                  >
                    Conectar WhatsApp
                  </Button>
                </div>
              ) : null}
            </div>
          ) : messages.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">Sem mensagens.</p>
          ) : (
            <VirtualizedMessageList
              messages={messages}
              virtual={messageVirtual}
              itemGapClassName="pb-1.5"
              legacyListClassName="w-full min-w-0"
              legacyInnerClassName="space-y-1.5"
              loadMore={{
                visible: loadMoreMessages.canLoadMore,
                loading: loadMoreMessages.isLoadingMore,
                disabled: !loadMoreMessages.enabled,
                onLoadMore: () => {
                  void loadMoreMessages.loadMore(scrollRef.current);
                },
              }}
              renderMessage={(message) => (
                <div
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
              )}
            />
          )}
        </div>
      </div>
      <div className="floating-chat-window-composer shrink-0 border-t border-neutral-200 bg-white px-2 py-1.5 dark:border-slate-800 dark:bg-slate-950">
        {isEmptyLeadConversation && connectedInstances.length > 1 ? (
          <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="shrink-0">Enviar por:</span>
            <Select value={selectedInstanceId} onValueChange={(v) => void changePreparedInstance(v)}>
              <SelectTrigger className="h-7 flex-1 text-xs">
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
        <div className="flex items-end gap-1.5">
          {isMobile ? (
            <input
              ref={attachComboInputRef}
              type="file"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,.rar,.ppt,.pptx"
              className="hidden"
              onChange={handleAttachComboChange}
            />
          ) : null}
          <ChatComposerQuickActionsPanel
            sections={floatingComposerSections}
            density="compact"
            triggerLabel="Ações rápidas"
            headerTitle="Ações rápidas"
            contentClassName="z-[95]"
            side="top"
            align="start"
          />
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
            placeholder={isEmptyLeadConversation ? "Digite a primeira mensagem..." : "Mensagem…"}
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
            disabled={!draft.trim() || (isEmptyLeadConversation && connectedInstances.length === 0)}
            onClick={() => submitFloating()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        ) : (
          <p className="px-2 py-2 text-xs text-muted-foreground dark:text-slate-400">{permDenied}</p>
        )}
      </div>
      </ChatComposerDropZone>
      )}
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
      <AlertDialog open={meetNowConfirmOpen} onOpenChange={setMeetNowConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Criar reunião com Meet agora?</AlertDialogTitle>
            <AlertDialogDescription>
              Será criado um compromisso imediato com Google Meet e o link será enviado nesta conversa. É
              necessário ter o Google Agenda conectado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={meetNowSubmitting}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              disabled={meetNowSubmitting}
              onClick={(e) => {
                e.preventDefault();
                void handleFloatingMeetNowConfirmed();
              }}
            >
              {meetNowSubmitting ? 'A criar…' : 'Criar e enviar link'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
