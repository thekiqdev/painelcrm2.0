import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useModulePermissions } from '@/contexts/ModulePermissionsContext';
import { chatCommercialGates } from '@/utils/chatCommercialGates';
import {
  ProfileFieldEditor,
  type ChatProfileFieldKey,
  type ChatProfileFieldRow,
} from '@/components/chat/ChatContactProfileSheet';
import {
  ChatProfileContactCompactList,
  ChatProfileFinancialSummaryBlock,
  ChatProfileIdentitySummaryHeader,
} from '@/components/chat/ChatContactProfileSummary';
import { ChatContactInvoiceHistorySection } from '@/components/chat/ChatContactInvoiceHistorySection';
import {
  buildClientFinanceHubFromChat,
  buildClientProfileStateFromChat,
} from '@/utils/clientProfileNavigation';
import { clientsService, type Client } from '@/services/clients';
import { normalizeBrazilTaxIdInput } from '@/utils/brazilTaxId';
import { useQuery } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { chatService, type ChatConversation, type ChatKanbanTagUi } from '@/services/chat';
import { chatKanbanService } from '@/services/chatKanban';
import { tasksService } from '@/services/tasks';
import { useFloatingConversationIdentity } from './useFloatingConversationIdentity';
import { chatAvatarUrlForImgSrc } from '@/lib/chatAvatarUrl';
import { assigneeInitials } from '@/utils/chatKanbanCardDisplay';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Users,
  Shield,
  Info,
  UserCircle,
  FileText,
  Receipt,
  FileSignature,
  CalendarDays,
  ListTodo,
  Plus,
  Tag,
  X,
  ChevronLeft,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/sonner';
import CustomerInvoiceNew from '@/pages/CustomerInvoiceNew';
import ProposalCreateForm from '@/components/proposals/ProposalCreateForm';
import { ContractCreateForm } from '@/components/contracts/ContractCreateForm';
import { ChatGroupProfilePanel } from '@/components/chat/ChatGroupProfilePanel';
import { ChatKanbanTagBadge } from '@/components/chat/ChatKanbanTagBadge';
import { ChatKanbanTagQuickPicker } from '@/components/chat/ChatKanbanTagQuickPicker';
import { ChatScheduledMessagesStrip } from '@/components/chat/ChatScheduledMessagesStrip';
import { DEFAULT_CHAT_TAG_COLOR, normalizeHexColor } from '@/lib/chatKanbanTagStyle';
import { patchConversationKanbanTagsEverywhere } from './conversationKanbanTagsCache';
import { FLOATING_COMPACT_ACTION_EVENT } from './dispatchFloatingCompactAction';
import { useFloatingChat } from './floatingChatContext';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { apiClient } from '@/integrations/api/client';
type LeadProfileForConversion = {
  id?: string;
  name?: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
};
const chatActionNotificationDebugEnabled = (() => {
  const env = (import.meta as unknown as { env?: Record<string, unknown> }).env ?? {};
  const raw = env.CHAT_ACTION_NOTIFICATION_DEBUG ?? env.VITE_CHAT_ACTION_NOTIFICATION_DEBUG;
  return String(raw ?? '').trim() === '1';
})();

function debugChatActionNotification(payload: Record<string, unknown>) {
  if (!chatActionNotificationDebugEnabled) return;
  console.log('[chat-action-notification]', payload);
}

export function FloatingCompactProfile({
  conversationId,
  conversation,
}: {
  conversationId: string;
  conversation: ChatConversation | null | undefined;
}) {
  const { hasPermissionKey, canEdit } = useModulePermissions();
  const commercial = useMemo(() => chatCommercialGates(hasPermissionKey), [hasPermissionKey]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const identity = useFloatingConversationIdentity(conversationId, conversation);
  const isGroup =
    conversation?.conversation_type === 'group' || conversation?.external_chat_id?.endsWith('@g.us') === true;

  const { data: group } = useQuery({
    queryKey: ['floating-chat', 'group-compact-profile', conversationId],
    queryFn: () => chatService.getConversationGroupDetails(conversationId),
    enabled: isGroup,
    staleTime: 30_000,
  });
  const { data: crmProfile } = useQuery({
    queryKey: ['floating-chat', 'conversation-crm-profile', conversationId],
    queryFn: () => chatService.getConversationProfile(conversationId),
    enabled: !isGroup,
    staleTime: 30_000,
  });

  const sourceLabel = useMemo(() => {
    if (isGroup) return 'Grupo';
    if (conversation?.client_id) return 'Cliente';
    if (conversation?.leadId) return 'Lead';
    return 'Contato WhatsApp';
  }, [isGroup, conversation?.client_id, conversation?.leadId]);

  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceBillingPreset, setInvoiceBillingPreset] = useState<'one_off' | 'subscription'>('one_off');
  const [proposalOpen, setProposalOpen] = useState(false);
  const [contractOpen, setContractOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [groupManageOpen, setGroupManageOpen] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [kanbanTagsBusy, setKanbanTagsBusy] = useState(false);
  const [profileSurface, setProfileSurface] = useState<'summary' | 'edit'>('summary');
  const [profileSavingKey, setProfileSavingKey] = useState<string | null>(null);
  const [conversationKanbanTags, setConversationKanbanTags] = useState<ChatKanbanTagUi[]>([]);
  const [conversationKanbanTagsLoading, setConversationKanbanTagsLoading] = useState(false);
  const [tenantKanbanTagsCatalog, setTenantKanbanTagsCatalog] = useState<ChatKanbanTagUi[]>([]);
  const [tenantKanbanTagsLoading, setTenantKanbanTagsLoading] = useState(false);
  const { openAppointmentPanel } = useFloatingChat();

  const openSchedulePanel = useCallback(() => {
    if (!hasPermissionKey('chat.schedule_from_chat')) {
      toast.error(commercial.permDenied);
      return;
    }
    if (!conversation?.client_id && !conversation?.leadId) {
      toast.error('Vincule um cliente a esta conversa para agendar um compromisso.');
      return;
    }
    openAppointmentPanel(conversationId);
  }, [
    hasPermissionKey,
    commercial.permDenied,
    conversation?.client_id,
    conversation?.leadId,
    openAppointmentPanel,
    conversationId,
  ]);

  const [taskTitle, setTaskTitle] = useState(() => {
    const base = identity.displayName?.trim() || 'Follow-up';
    return `Follow-up: ${base}`;
  });
  const [taskDueDate, setTaskDueDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [taskDesc, setTaskDesc] = useState('');

  const isClient = !isGroup && Boolean(conversation?.client_id);
  const isLeadOnly = !isGroup && !conversation?.client_id && Boolean(conversation?.leadId);
  const applyConversationCrmPatch = useCallback(
    (patch: Partial<ChatConversation>) => {
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
        const prev = map[conversationId];
        if (!prev) continue;
        queryClient.setQueryData<Record<string, ChatConversation | null>>(key, {
          ...map,
          [conversationId]: { ...prev, ...patch },
        });
      }
    },
    [queryClient, conversationId],
  );
  const openOnlyWhenClient = useCallback((actionName: string, cb: () => void) => {
    if (!conversation?.client_id) {
      toast.info(`${actionName} requer cliente vinculado. Crie ou vincule um cliente primeiro.`);
      return;
    }
    cb();
  }, [conversation?.client_id]);

  const handleConvertLeadToClient = useCallback(async () => {
    if (!commercial.canConvertLeadToClient) {
      toast.error(commercial.permDenied);
      return;
    }
    if (!isLeadOnly || crmProfile?.type !== 'lead' || !crmProfile.profile) {
      toast.info('Lead não disponível para conversão.');
      return;
    }
    try {
      const lead = crmProfile.profile as LeadProfileForConversion;
      if (!lead.id) {
        toast.info('Lead inválido para conversão.');
        return;
      }
      const { addClient } = await import('@/utils/clients-helpers');
      const clientResult = await addClient({
        name: lead.name,
        company: lead.company || undefined,
        email: lead.email || undefined,
        phone: lead.phone || conversation?.phoneNumber || undefined,
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
      applyConversationCrmPatch({
        client_id: createdClientId,
        leadId: null,
      });
      toast.success('Lead convertido para cliente');
      void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'conversation-crm-profile', conversationId] });
      void queryClient.invalidateQueries({ queryKey: ['floating-chat'] });
      void queryClient.invalidateQueries({ queryKey: ['clients', 'list'] });
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
      debugChatActionNotification({
        source: 'floating_chat',
        action: 'convert_lead',
        entityId: lead.id,
        conversationId,
        notificationCreated: false,
        deduped: false,
        reason: 'crm_link_updated',
      });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível converter o lead');
      debugChatActionNotification({
        source: 'floating_chat',
        action: 'convert_lead',
        entityId: null,
        conversationId,
        notificationCreated: false,
        deduped: false,
        reason: e instanceof Error ? e.message : 'unknown_error',
      });
    }
  }, [
    commercial,
    isLeadOnly,
    crmProfile,
    conversation?.phoneNumber,
    queryClient,
    applyConversationCrmPatch,
    conversationId,
  ]);

  const handleCreateLeadAndLink = useCallback(async () => {
    if (!commercial.canCreateLeadFromChat) {
      toast.error(commercial.permDenied);
      return;
    }
    if (isGroup || !conversation) return;
    try {
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
      applyConversationCrmPatch(updated);
      toast.success('Lead criado e vinculado');
      void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'conversation-crm-profile', conversationId] });
      void queryClient.invalidateQueries({ queryKey: ['floating-chat'] });
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível criar lead');
    }
  }, [commercial, conversationId, conversation, isGroup, applyConversationCrmPatch, queryClient]);

  const handleCreateClientAndLink = useCallback(async () => {
    if (!commercial.canCreateClientFromChat) {
      toast.error(commercial.permDenied);
      return;
    }
    if (isGroup || !conversation) return;
    try {
      const { addClient } = await import('@/utils/clients-helpers');
      const created = await addClient({
        name:
          conversation.contactName ||
          conversation.profileName ||
          conversation.phoneNumber ||
          conversation.external_chat_id ||
          'Contato WhatsApp',
        phone: conversation.phoneNumber || undefined,
        status: 'Ativo',
      });
      const clientId = (created.data as { id?: string } | undefined)?.id;
      if (!created.success || !clientId) throw new Error('Cliente criado sem ID');
      const updated = await chatService.linkConversation(conversationId, { type: 'client', id: clientId });
      applyConversationCrmPatch(updated);
      toast.success('Cliente criado e vinculado');
      void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'conversation-crm-profile', conversationId] });
      void queryClient.invalidateQueries({ queryKey: ['floating-chat'] });
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível criar cliente');
    }
  }, [commercial, conversationId, conversation, isGroup, applyConversationCrmPatch, queryClient]);

  useEffect(() => {
    const onAction = (ev: Event) => {
      const detail = (ev as CustomEvent<{ conversationId?: string; action?: string }>).detail;
      if (!detail || detail.conversationId !== conversationId) return;
      switch (detail.action) {
        case 'invoice':
        case 'invoice_one_off':
          if (!commercial.canCreateInvoiceFromChatFull) {
            toast.error(commercial.permDenied);
            return;
          }
          setInvoiceBillingPreset('one_off');
          return setInvoiceOpen(true);
        case 'invoice_recurring':
          if (!commercial.canCreateInvoiceFromChatFull) {
            toast.error(commercial.permDenied);
            return;
          }
          setInvoiceBillingPreset('subscription');
          return setInvoiceOpen(true);
        case 'proposal':
          if (!commercial.canCreateProposalFromChatFull) {
            toast.error(commercial.permDenied);
            return;
          }
          return setProposalOpen(true);
        case 'contract':
          if (!commercial.canCreateContractFromChatFull) {
            toast.error(commercial.permDenied);
            return;
          }
          return openOnlyWhenClient('Contrato', () => setContractOpen(true));
        case 'schedule':
        case 'meet_later':
          return openSchedulePanel();
        case 'task':
          return setTaskOpen(true);
        case 'group_manage':
          return setGroupManageOpen(true);
        case 'convert_lead':
          return void handleConvertLeadToClient();
        case 'create_client':
          if (!commercial.canCreateClientFromChat) {
            toast.error(commercial.permDenied);
            return;
          }
          return void handleCreateClientAndLink();
        case 'create_lead':
          if (!commercial.canCreateLeadFromChat) {
            toast.error(commercial.permDenied);
            return;
          }
          return void handleCreateLeadAndLink();
        default:
          return;
      }
    };
    window.addEventListener(FLOATING_COMPACT_ACTION_EVENT, onAction);
    return () => window.removeEventListener(FLOATING_COMPACT_ACTION_EVENT, onAction);
  }, [
    conversationId,
    navigate,
    commercial,
    handleConvertLeadToClient,
    openOnlyWhenClient,
    handleCreateClientAndLink,
    handleCreateLeadAndLink,
    openSchedulePanel,
  ]);

  const isUnlinked = !isGroup && !conversation?.client_id && !conversation?.leadId;

  useEffect(() => {
    setProfileSurface('summary');
  }, [conversationId, conversation?.client_id, conversation?.leadId]);

  const profileKind = useMemo((): 'client' | 'lead' | 'unlinked' => {
    if (!conversation) return 'unlinked';
    if (conversation.client_id) return 'client';
    if (conversation.leadId) return 'lead';
    return 'unlinked';
  }, [conversation?.client_id, conversation?.leadId]);

  const profileFields = useMemo((): ChatProfileFieldRow[] => {
    if (!conversation || isGroup) return [];
    const phoneDisplay =
      (identity.phoneLine && identity.phoneLine.trim()) ||
      conversation.phoneNumber ||
      (conversation as { canonicalPhone?: string }).canonicalPhone ||
      (conversation as { canonical_phone?: string }).canonical_phone ||
      null;
    const lastInteractionLabel = conversation.lastMessageAt
      ? formatDistanceToNow(new Date(conversation.lastMessageAt), { addSuffix: true, locale: ptBR })
      : 'Sem mensagens recentes';

    if (crmProfile?.type === 'client' && crmProfile.profile) {
      const contact = crmProfile.profile as Client;
      return [
        { key: 'name', label: 'Nome', value: (contact.name || '').trim() || null, editable: true },
        {
          key: 'phone',
          label: 'Telefone',
          value: (contact.phone || phoneDisplay || '').trim() || null,
          editable: true,
        },
        { key: 'email', label: 'E-mail', value: contact.email?.trim() || null, editable: true },
        {
          key: 'cpf_cnpj',
          label: 'CPF/CNPJ',
          value: contact.cpf_cnpj?.trim() || null,
          editable: true,
        },
        {
          key: 'company',
          label: 'Empresa',
          value: contact.company?.trim() || null,
          editable: true,
        },
        {
          key: 'source',
          label: 'Origem',
          value: contact.source?.trim() || null,
          editable: true,
        },
        { key: 'lastInteraction', label: 'Última interação', value: lastInteractionLabel, editable: false },
      ];
    }

    if (crmProfile?.type === 'lead' && crmProfile.profile) {
      const lead = crmProfile.profile as {
        id?: string;
        name?: string;
        phone?: string | null;
        email?: string | null;
        company?: string | null;
        source?: string | null;
        cpf_cnpj?: string | null;
      };
      const leadCpf = typeof lead.cpf_cnpj === 'string' ? lead.cpf_cnpj.trim() : '';
      const rows: ChatProfileFieldRow[] = [
        { key: 'name', label: 'Nome', value: (lead.name || '').trim() || null, editable: true },
        {
          key: 'phone',
          label: 'Telefone',
          value: (lead.phone || phoneDisplay || '').trim() || null,
          editable: true,
        },
        { key: 'email', label: 'E-mail', value: lead.email?.trim() || null, editable: true },
      ];
      if (leadCpf) {
        rows.push({ key: 'cpf_cnpj', label: 'CPF/CNPJ', value: leadCpf, editable: true });
      }
      rows.push(
        { key: 'company', label: 'Empresa', value: lead.company?.trim() || null, editable: true },
        { key: 'source', label: 'Origem', value: lead.source?.trim() || null, editable: true },
        { key: 'lastInteraction', label: 'Última interação', value: lastInteractionLabel, editable: false },
      );
      return rows;
    }

    return [
      {
        key: 'name',
        label: 'Nome',
        value: identity.displayName && identity.displayName !== '—' ? identity.displayName : null,
        editable: false,
      },
      { key: 'phone', label: 'Telefone', value: phoneDisplay, editable: false },
      { key: 'lastInteraction', label: 'Última interação', value: lastInteractionLabel, editable: false },
    ];
  }, [conversation, isGroup, crmProfile, identity.displayName, identity.phoneLine]);

  const canEditChatFields = useMemo(
    () =>
      Boolean(crmProfile?.type === 'client' && crmProfile.profile && canEdit('clients')) ||
      Boolean(
        crmProfile?.type === 'lead' && crmProfile.profile && !conversation?.client_id && canEdit('leads'),
      ),
    [crmProfile, conversation?.client_id, canEdit],
  );

  const clientSinceLabelFloating = useMemo(() => {
    if (profileKind !== 'client' || !crmProfile?.profile) return null;
    const created = (crmProfile.profile as Client).created_at;
    if (!created) return null;
    try {
      return format(parseISO(created), "d 'de' MMM 'de' yyyy", { locale: ptBR });
    } catch {
      return null;
    }
  }, [profileKind, crmProfile]);

  const handleSaveFloatingProfileField = useCallback(
    async (key: ChatProfileFieldKey, value: string) => {
      if (!crmProfile?.profile) return;
      setProfileSavingKey(key);
      try {
        if (crmProfile.type === 'client') {
          const clientId = (crmProfile.profile as Client).id;
          const patch: Partial<Client> = {};
          if (key === 'name') patch.name = value;
          else if (key === 'email') patch.email = value;
          else if (key === 'phone') patch.phone = value;
          else if (key === 'cpf_cnpj') patch.cpf_cnpj = value ? normalizeBrazilTaxIdInput(value) : null;
          else if (key === 'company') patch.company = value;
          else if (key === 'source') patch.source = value;
          const updated = await clientsService.updateClient(clientId, patch);
          void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'conversation-crm-profile', conversationId] });
          void queryClient.invalidateQueries({ queryKey: ['clients'] });
          void queryClient.invalidateQueries({ queryKey: ['client-financial-summary', updated.id] });
          toast.success('Dados atualizados');
        } else if (crmProfile.type === 'lead') {
          const leadId = (crmProfile.profile as { id?: string }).id;
          if (!leadId) throw new Error('Lead inválido');
          const body: Record<string, unknown> = {};
          if (key === 'name') body.name = value;
          else if (key === 'email') body.email = value;
          else if (key === 'phone') body.phone = value;
          else if (key === 'company') body.company = value;
          else if (key === 'source') body.source = value;
          else if (key === 'cpf_cnpj') body.cpf_cnpj = value ? normalizeBrazilTaxIdInput(value) : null;
          await apiClient.patch(`/api/leads/${leadId}`, body);
          void queryClient.invalidateQueries({ queryKey: ['floating-chat', 'conversation-crm-profile', conversationId] });
          void queryClient.invalidateQueries({ queryKey: ['leads'] });
          toast.success('Dados atualizados');
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erro ao guardar');
        throw e;
      } finally {
        setProfileSavingKey(null);
      }
    },
    [crmProfile, conversationId, queryClient],
  );

  useEffect(() => {
    if (!conversationId || isGroup) {
      setConversationKanbanTags([]);
      return;
    }
    let cancelled = false;
    setConversationKanbanTagsLoading(true);
    void chatService
      .getConversationKanbanTags(conversationId)
      .then((r) => {
        if (!cancelled) setConversationKanbanTags(r.tags);
      })
      .catch(() => {
        if (!cancelled) setConversationKanbanTags([]);
      })
      .finally(() => {
        if (!cancelled) setConversationKanbanTagsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, isGroup]);

  useEffect(() => {
    if (isGroup) {
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
  }, [isGroup]);

  const handleAddConversationTag = useCallback(
    async (opts: { tagId?: string; newLabel?: string; newColor?: string }) => {
      if (!conversationId) return;
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
        setConversationKanbanTags((prev) => {
          if (prev.some((t) => t.id === tag.id)) return prev;
          const next = [...prev, tag];
          patchConversationKanbanTagsEverywhere(queryClient, conversationId, next);
          return next;
        });
        setTenantKanbanTagsCatalog((prev) => {
          if (prev.some((t) => t.id === tag.id)) return prev;
          return [...prev, tag].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
        });
        toast.success('Tag adicionada');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível adicionar a tag');
        throw e;
      } finally {
        setKanbanTagsBusy(false);
      }
    },
    [conversationId, queryClient],
  );

  const handleRemoveConversationTag = useCallback(
    async (tagId: string) => {
      if (!conversationId) return;
      setKanbanTagsBusy(true);
      try {
        await chatService.removeConversationKanbanTag(conversationId, tagId);
        setConversationKanbanTags((prev) => {
          const next = prev.filter((t) => t.id !== tagId);
          patchConversationKanbanTagsEverywhere(queryClient, conversationId, next);
          return next;
        });
        toast.success('Tag removida');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não foi possível remover a tag');
      } finally {
        setKanbanTagsBusy(false);
      }
    },
    [conversationId, queryClient],
  );

  const handleCreateTask = async () => {
    try {
      setSavingTask(true);
      await tasksService.createTask({
        title: taskTitle.trim() || 'Nova tarefa',
        description: taskDesc.trim() || '',
        date: taskDueDate || null,
        time: null,
        status: 'pending',
        priority: 'medium',
        clientId: conversation?.client_id ?? null,
        client: isClient ? identity.displayName : null,
        deal: null,
        assignee: null,
        checklist: [],
      });
      toast.success('Tarefa criada');
      setTaskOpen(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Falha ao criar tarefa');
    } finally {
      setSavingTask(false);
    }
  };

  const QuickAction = ({
    icon,
    label,
    onClick,
    disabled = false,
    title,
  }: {
    icon: ReactNode;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    title?: string;
  }) => (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-8 justify-start gap-1.5 px-2 text-[10px]"
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {icon}
      <span className="truncate">{label}</span>
    </Button>
  );

  const scheduledStrip =
    hasPermissionKey('chat.send_message') ? (
      <ChatScheduledMessagesStrip conversationId={conversationId} density="compact" />
    ) : null;

  return (
    <div
      className="min-h-0 max-h-[min(340px,52dvh)] shrink overflow-y-auto overflow-x-hidden overscroll-contain touch-pan-y border-b border-neutral-200 bg-white/95 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/95"
      data-floating-compact-profile-scroll
    >
      {isGroup ? (
        <>
          <div className="flex items-start gap-2.5">
            <div className="relative shrink-0">
              <Avatar className="h-10 w-10 shrink-0 border border-border/60">
                {identity.avatarUrl ? (
                  <AvatarImage src={chatAvatarUrlForImgSrc(identity.avatarUrl) ?? identity.avatarUrl} alt="" />
                ) : null}
                <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
                  {identity.initials.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="truncate text-xs font-semibold">{identity.displayName}</p>
                <Badge variant="secondary" className="h-4 px-1 py-0 text-[9px] font-normal">
                  {sourceLabel}
                </Badge>
              </div>
              {identity.phoneLine ? (
                <p className="truncate text-[10px] text-muted-foreground">{identity.phoneLine}</p>
              ) : null}
              {conversation?.assignee_display?.trim() ? (
                <p className="flex min-w-0 items-center gap-1.5 truncate text-[10px] text-muted-foreground">
                  <span className="shrink-0">Responsável:</span>
                  <Avatar className="h-4 w-4 shrink-0 border border-border/50">
                    {chatAvatarUrlForImgSrc(conversation.assignee_avatar_url) ? (
                      <AvatarImage
                        src={chatAvatarUrlForImgSrc(conversation.assignee_avatar_url)!}
                        alt=""
                        className="object-cover"
                      />
                    ) : null}
                    <AvatarFallback className="text-[7px] font-semibold">
                      {assigneeInitials(conversation.assignee_display)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 truncate font-medium text-foreground/90">{conversation.assignee_display}</span>
                </p>
              ) : null}
            </div>
          </div>
          {scheduledStrip ? <div className="mt-2">{scheduledStrip}</div> : null}
        </>
      ) : profileSurface === 'edit' ? (
        <div className="space-y-3 py-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-[10px]"
            onClick={() => setProfileSurface('summary')}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Voltar ao resumo
          </Button>
          <section className="rounded-xl border border-border/70 bg-card/80 p-3 shadow-sm dark:bg-slate-900/40">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Informações do contato</p>
            <div className="mt-1 divide-y divide-border/40">
              {profileFields.map((row) => (
                <ProfileFieldEditor
                  key={row.key}
                  row={row}
                  canEdit={canEditChatFields}
                  saving={profileSavingKey === row.key}
                  onSave={canEditChatFields ? handleSaveFloatingProfileField : undefined}
                />
              ))}
            </div>
          </section>
        </div>
      ) : (
        <>
          <ChatProfileIdentitySummaryHeader
            density="floating"
            displayName={identity.displayName || '—'}
            phoneDisplay={identity.phoneLine ?? conversation?.phoneNumber ?? null}
            avatarUrl={identity.avatarUrl ? chatAvatarUrlForImgSrc(identity.avatarUrl) ?? identity.avatarUrl : null}
            initials={identity.initials.slice(0, 2).toUpperCase()}
            kind={profileKind}
            clientSinceLabel={clientSinceLabelFloating ?? undefined}
            showOpenFullProfile={Boolean(conversation?.client_id && commercial.canViewClientNav)}
            onOpenFullProfile={
              conversation?.client_id && commercial.canViewClientNav
                ? () => navigate(`/clients/${conversation.client_id}`)
                : undefined
            }
            canEditProfileFields={canEditChatFields}
            onEdit={() => setProfileSurface('edit')}
            avatarAccessory={
              !conversation?.client_id &&
              (conversation?.leadId ? commercial.canConvertLeadToClient : commercial.canCreateLeadFromChat) ? (
                <Button
                  type="button"
                  variant="default"
                  size="icon"
                  className="absolute -bottom-0.5 -left-0.5 z-[1] h-5 w-5 rounded-full border-2 border-background p-0 shadow-md"
                  title={conversation?.leadId ? 'Converter para cliente' : 'Adicionar como lead'}
                  aria-label={
                    conversation?.leadId ? 'Converter lead para cliente' : 'Adicionar como lead'
                  }
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void (conversation?.leadId ? handleConvertLeadToClient() : handleCreateLeadAndLink());
                  }}
                >
                  <Plus className="h-2.5 w-2.5 text-primary-foreground" />
                </Button>
              ) : undefined
            }
          />
          {conversation?.assignee_display?.trim() ? (
            <p className="mt-2 flex min-w-0 items-center justify-center gap-1.5 truncate px-1 text-[10px] text-muted-foreground">
              <span className="shrink-0">Responsável:</span>
              <Avatar className="h-4 w-4 shrink-0 border border-border/50">
                {chatAvatarUrlForImgSrc(conversation.assignee_avatar_url) ? (
                  <AvatarImage
                    src={chatAvatarUrlForImgSrc(conversation.assignee_avatar_url)!}
                    alt=""
                    className="object-cover"
                  />
                ) : null}
                <AvatarFallback className="text-[7px] font-semibold">
                  {assigneeInitials(conversation.assignee_display)}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 truncate font-medium text-foreground/90">{conversation.assignee_display}</span>
            </p>
          ) : null}
          {scheduledStrip ? <div className="mt-2">{scheduledStrip}</div> : null}
          <div className="mt-3 space-y-3">
            <ChatProfileFinancialSummaryBlock
              clientId={conversation?.client_id ?? null}
              kind={profileKind}
              density="floating"
            />
            <ChatProfileContactCompactList
              profileFields={profileFields}
              headerPhone={identity.phoneLine ?? conversation?.phoneNumber ?? null}
              onEditContact={() => setProfileSurface('edit')}
              canEditProfileFields={canEditChatFields}
            />
            {conversation?.client_id ? (
              <ChatContactInvoiceHistorySection
                clientId={conversation.client_id}
                enabled={Boolean(isClient)}
                onViewAll={
                  commercial.canViewClientNav
                    ? () => {
                        const keys = {
                          id: conversationId,
                          external_chat_id: conversation.external_chat_id ?? '',
                          instance_id: conversation.instance_id ?? '',
                        };
                        navigate(buildClientFinanceHubFromChat(conversation.client_id!, keys), {
                          state: buildClientProfileStateFromChat(keys),
                        });
                      }
                    : undefined
                }
              />
            ) : null}
          </div>
        </>
      )}

      {isGroup ? (
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <Users className="h-3 w-3" />
            <span>{group?.participantCount ?? '—'} participantes</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <Shield className="h-3 w-3" />
            <span>{group?.isAnnounce ? 'Mensagens: só admins' : 'Mensagens: todos'}</span>
          </div>
          {group?.topic ? <p className="line-clamp-2 text-[10px] text-muted-foreground">{group.topic}</p> : null}
          <Button type="button" size="sm" variant="outline" className="mt-1 h-7 text-[10px]" disabled>
            Gerenciar grupo
          </Button>
        </div>
      ) : (conversation?.leadId && commercial.canViewLeadNav) ||
        (!conversation?.client_id &&
          !conversation?.leadId &&
          (commercial.canCreateClientFromChat || commercial.canCreateLeadFromChat)) ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {conversation?.leadId && commercial.canViewLeadNav ? (
            <Button type="button" size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => navigate('/leads')}>
              Ver lead
            </Button>
          ) : null}
          {!conversation?.client_id && !conversation?.leadId && commercial.canCreateClientFromChat ? (
            <Button type="button" size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => void handleCreateClientAndLink()}>
              <UserCircle className="mr-1 h-3 w-3" />
              Criar cliente
            </Button>
          ) : null}
          {!conversation?.client_id && !conversation?.leadId && commercial.canCreateLeadFromChat ? (
            <Button type="button" size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => void handleCreateLeadAndLink()}>
              <UserCircle className="mr-1 h-3 w-3" />
              Criar lead
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-2.5">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Ações rápidas</p>
        <div className="grid grid-cols-2 gap-1.5">
          {!isGroup && isClient ? (
            <>
              <QuickAction
                icon={<Receipt className="h-3.5 w-3.5" />}
                label="Fatura"
                disabled={!commercial.canCreateInvoiceFromChatFull}
                title={!commercial.canCreateInvoiceFromChatFull ? commercial.permDenied : undefined}
                onClick={() => setInvoiceOpen(true)}
              />
              <QuickAction
                icon={<FileText className="h-3.5 w-3.5" />}
                label="Proposta"
                disabled={!commercial.canCreateProposalFromChatFull}
                title={!commercial.canCreateProposalFromChatFull ? commercial.permDenied : undefined}
                onClick={() => setProposalOpen(true)}
              />
              <QuickAction
                icon={<FileSignature className="h-3.5 w-3.5" />}
                label="Contrato"
                disabled={!commercial.canCreateContractFromChatFull}
                title={!commercial.canCreateContractFromChatFull ? commercial.permDenied : undefined}
                onClick={() => openOnlyWhenClient('Contrato', () => setContractOpen(true))}
              />
              <QuickAction
                icon={<CalendarDays className="h-3.5 w-3.5" />}
                label="Agenda"
                disabled={!hasPermissionKey('chat.schedule_from_chat')}
                title={!hasPermissionKey('chat.schedule_from_chat') ? commercial.permDenied : undefined}
                onClick={openSchedulePanel}
              />
              <QuickAction icon={<ListTodo className="h-3.5 w-3.5" />} label="Tarefa" onClick={() => setTaskOpen(true)} />
            </>
          ) : null}

          {!isGroup && isLeadOnly ? (
            <>
              <QuickAction
                icon={<UserCircle className="h-3.5 w-3.5" />}
                label="Converter para cliente"
                disabled={!commercial.canConvertLeadToClient}
                title={!commercial.canConvertLeadToClient ? commercial.permDenied : undefined}
                onClick={() => void handleConvertLeadToClient()}
              />
              <QuickAction
                icon={<FileText className="h-3.5 w-3.5" />}
                label="Proposta"
                disabled={!commercial.canCreateProposalFromChatFull}
                title={!commercial.canCreateProposalFromChatFull ? commercial.permDenied : undefined}
                onClick={() => setProposalOpen(true)}
              />
              <QuickAction
                icon={<CalendarDays className="h-3.5 w-3.5" />}
                label="Agenda"
                disabled={!hasPermissionKey('chat.schedule_from_chat')}
                title={!hasPermissionKey('chat.schedule_from_chat') ? commercial.permDenied : undefined}
                onClick={openSchedulePanel}
              />
              <QuickAction icon={<ListTodo className="h-3.5 w-3.5" />} label="Tarefa" onClick={() => setTaskOpen(true)} />
            </>
          ) : null}

          {!isGroup && isUnlinked ? (
            <>
              <QuickAction icon={<FileText className="h-3.5 w-3.5" />} label="Proposta" onClick={() => toast.info('Vincule cliente/lead antes de criar proposta.')} />
              <QuickAction
                icon={<CalendarDays className="h-3.5 w-3.5" />}
                label="Agenda"
                disabled={!hasPermissionKey('chat.schedule_from_chat')}
                title={!hasPermissionKey('chat.schedule_from_chat') ? commercial.permDenied : undefined}
                onClick={openSchedulePanel}
              />
              <QuickAction icon={<ListTodo className="h-3.5 w-3.5" />} label="Tarefa" onClick={() => setTaskOpen(true)} />
            </>
          ) : null}

          {isGroup ? (
            <>
              <QuickAction icon={<Shield className="h-3.5 w-3.5" />} label="Gerenciar grupo" onClick={() => setGroupManageOpen(true)} />
              <QuickAction
                icon={<CalendarDays className="h-3.5 w-3.5" />}
                label="Agenda"
                disabled={!hasPermissionKey('chat.schedule_from_chat')}
                title={!hasPermissionKey('chat.schedule_from_chat') ? commercial.permDenied : undefined}
                onClick={openSchedulePanel}
              />
              <QuickAction icon={<ListTodo className="h-3.5 w-3.5" />} label="Tarefa" onClick={() => setTaskOpen(true)} />
            </>
          ) : null}
        </div>
      </div>

      {!isGroup ? (
        <div className="mt-2.5 rounded-xl border border-border/70 bg-card/80 p-2.5">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Tag className="h-3.5 w-3.5 shrink-0" />
              <span>Tags</span>
            </div>
            <ChatKanbanTagQuickPicker
              tenantOptions={tenantKanbanTagsCatalog}
              tenantLoading={tenantKanbanTagsLoading}
              busy={kanbanTagsBusy}
              conversationKanbanTags={conversationKanbanTags}
              onAddTag={handleAddConversationTag}
              triggerClassName="h-6 w-6"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {conversationKanbanTagsLoading ? (
              <span className="text-[11px] italic text-muted-foreground">A carregar…</span>
            ) : conversationKanbanTags.length === 0 ? (
              <span className="text-[11px] italic text-muted-foreground">Sem tags</span>
            ) : (
              conversationKanbanTags.map((t) => (
                <span key={t.id} className="inline-flex max-w-full items-center gap-0.5">
                  <ChatKanbanTagBadge label={t.label} color={t.color} className="max-w-[min(160px,50vw)] pr-1" />
                  <button
                    type="button"
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                    disabled={kanbanTagsBusy}
                    onClick={() => void handleRemoveConversationTag(t.id)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))
            )}
          </div>
        </div>
      ) : null}

      <Separator className="mt-2.5" />
      <div className="mt-1 flex items-center gap-1 text-[9px] text-muted-foreground">
        <Info className="h-3 w-3" />
        <span>Perfil compacto da conversa</span>
      </div>

      <Dialog
        open={invoiceOpen}
        onOpenChange={(o) => {
          setInvoiceOpen(o);
          if (!o) setInvoiceBillingPreset('one_off');
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Nova fatura</DialogTitle>
          </DialogHeader>
          <CustomerInvoiceNew
            key={`fa-${invoiceBillingPreset}`}
            embedded
            embeddedBillingPreset={invoiceBillingPreset}
            initialClientId={conversation?.client_id ?? null}
            onBack={() => {
              setInvoiceOpen(false);
              setInvoiceBillingPreset('one_off');
            }}
            onCreated={() => {
              toast.success('Fatura criada');
              setInvoiceOpen(false);
              setInvoiceBillingPreset('one_off');
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={proposalOpen} onOpenChange={setProposalOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Nova proposta</DialogTitle>
          </DialogHeader>
          <ProposalCreateForm
            embedded
            initialClientId={conversation?.client_id ?? null}
            initialLeadId={conversation?.leadId ?? null}
            initialTitle={`Proposta - ${identity.displayName}`}
            onBack={() => setProposalOpen(false)}
            onCreated={() => {
              toast.success('Proposta criada');
              setProposalOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={contractOpen} onOpenChange={setContractOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Novo contrato</DialogTitle>
          </DialogHeader>
          <ContractCreateForm
            embedded
            initialClientId={conversation?.client_id ?? null}
            initialTitleHint={`Contrato - ${identity.displayName}`}
            onBack={() => setContractOpen(false)}
            onCreated={() => {
              toast.success('Contrato criado');
              setContractOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Criar tarefa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input type="date" value={taskDueDate} onChange={(e) => setTaskDueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea rows={2} value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} />
            </div>
            <Button type="button" className="w-full" disabled={savingTask} onClick={() => void handleCreateTask()}>
              {savingTask ? 'A criar…' : 'Criar tarefa'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={groupManageOpen} onOpenChange={setGroupManageOpen}>
        <DialogContent className="max-h-[85dvh] overflow-hidden p-0 sm:max-w-xl">
          <ChatGroupProfilePanel
            open={groupManageOpen}
            onOpenChange={setGroupManageOpen}
            isMobile={false}
            interactionMode="desktop"
            conversationId={conversationId}
            fallbackAvatarUrl={identity.avatarUrl}
            fallbackInitials={identity.initials}
            fallbackTitle={identity.displayName}
            onBackToConversation={() => setGroupManageOpen(false)}
            onDesktopClose={() => setGroupManageOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

