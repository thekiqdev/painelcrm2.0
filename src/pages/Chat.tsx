import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState, useRef } from 'react';
import { useNavigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { addMinutes, format, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from '@/components/ui/sonner';
import {
  RefreshCw,
  Send,
  Search,
  MessageSquare,
  ChevronLeft,
  Plus,
  PanelRight,
  FileText,
  Users,
  CalendarIcon,
  Image as ImageIcon,
  LayoutTemplate,
  UserCheck,
  XCircle,
  Headphones,
  ArrowRightLeft,
  ListFilter,
  Video,
  MoreVertical,
  Reply,
  MessageCircle,
  Copy,
  X,
  StickyNote,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  chatService,
  ChatConversation,
  ChatInstance,
  ChatMessage,
  coerceChatPlainText,
  normalizeChatMessage,
  normalizeConversation,
  normalizeInternalComment,
  parseMediaField,
  type ChatInternalComment,
} from '@/services/chat';
import { useAuth } from '@/contexts/AuthContext';
import { useModulePermissions } from '@/contexts/ModulePermissionsContext';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { ChatWhatsappModelPickerDialog } from '@/components/chat/ChatWhatsappModelPickerDialog';
import {
  buildSlaContextFromDashboard,
  selectChatBadges,
  type OperationalPanelFilter,
  type SlaContextForUi,
  matchesOperationalFilter,
} from '@/lib/chatSlaUi';
import { buildChatInboxTemplateContext } from '@/utils/chatInboxTemplateContext';
import { io, Socket } from 'socket.io-client';
import { apiClient } from '@/integrations/api/client';
import ProposalCreateForm, {
  type ProposalCreateSuccessPayload,
} from '@/components/proposals/ProposalCreateForm';
import { tasksService } from '@/services/tasks';
import { ticketsService } from '@/services/tickets';
import { normalizeBrazilTaxIdInput } from '@/utils/brazilTaxId';
import ContractCreateForm from '@/components/contracts/ContractCreateForm';
import type { Contract } from '@/types/contracts';
import { clientsService, type Client } from '@/services/clients';
import { recordClientTimelineEvent } from '@/services/clientTimeline';
import { messagesService } from '@/services/messages';
import { customerInvoicesService } from '@/services/customerInvoices';
import { buildInvoiceLink } from '@/services/chatFinancialAdapter';
import CustomerInvoiceNew from '@/pages/CustomerInvoiceNew';
import {
  ChatContactProfilePanel,
  ChatContactProfileSheet,
  type ChatProfileFieldKey,
  type ChatProfileFieldRow,
} from '@/components/chat/ChatContactProfileSheet';
import { MobileCommerceScreenLayout } from '@/components/mobile/MobileCommerceScreenLayout';
import { resolveConversationIdentity } from '@/utils/chatIdentityDisplay';
import { CrmIdentityListRow } from '@/components/crm/CrmIdentityListRow';
import {
  buildClientProfileStateFromChat,
  buildClientProfileToFromChat,
  resolveRestoreConversationId,
} from '@/utils/clientProfileNavigation';
import { consumeKanbanProposalColumnContextIfMatch } from '@/utils/kanbanProposalColumnContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { useVisualKeyboardInset } from '@/hooks/useVisualKeyboardInset';
import { cn } from '@/lib/utils';
import {
  communicationProviderBadgeLabel,
  shouldShowCommunicationChannelBadge,
} from '@/lib/communicationChannelUi';
import { isChatClientProfileReturn, isChatListReturnPath } from '@/lib/chatListNavigation';
import { chatAvatarUrlForImgSrc } from '@/lib/chatAvatarUrl';
import {
  logChatRealtimeDuplicateSkipped,
  logChatRealtimeLegacyEventReceived,
  logChatRealtimeSocketConnected,
  logChatRealtimeSocketDisconnected,
  logChatRealtimeV2EventReceived,
} from '@/lib/chatRealtimeDiagnostics';
import { emitChatNavUnreadRefresh } from '@/lib/chatNavUnreadEvents';
import { ChatBubbleContent } from '@/components/chat/ChatBubbleContent';
import { MessageStatusIndicator } from '@/components/chat/MessageStatusIndicator';
import { getMyTenantUsers, type TenantUser } from '@/services/tenantLimits';
import { teamsService, type Team } from '@/services/teams';
import { formatPhoneBrDigits } from '@/lib/brazilInputMasks';

const formatHour = (value?: string | null) => {
  if (!value) return '--:--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

/** Preview de notas CRM no painel lateral (inclui deep link para conversa). */
type CrmNotePreviewRow = {
  id: string;
  note_text: string;
  created_at: string;
  conversation_id: string | null;
  message_id: string | null;
  source_comment_id: string | null;
};

function mapCrmNoteToPreview(n: Record<string, unknown>): CrmNotePreviewRow {
  return {
    id: String(n.id ?? ''),
    note_text: String(n.note_text ?? ''),
    created_at: String(n.created_at ?? ''),
    conversation_id: n.conversation_id != null ? String(n.conversation_id) : null,
    message_id: n.message_id != null ? String(n.message_id) : null,
    source_comment_id: n.source_comment_id != null ? String(n.source_comment_id) : null,
  };
}

function mergeInternalCommentIntoMessage(m: ChatMessage, c: ChatInternalComment): ChatMessage {
  const ex = m.internal_comments ?? [];
  if (ex.some((x) => x.id === c.id)) return m;
  const next = [...ex, c].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  return {
    ...m,
    internal_comments: next,
    internal_comment_count: next.length,
  };
}

const formatRelativeDate = (value?: string | null) => {
  if (!value) return 'Sem data';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem data';
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = now.getTime() - date.getTime();
  const daysDiff = Math.floor((today.getTime() - messageDate.getTime()) / (1000 * 60 * 60 * 24));

  // Menos de 1 minuto
  if (diff < 60_000) return 'Agora mesmo';
  
  // Menos de 1 hora
  if (diff < 3_600_000) {
    const minutes = Math.floor(diff / 60_000);
    return `${minutes} min atrás`;
  }
  
  // Hoje
  if (daysDiff === 0) {
    return `Hoje ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }
  
  // Ontem
  if (daysDiff === 1) {
    return `Ontem ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }
  
  // Esta semana (últimos 7 dias)
  if (daysDiff < 7) {
    return date.toLocaleDateString('pt-BR', { 
      weekday: 'short', 
      day: '2-digit', 
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  // Este ano
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('pt-BR', { 
      day: '2-digit', 
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  // Outro ano
  return date.toLocaleDateString('pt-BR', { 
    day: '2-digit', 
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

/** Etapa 5 — rótulo curto para badge de atendimento (evita confundir com `status` da conversa Uaz). */
/** Compat: backend Fase 5 usa `in_progress`; valores antigos `in_service`. */
const attendanceIsInProgress = (s?: string | null) => s === 'in_progress' || s === 'in_service';

const attendanceStatusLabel = (s?: string | null) => {
  switch (s) {
    case 'open':
    case 'pending':
      return 'Aberto';
    case 'unassigned':
      return 'Sem resp.';
    case 'queued':
      return 'Na fila';
    case 'in_progress':
    case 'in_service':
      return 'Em atendimento';
    case 'waiting_customer':
      return 'Aguardando';
    case 'closed':
      return 'Encerrada';
    case 'archived':
      return 'Arquivada';
    default:
      return null;
  }
};

/** Nome curto do operador (lista / cabeçalho). */
const shortOperatorName = (display?: string | null) => {
  if (!display?.trim()) return '';
  const first = display.trim().split(/\s+/)[0];
  return first.length > 18 ? `${first.slice(0, 16)}…` : first;
};

function readInstanceMetaString(
  metadata: Record<string, unknown> | null | undefined,
  keys: string[],
): string | null {
  for (const k of keys) {
    const v = metadata?.[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/** Telefone da linha conectada formatado (BR; inclui +55 quando o metadata traz código do país). */
function formatConnectedPhoneForDisplay(raw: string | null | undefined): string {
  if (!raw) return '';
  const d = String(raw).replace(/\D/g, '');
  if (d.length === 0) return '';
  if (d.length > 11 && d.startsWith('55')) {
    const local = d.slice(2, 13);
    const formatted = formatPhoneBrDigits(local);
    return formatted ? `+55 ${formatted}` : `+${d}`;
  }
  if (d.length <= 11) {
    return formatPhoneBrDigits(d);
  }
  return `+${d}`;
}

function resolveInstanceConnectionUi(instance: ChatInstance | null): {
  avatarUrl: string | null;
  displayName: string;
  phoneDisplay: string;
} {
  if (!instance) {
    return { avatarUrl: null, displayName: 'Selecione uma instância', phoneDisplay: '' };
  }
  const m = instance.metadata as Record<string, unknown> | null | undefined;
  const pic = readInstanceMetaString(m, [
    'connectedProfilePicUrl',
    'connected_profile_pic_url',
    'profilePicUrl',
    'whatsapp_profile_photo',
  ]);
  const name =
    readInstanceMetaString(m, ['connectedProfileName', 'connected_profile_name', 'profileName']) ||
    instance.external_instance_name ||
    instance.name;
  const phoneRaw = readInstanceMetaString(m, ['connectedPhone', 'connected_phone', 'phone']);
  return {
    avatarUrl: chatAvatarUrlForImgSrc(pic),
    displayName: name,
    phoneDisplay: formatConnectedPhoneForDisplay(phoneRaw || ''),
  };
}

const CHAT_COMPOSER_MAX_HEIGHT_PX = 120;

const Chat = () => {
  const { user, session, profile } = useAuth();
  const { canView, canEdit, canCreate, loading: modulePermLoading } = useModulePermissions();
  const hasAgendaFeature = useFeatureFlag('agenda');
  const canCreateAgendaInChat = hasAgendaFeature && canCreate('agenda') && !modulePermLoading;
  const canCreateProposalsInChat = canCreate('proposals') && !modulePermLoading;
  const canCreateContractsInChat = canCreate('contracts') && !modulePermLoading;
  const canCreateInvoicesInChat = canCreate('billing') && !modulePermLoading;
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const focusMessageIdParam = searchParams.get('focusMessageId')?.trim() ?? '';
  const { conversationId: routeConversationId } = useParams<{ conversationId: string }>();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();

  const [instances, setInstances] = useState<ChatInstance[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [enabledInstanceIds, setEnabledInstanceIds] = useState<Set<string>>(new Set());
  const [filtersPopoverOpen, setFiltersPopoverOpen] = useState(false);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [whatsappModelPickerOpen, setWhatsappModelPickerOpen] = useState(false);
  const [meetNowConfirmOpen, setMeetNowConfirmOpen] = useState(false);
  const [meetNowSubmitting, setMeetNowSubmitting] = useState(false);
  const [scheduleLaterOpen, setScheduleLaterOpen] = useState(false);
  const [scheduleLaterBusy, setScheduleLaterBusy] = useState(false);
  const [schedDay, setSchedDay] = useState<Date>(() => new Date());
  const [schedTime, setSchedTime] = useState('10:00');
  const [schedDuration, setSchedDuration] = useState(60);
  const [schedCreateMeet, setSchedCreateMeet] = useState(true);
  const [schedNote, setSchedNote] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'leads' | 'clients'>('all');
  /** Etapa 5 — inbox partilhada por defeito quando há tenant (evita lista vazia com escopo “equipa”). */
  const [chatInboxScope, setChatInboxScope] = useState<'owner' | 'tenant'>('tenant');
  const [chatAttendanceFilter, setChatAttendanceFilter] = useState<
    '' | 'queue' | 'team' | 'mine' | 'closed' | 'unassigned'
  >('');
  const [attendanceCounts, setAttendanceCounts] = useState({
    queue: 0,
    team: 0,
    mine: 0,
    unassigned: 0,
    closed: 0,
    unread: 0,
  });
  const [operationalPanelFilter, setOperationalPanelFilter] = useState<OperationalPanelFilter>('');
  const [slaUiContext, setSlaUiContext] = useState<SlaContextForUi | null>(null);
  const [operationsRefreshTick, setOperationsRefreshTick] = useState(0);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferUsers, setTransferUsers] = useState<TenantUser[]>([]);
  const [transferTeams, setTransferTeams] = useState<Team[]>([]);
  const [transferTargetId, setTransferTargetId] = useState('');
  const [transferTeamId, setTransferTeamId] = useState('');
  const [transferMode, setTransferMode] = useState<'operator' | 'team'>('operator');
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [contactProfileOpen, setContactProfileOpen] = useState(false);
  const contactProfileOpenRef = useRef(contactProfileOpen);
  useEffect(() => {
    contactProfileOpenRef.current = contactProfileOpen;
  }, [contactProfileOpen]);
  const chatProfileCrmLinkRef = useRef<{ clientId: string | null; leadId: string | null }>({
    clientId: null,
    leadId: null,
  });

  const { data: clientGroupsList = [] } = useQuery({
    queryKey: ['client-groups'],
    queryFn: () => clientsService.getClientGroups(),
    staleTime: 120_000,
    enabled: contactProfileOpen,
  });
  const [attendingConversation, setAttendingConversation] = useState(false);

  const [loadingInstances, setLoadingInstances] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [syncingConversations, setSyncingConversations] = useState(false);
  const [syncingMessages, setSyncingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [currentLead, setCurrentLead] = useState<any | null>(null);
  const [currentClient, setCurrentClient] = useState<any | null>(null);
  const [loadingLead, setLoadingLead] = useState(false);
  const [profileFieldSaving, setProfileFieldSaving] = useState<string | null>(null);
  const [savingClientGroup, setSavingClientGroup] = useState(false);
  const [loadingClient, setLoadingClient] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const documentFileInputRef = useRef<HTMLInputElement>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const socketRef = useRef<Socket | null>(null);
  // Refs para evitar closure stale nos handlers do Socket.IO
  const selectedConversationIdRef = useRef<string | null>(null);
  const enabledInstanceIdsRef = useRef<Set<string>>(new Set());
  type PendingConversationRestore = {
    internalId?: string;
    externalChatId?: string;
    instanceId?: string;
  };
  /** Conversa a reabrir após voltar do perfil (evita race com reload de `enabledInstanceIds`). */
  const pendingConversationRestoreRef = useRef<PendingConversationRestore | null>(null);
  /** Configurações → «Abrir conversa»: aplicado após hidratar instâncias (evita sobrescrita pela seleção automática). */
  const pendingFocusInstanceIdRef = useRef<string | null>(null);
  /** Evita restaurar no primeiro paint com lista vazia e loading=false (race antes do primeiro setLoading(true) aplicar). */
  const conversationsHydratedRef = useRef(false);
  /**
   * `/clients` ou `/leads` quando a conversa foi aberta a partir dessas listas (mobile).
   * Mantém o destino de «voltar» se `location.state` se perder (ex.: botão físico «voltar»).
   */
  const chatCrmListReturnPathRef = useRef<string | null>(null);
  /** `/clients/:id` quando a thread foi aberta a partir do perfil (mobile). */
  const chatClientProfileReturnIdRef = useRef<string | null>(null);
  /** FIFO: um id otimista por envio em voo; o WebSocket remove o mais antigo ao chegar a mensagem real. */
  const pendingOutgoingOptimisticQueueRef = useRef<string[]>([]);
  const [replyingTo, setReplyingTo] = useState<{
    messageId: string;
    preview: string;
    senderName: string;
  } | null>(null);
  const [commentForMessage, setCommentForMessage] = useState<ChatMessage | null>(null);
  const [commentDialogOpen, setCommentDialogOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentAlsoProfile, setCommentAlsoProfile] = useState(false);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [crmNotesPreview, setCrmNotesPreview] = useState<CrmNotePreviewRow[]>([]);
  const [crmNotesLoading, setCrmNotesLoading] = useState(false);
  const [newCrmNoteOpen, setNewCrmNoteOpen] = useState(false);
  const [newCrmNoteText, setNewCrmNoteText] = useState('');
  const [newCrmNoteSaving, setNewCrmNoteSaving] = useState(false);
  const messageRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [flashMessageId, setFlashMessageId] = useState<string | null>(null);
  const [allCommentsDialog, setAllCommentsDialog] = useState<{ messageId: string } | null>(null);
  const [allCommentsDialogLoading, setAllCommentsDialogLoading] = useState(false);
  const [allCommentsDialogItems, setAllCommentsDialogItems] = useState<ChatInternalComment[]>([]);
  /** Evita GET /messages em rajada quando `conversation_updated` chega muitas vezes sem mudar o histórico visível. */
  const conversationUpdatedReloadSigRef = useRef<{
    id: string | null;
    lastAt: string | null;
    preview: string | null;
  }>({ id: null, lastAt: null, preview: null });
  const conversationUpdatedReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const operationsPanelDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Estados para dialogs
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [ticketDialogOpen, setTicketDialogOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkTab, setLinkTab] = useState<'clients' | 'leads'>('clients');
  const [linkSearch, setLinkSearch] = useState('');
  const [leads, setLeads] = useState<any[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [selectedLinkTarget, setSelectedLinkTarget] = useState<{ type: 'client' | 'lead'; id: string } | null>(null);
  const [linkPage, setLinkPage] = useState(1);
  const [viewMode, setViewMode] = useState<
    'conversation' | 'invoice-create' | 'proposal-create' | 'contract-create'
  >('conversation');
  const isMobileConversationView = Boolean(
    isMobile && routeConversationId && viewMode === 'conversation',
  );
  const keyboardInset = useVisualKeyboardInset(
    Boolean(isMobile && routeConversationId && viewMode === 'conversation'),
  );

  useEffect(() => {
    setContactProfileOpen(false);
  }, [selectedConversationId]);

  /** Etapa 3+: quando o Kanban ligar coluna → Chat, passar `initialTemplateProposalId` (rascunho) em `ProposalCreateForm`. */
  const [unlinkConfirmOpen, setUnlinkConfirmOpen] = useState(false);
  
  // Estados para formulários
  const [clients, setClients] = useState<any[]>([]);
  const [ticketCategories, setTicketCategories] = useState<any[]>([]);
  
  const loadInstances = useCallback(async () => {
    setLoadingInstances(true);
    try {
      const data = await chatService.listInstances();
      setInstances(data);
    } catch (error) {
      console.error('Erro ao carregar instâncias:', error);
      toast.error('Erro ao carregar instâncias do WhatsApp', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setLoadingInstances(false);
    }
  }, []);

  const scheduleOperationsPanelRefresh = useCallback(() => {
    if (operationsPanelDebounceRef.current) clearTimeout(operationsPanelDebounceRef.current);
    operationsPanelDebounceRef.current = setTimeout(() => {
      operationsPanelDebounceRef.current = null;
      setOperationsRefreshTick((n) => n + 1);
    }, 550);
  }, []);

  /** Mantém contexto SLA para badges sem renderizar o painel operacional na página de chat. */
  useEffect(() => {
    if (!user?.tenant_id || modulePermLoading || !canView('chat')) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const d = await chatService.getOperationsDashboard();
        if (cancelled) return;
        setSlaUiContext(buildSlaContextFromDashboard(d));
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.tenant_id, modulePermLoading, operationsRefreshTick, canView]);

  useEffect(() => {
    return () => {
      if (operationsPanelDebounceRef.current) {
        clearTimeout(operationsPanelDebounceRef.current);
        operationsPanelDebounceRef.current = null;
      }
    };
  }, []);

  const loadConversations = useCallback(async (instanceIds: string | string[]) => {
    conversationsHydratedRef.current = false;
    setLoadingConversations(true);
    try {
      const ids = Array.isArray(instanceIds) ? instanceIds : [instanceIds];
      const allConversations: ChatConversation[] = [];
      const effectiveInboxScope =
        user?.tenant_id && chatInboxScope === 'tenant' ? 'tenant' : 'owner';
      const attendanceFilterParam = chatAttendanceFilter || undefined;

      const chatListDiag =
        import.meta.env.DEV || import.meta.env.VITE_CHAT_LIST_DIAG === '1';

      // Carregar conversas de todas as instâncias habilitadas
      for (const instanceId of ids) {
        try {
          if (chatListDiag) {
            console.log('[ChatListDiag] frontend request', {
              instanceId,
              inboxScope: effectiveInboxScope,
              attendanceFilter: attendanceFilterParam ?? '(none)',
              activeTab,
              searchTerm: searchTerm.trim() || '(empty)',
            });
          }
          const data = await chatService.getConversations({
            instanceId,
            inboxScope: effectiveInboxScope,
            attendanceFilter: attendanceFilterParam,
          });
          if (chatListDiag) {
            console.log('[ChatListDiag] frontend raw response count', {
              instanceId,
              count: data.length,
            });
          }
          allConversations.push(...data);
        } catch (error) {
          console.error(`Erro ao carregar conversas da instância ${instanceId}:`, error);
        }
      }

      // Remover duplicatas por id da conversa (evita colapsar várias linhas com external_chat_id vazio/repetido)
      const uniqueConversations = Array.from(
        new Map(allConversations.map((conv) => [conv.id, conv])).values()
      ).sort((a, b) => {
        const dateA = a.lastMessageAt || a.created_at || a.updated_at;
        const dateB = b.lastMessageAt || b.created_at || b.updated_at;
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });

      if (chatListDiag) {
        console.log('[ChatListDiag] frontend after merge+dedupe', {
          mergedCount: allConversations.length,
          uniqueCount: uniqueConversations.length,
        });
      }

      setConversations(uniqueConversations);

      try {
        const scope =
          user?.tenant_id && chatInboxScope === 'tenant' ? ('tenant' as const) : ('owner' as const);
        const c = await chatService.getConversationAttendanceCounts({
          instanceIds: ids,
          inboxScope: scope,
        });
        setAttendanceCounts(c);
      } catch {
        /* contagens são auxiliares */
      }
      scheduleOperationsPanelRefresh();
      emitChatNavUnreadRefresh();
    } catch (error) {
      console.error('Erro ao carregar conversas:', error);
      toast.error('Erro ao carregar conversas', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setLoadingConversations(false);
      conversationsHydratedRef.current = true;
    }
  }, [
    user?.tenant_id,
    chatInboxScope,
    chatAttendanceFilter,
    activeTab,
    searchTerm,
    scheduleOperationsPanelRefresh,
  ]);

  const loadMessages = useCallback(
    async (conversationId: string, opts?: { silent?: boolean }) => {
      const silent = opts?.silent === true;
      if (!silent) {
        setLoadingMessages(true);
      }
      try {
        const data = await chatService.getConversationMessages(conversationId);
        if (selectedConversationIdRef.current !== conversationId) {
          return;
        }
        setMessages(data);
      } catch (error) {
        console.error('Erro ao carregar mensagens:', error);
        if (!silent) {
          toast.error('Erro ao carregar mensagens', {
            description: error instanceof Error ? error.message : undefined,
          });
        }
      } finally {
        if (!silent) {
          setLoadingMessages(false);
        }
      }
    },
    [],
  );

  // Atualizar refs quando valores mudarem
  useEffect(() => {
    selectedConversationIdRef.current = selectedConversationId;
    conversationUpdatedReloadSigRef.current = {
      id: selectedConversationId,
      lastAt: null,
      preview: null,
    };
    if (conversationUpdatedReloadTimerRef.current) {
      clearTimeout(conversationUpdatedReloadTimerRef.current);
      conversationUpdatedReloadTimerRef.current = null;
    }
  }, [selectedConversationId]);

  useEffect(() => {
    enabledInstanceIdsRef.current = enabledInstanceIds;
  }, [enabledInstanceIds]);

  /** Retorno do perfil: guardar chaves de restauração; aplicação após lista hidratada (ver `conversationsHydratedRef`). */
  useEffect(() => {
    const st = location.state as
      | {
          openConversationId?: string;
          openExternalChatId?: string;
          openInstanceId?: string;
        }
      | null
      | undefined;
    const hasContext =
      (st?.openConversationId && st.openConversationId.length > 0) ||
      (st?.openExternalChatId && st.openExternalChatId.length > 0);
    if (!hasContext) return;
    pendingConversationRestoreRef.current = {
      internalId: st?.openConversationId,
      externalChatId: st?.openExternalChatId,
      instanceId: st?.openInstanceId,
    };
    navigate('/chat', { replace: true, state: {} });
  }, [location.state, navigate]);

  /** Captura `focusInstanceId` antes de limpar `location.state` (aplicação real mais abaixo). */
  useEffect(() => {
    const st = location.state as { focusInstanceId?: string } | null | undefined;
    const id = st?.focusInstanceId?.trim();
    if (!id) return;
    pendingFocusInstanceIdRef.current = id;
    navigate(`${location.pathname}${location.search}`, { replace: true, state: {} });
  }, [location.state, location.pathname, location.search, navigate]);

  const goToClientProfileFromChat = useCallback((clientId: string, conversation: ChatConversation) => {
    const keys = {
      id: conversation.id,
      external_chat_id: conversation.external_chat_id,
      instance_id: conversation.instance_id,
    };
    navigate(buildClientProfileToFromChat(clientId, keys), {
      state: buildClientProfileStateFromChat(keys),
    });
  }, [navigate]);

  const toggleContactProfilePanel = useCallback(() => {
    if (!selectedConversationId) return;
    setContactProfileOpen((open) => !open);
  }, [selectedConversationId]);

  useEffect(() => {
    if (!selectedConversationId) setContactProfileOpen(false);
  }, [selectedConversationId]);

  // Carregar mensagens quando uma conversa é selecionada
  // Nota: Não usamos polling automático pois os webhooks atualizam em tempo real
  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
          return;
        }
        
    loadMessages(selectedConversationId);
  }, [selectedConversationId, loadMessages]);

  // WebSocket para atualização em tempo real de conversas
  useEffect(() => {
    if (!session?.token) {
      console.log('[Chat] WebSocket: No token available');
      return;
    }

    // Se já existe uma conexão, não criar nova
    if (socketRef.current?.connected) {
      console.log('[Chat] WebSocket: Already connected');
      return;
    }

    const isDev = import.meta.env.DEV;
    // Em produção usamos URL relativa para garantir mesmo host e sticky session no proxy
    const socketUrl = isDev
      ? (import.meta.env.VITE_API_URL || 'http://localhost:3001')
      : window.location.origin;

    console.log('[Chat] WebSocket: Connecting to', socketUrl, 'with token:', session.token ? 'present' : 'missing');
    console.log('[Chat] WebSocket: Token length', session.token.length);
    console.log('[Chat] WebSocket: Full URL will be', `${socketUrl}/socket.io/`);

    // Testar endpoint antes de conectar para verificar se está acessível
    const testUrl = `${socketUrl}/socket.io/?EIO=4&transport=polling`;
    console.log('[Chat] Testing endpoint accessibility:', testUrl);
    
    fetch(testUrl, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Authorization': `Bearer ${session.token}`,
      },
    })
      .then(async (res) => {
        const text = await res.text();
        console.log('[Chat] Endpoint test response:', {
          status: res.status,
          statusText: res.statusText,
          contentType: res.headers.get('content-type'),
          bodyPreview: text.substring(0, 100),
          bodyLength: text.length,
        });
        
        // Se a resposta não começa com "0{" (handshake do Socket.IO), há problema
        if (!text.startsWith('0{')) {
          console.error('[Chat] Invalid Socket.IO handshake response:', text);
        }
      })
      .catch((err) => {
        console.error('[Chat] Endpoint test failed:', err);
      });

    // Configuração: usar apenas WebSocket para evitar o caminho de XHR/polling do engine.io,
    // que depende de polyfills de URL e pode quebrar em alguns ambientes.
    const socketOptions: any = {
      auth: { token: session.token },
      transports: ['websocket'], // Forçar apenas WebSocket
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: 3, // Limitar tentativas
      timeout: 10000, // 10 segundos para timeout
      forceNew: true,
      path: '/socket.io/',
      query: {
        token: session.token,
      },
      withCredentials: true,
      // Com apenas 'websocket' como transporte, o upgrade é desnecessário
      upgrade: false,
      // Remover transportOptions que podem causar problemas de parse
    };

    const preferRealtimeV2Raw = String(import.meta.env.VITE_CHAT_REALTIME_V2 ?? '1').toLowerCase();
    const preferRealtimeV2 = preferRealtimeV2Raw !== '0' && preferRealtimeV2Raw !== 'false';
    const legacyFallbackDefault = preferRealtimeV2 ? '0' : '1';
    const legacyFallbackRaw = String(
      import.meta.env.VITE_CHAT_REALTIME_LEGACY_FALLBACK ?? legacyFallbackDefault
    ).toLowerCase();
    const enableLegacyFallback = legacyFallbackRaw === '1' || legacyFallbackRaw === 'true';

    const socket: Socket = io(socketUrl, socketOptions);
    socketRef.current = socket;

    // Logs detalhados para debug
    socket.on('connect', () => {
      console.log('[Chat] WebSocket connected successfully', {
        id: socket.id,
        transport: socket.io.engine.transport.name,
        url: socketUrl,
      });
      logChatRealtimeSocketConnected({
        socket_id: socket.id,
        transport: socket.io.engine?.transport?.name,
        realtime_v2_preferred: preferRealtimeV2,
        legacy_fallback_enabled: enableLegacyFallback,
      });
    });

    socket.on('connect_error', (error) => {
      // Log completo do erro
      console.error('[Chat] WebSocket connection error:', error);
      
      // Capturar detalhes do erro XHR se disponível
      const xhrError = (error as any).xhr || (error as any).req;
      const errorDetails: any = {
        message: error.message,
        type: (error as any).type,
        description: (error as any).description,
        context: (error as any).context,
        transport: socket.io.engine?.transport?.name || 'unknown',
        url: socketUrl,
        errorString: String(error),
        errorJSON: JSON.stringify(error, Object.getOwnPropertyNames(error)),
        stack: (error as any).stack,
      };
      
      // Adicionar detalhes do XHR se disponível
      if (xhrError) {
        errorDetails.xhr = {
          status: xhrError.status,
          statusText: xhrError.statusText,
          response: xhrError.response,
          responseText: xhrError.responseText,
          readyState: xhrError.readyState,
        };
      }
      
      // Verificar se há erro de rede
      if ((error as any).code === 'ECONNREFUSED' || (error as any).code === 'ENOTFOUND') {
        errorDetails.networkError = true;
        errorDetails.networkCode = (error as any).code;
      }
      
      console.error('[Chat] WebSocket connection error details:', errorDetails);
      
      // Tentar forçar polling se websocket falhar
      if (socket.io.engine && socket.io.engine.transport.name === 'websocket') {
        console.log('[Chat] WebSocket failed, will retry with polling');
        socket.io.opts.transports = ['polling'];
      }
    });

    socket.on('error', (error) => {
      console.error('[Chat] WebSocket error:', {
        message: error.message || error,
        type: (error as any).type,
      });
    });

    // Listener para erros do engine (mais detalhado)
    socket.io.on('error', (error) => {
      console.error('[Chat] Socket.IO engine error:', error);
      
      const errorDetails: any = {
        message: (error as any).message || String(error),
        type: (error as any).type,
        description: (error as any).description,
        errorString: String(error),
        errorJSON: JSON.stringify(error, Object.getOwnPropertyNames(error)),
        stack: (error as any).stack,
      };
      
      // Capturar detalhes do transporte se disponível
      if (socket.io.engine) {
        errorDetails.engine = {
          transport: socket.io.engine.transport?.name,
          readyState: socket.io.engine.readyState,
        };
      }
      
      // Capturar detalhes do XHR se disponível
      const xhrError = (error as any).xhr || (error as any).req;
      if (xhrError) {
        errorDetails.xhr = {
          status: xhrError.status,
          statusText: xhrError.statusText,
          response: xhrError.response,
          responseText: xhrError.responseText,
          readyState: xhrError.readyState,
        };
      }
      
      console.error('[Chat] Socket.IO engine error details:', errorDetails);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Chat] WebSocket disconnected:', {
        reason,
        wasConnected: socket.connected,
      });
      logChatRealtimeSocketDisconnected({
        reason,
        socket_id: socket.id,
        realtime_v2_preferred: preferRealtimeV2,
        legacy_fallback_enabled: enableLegacyFallback,
      });
    });

    socket.on('reconnect', (attemptNumber) => {
      console.log('[Chat] WebSocket reconnected after', attemptNumber, 'attempts');
    });

    socket.on('reconnect_attempt', (attemptNumber) => {
      console.log('[Chat] WebSocket reconnect attempt', attemptNumber);
    });

    socket.on('reconnect_error', (error) => {
      console.error('[Chat] WebSocket reconnect error:', error);
    });

    socket.on('reconnect_failed', () => {
      console.error('[Chat] WebSocket reconnect failed - giving up');
    });

    const handleConversationUpdated = (raw: any, source: 'v2' | 'legacy') => {
      const conversationId =
        typeof raw?.id === 'string' ? raw.id : typeof raw?.conversation_id === 'string' ? raw.conversation_id : null;
      if (source === 'v2') {
        logChatRealtimeV2EventReceived('conversation', { conversation_id: conversationId });
      } else {
        logChatRealtimeLegacyEventReceived('conversation', { conversation_id: conversationId });
      }
      console.log('[Chat] Conversation updated via WebSocket (raw):', raw);
      console.log('[Chat] Conversation updated - parsed fields:', {
        id: raw?.id,
        lastMessagePreview: raw?.last_message_preview,
        lastMessageAt: raw?.last_message_at,
        updatedAt: raw?.updated_at,
        contactName: raw?.contact_name,
        phoneNumber: raw?.phone_number,
        unreadCount: raw?.unread_count,
        hasLastMessagePreview: !!raw?.last_message_preview,
        hasLastMessageAt: !!raw?.last_message_at,
      });

      const updatedConversation: ChatConversation = normalizeConversation(raw);
      
      console.log('[Chat] Normalized conversation:', {
        id: updatedConversation.id,
        lastMessagePreview: updatedConversation.lastMessagePreview,
        lastMessageAt: updatedConversation.lastMessageAt,
      });
      
      setConversations((prev) => {
        const existingIndex = prev.findIndex(c => c.id === updatedConversation.id);
        console.log('[Chat] Updating conversations list:', {
          conversationId: updatedConversation.id,
          existingIndex,
          currentListSize: prev.length,
        });
        
        if (existingIndex >= 0) {
          // Atualizar conversa existente
          const updated = [...prev];
          updated[existingIndex] = updatedConversation;
          // Mover para o topo (conversa mais recente) baseado em lastMessageAt
          const sorted = updated.sort((a, b) => {
            const dateA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
            const dateB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
            return dateB - dateA; // Mais recente primeiro
          });
          console.log('[Chat] Conversation updated and sorted', {
            conversationId: updatedConversation.id,
            lastMessageAt: updatedConversation.lastMessageAt,
            lastMessagePreview: updatedConversation.lastMessagePreview,
            position: sorted.findIndex(c => c.id === updatedConversation.id),
            newListSize: sorted.length,
          });
          return sorted;
        }
        // Adicionar nova conversa no topo
        const newList = [updatedConversation, ...prev];
        // Ordenar por lastMessageAt
        const sorted = newList.sort((a, b) => {
          const dateA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
          const dateB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
          return dateB - dateA; // Mais recente primeiro
        });
        console.log('[Chat] New conversation added and sorted', {
          conversationId: updatedConversation.id,
          newListSize: sorted.length,
        });
        return sorted;
      });

      // Se a conversa atualizada é a selecionada, recarregar mensagens só quando o “último
      // conteúdo” mudou (evita rajadas de GET por eventos repetidos / campos só de lista).
      if (selectedConversationIdRef.current === updatedConversation.id) {
        const lastAt = updatedConversation.lastMessageAt ?? null;
        const preview = updatedConversation.lastMessagePreview ?? null;
        const sig = conversationUpdatedReloadSigRef.current;
        if (sig.id === updatedConversation.id && sig.lastAt === lastAt && sig.preview === preview) {
          return;
        }
        conversationUpdatedReloadSigRef.current = {
          id: updatedConversation.id,
          lastAt,
          preview,
        };
        if (conversationUpdatedReloadTimerRef.current) {
          clearTimeout(conversationUpdatedReloadTimerRef.current);
        }
        conversationUpdatedReloadTimerRef.current = setTimeout(() => {
          conversationUpdatedReloadTimerRef.current = null;
          if (selectedConversationIdRef.current !== updatedConversation.id) return;
        void loadMessages(updatedConversation.id, { silent: true });
        }, 650);
      }
      scheduleOperationsPanelRefresh();
    };

    socket.on('conversation_attendance_updated', (payload: { conversation?: Record<string, unknown> }) => {
      const conv = payload?.conversation;
      if (!conv || typeof conv.id !== 'string') return;
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== conv.id) return c;
          return {
            ...c,
            attendance_status:
              (conv.attendance_status as ChatConversation['attendance_status']) ?? c.attendance_status,
            assigned_to_user_id:
              (conv.assigned_to_user_id as string | null | undefined) ?? c.assigned_to_user_id,
            queue_id: (conv.queue_id as string | null | undefined) ?? c.queue_id,
            assigned_at: (conv.assigned_at as string | undefined) ?? c.assigned_at,
            closed_at: (conv.closed_at as string | null | undefined) ?? c.closed_at,
            last_assignment_reason:
              (conv.last_assignment_reason as string | undefined) ?? c.last_assignment_reason,
            assignee_email: (conv.assignee_email as string | undefined) ?? c.assignee_email,
            assignee_display: (conv.assignee_display as string | undefined) ?? c.assignee_display,
            assigned_team_id:
              (conv.assigned_team_id as string | null | undefined) ?? c.assigned_team_id,
            assigned_team_name:
              (conv.assigned_team_name as string | null | undefined) ?? c.assigned_team_name,
          };
        }),
      );
      const ids = Array.from(enabledInstanceIdsRef.current);
      if (ids.length === 0) return;
      const scope = user?.tenant_id && chatInboxScope === 'tenant' ? ('tenant' as const) : ('owner' as const);
      void chatService
        .getConversationAttendanceCounts({ instanceIds: ids, inboxScope: scope })
        .then(setAttendanceCounts)
        .catch(() => {});
      scheduleOperationsPanelRefresh();
    });

    const handleNewMessage = (
      data: { message: any; conversationId: string },
      source: 'v2' | 'legacy',
    ) => {
      console.log('[Chat] New message via WebSocket (raw):', data.message);
      
      const normalizedMessage = normalizeChatMessage({
        ...data.message,
        conversation_id: data.message.conversation_id || data.conversationId,
      });

      if (source === 'v2') {
        logChatRealtimeV2EventReceived('message', {
          conversation_id: data.conversationId,
          message_id: normalizedMessage.id ?? null,
          external_message_id: normalizedMessage.external_message_id ?? null,
        });
      } else {
        logChatRealtimeLegacyEventReceived('message', {
          conversation_id: data.conversationId,
          message_id: normalizedMessage.id ?? null,
          external_message_id: normalizedMessage.external_message_id ?? null,
        });
      }
      
      // Usar ref para evitar closure stale
      const currentSelectedId = selectedConversationIdRef.current;
      
      // Se a mensagem é da conversa selecionada, adicionar à lista
      if (currentSelectedId === data.conversationId) {
        setMessages((prev) => {
          const queue = pendingOutgoingOptimisticQueueRef.current;
          let base = prev;
          if (queue.length > 0 && normalizedMessage.direction === 'outgoing') {
            const pendingId = queue.shift();
            if (pendingId) {
              base = prev.filter((m) => m.id !== pendingId);
            }
          }
          if (normalizedMessage.id && base.some((m) => m.id === normalizedMessage.id)) {
            logChatRealtimeDuplicateSkipped({
              conversation_id: data.conversationId,
              reason: 'id',
              message_id: normalizedMessage.id,
              source,
            });
            return base;
          }
          const ext = normalizedMessage.external_message_id;
          if (ext && base.some((m) => m.external_message_id === ext)) {
            logChatRealtimeDuplicateSkipped({
              conversation_id: data.conversationId,
              reason: 'external_message_id',
              external_message_id: ext,
              source,
            });
            return base;
          }
          return [...base, normalizedMessage];
        });
      }

      // Atualizar preview da conversa na lista quando recebe nova mensagem
      setConversations((prev) => {
        const index = prev.findIndex(c => c.id === data.conversationId);
        console.log('[Chat] Updating conversation from new_message event:', {
          conversationId: data.conversationId,
          foundIndex: index,
          messageBody: normalizedMessage.body,
          sentAt: normalizedMessage.sentAt,
          isSelected: currentSelectedId === data.conversationId,
        });
        
        if (index >= 0) {
          const updated = [...prev];
          const conv = updated[index];
          const c = normalizedMessage.message_contract;
          const previewText =
            coerceChatPlainText(c?.body) ||
            coerceChatPlainText(normalizedMessage.body) ||
            '';
          const messagePreview =
            previewText ||
            (c?.kind === 'audio' ? '[Áudio]' : null) ||
            (c?.kind === 'document'
              ? '[Documento]'
              : c?.kind === 'image' || (normalizedMessage.media && normalizedMessage.media.length > 0)
                ? '[Imagem]'
                : '[Mídia]');
          const updatedConv = {
            ...conv,
            lastMessagePreview: messagePreview,
            lastMessageAt: normalizedMessage.sentAt || conv.lastMessageAt || conv.created_at || conv.updated_at || null,
            unreadCount: currentSelectedId === data.conversationId 
              ? conv.unreadCount 
              : (conv.unreadCount || 0) + 1,
            updated_at: normalizedMessage.sentAt || conv.updated_at || new Date().toISOString(),
          };
          
          updated[index] = updatedConv;
          
          // Ordenar por lastMessageAt (mais recente primeiro)
          const sorted = updated.sort((a, b) => {
            const dateA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
            const dateB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
            return dateB - dateA;
          });
          
          console.log('[Chat] Conversation updated from new_message, sorted list:', {
            conversationId: data.conversationId,
            newPosition: sorted.findIndex(c => c.id === data.conversationId),
            lastMessagePreview: updatedConv.lastMessagePreview,
            lastMessageAt: updatedConv.lastMessageAt,
          });
          
          return sorted;
        } else {
          console.warn('[Chat] Conversation not found in list for new_message:', {
            conversationId: data.conversationId,
            currentListSize: prev.length,
          });
        }
        return prev;
      });
      scheduleOperationsPanelRefresh();
    };

    if (preferRealtimeV2) {
      socket.on('conversation.updated', (evt: any) => {
        if (!evt || typeof evt !== 'object') return;
        handleConversationUpdated(
          {
            id: evt.conversation_id,
            provider: evt.provider,
            last_message_preview: evt.last_message_preview,
            last_message_at: evt.last_message_at,
            unread_count: evt.unread_count,
            status: evt.status,
            assigned_to_user_id: evt.assigned_user_id,
            assigned_team_id: evt.assigned_team_id,
            display_name: evt.display_name,
            avatar_url: evt.avatar_url,
          },
          'v2',
        );
      });

      socket.on('message.created', (evt: any) => {
        if (!evt || typeof evt !== 'object' || typeof evt.conversation_id !== 'string') return;
        handleNewMessage(
          {
            conversationId: evt.conversation_id,
            message: {
              id: evt.message_id || evt.provider_message_id,
              conversation_id: evt.conversation_id,
              direction: evt.direction,
              body: evt.body,
              sent_at: evt.sent_at,
              external_message_id: evt.provider_message_id,
              media: evt.media_url ? [{ type: evt.message_type || 'unknown', url: evt.media_url }] : [],
              reply_to_message_id: evt.reply_to_message_id ?? null,
              reply_preview: evt.reply_preview ?? null,
              reply_sender_name: evt.reply_sender_name ?? null,
              reply_message_type: evt.reply_message_type ?? null,
            },
          },
          'v2',
        );
      });
    }

    if (!preferRealtimeV2 || enableLegacyFallback) {
      socket.on('conversation_updated', (raw: any) => handleConversationUpdated(raw, 'legacy'));
      socket.on('new_message', (payload: { message: any; conversationId: string }) =>
        handleNewMessage(payload, 'legacy'),
      );
    }

    socket.on('message_updated', (data: { message: any; conversationId: string }) => {
      const normalizedMessage = normalizeChatMessage({
        ...data.message,
        conversation_id: data.message?.conversation_id || data.conversationId,
      });

      const currentSelectedId = selectedConversationIdRef.current;
      if (currentSelectedId === data.conversationId) {
        setMessages((prev) => {
          const idx = prev.findIndex(
            (m) =>
              (normalizedMessage.id && m.id === normalizedMessage.id) ||
              (!!normalizedMessage.external_message_id &&
                m.external_message_id === normalizedMessage.external_message_id)
          );
          if (idx < 0) return prev;
          const next = [...prev];
          next[idx] = { ...next[idx], ...normalizedMessage };
          return next;
        });
      }
    });

    socket.on('chat.message_comment.created', (payload: any) => {
      const mid = payload?.message_id;
      const cid = payload?.conversation_id;
      const raw = payload?.comment;
      if (typeof mid !== 'string' || typeof cid !== 'string' || !raw) return;
      if (selectedConversationIdRef.current !== cid) return;
      const c = normalizeInternalComment(raw);
      if (!c) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === mid ? mergeInternalCommentIntoMessage(m, c) : m)),
      );
    });

    socket.on('crm.note.created', () => {
      if (!contactProfileOpenRef.current) return;
      const { clientId, leadId } = chatProfileCrmLinkRef.current;
      if (!clientId && !leadId) return;
      void (async () => {
        try {
          const notes = clientId
            ? await chatService.listCrmNotesForClient(clientId, 10)
            : await chatService.listCrmNotesForLead(leadId!, 10);
          setCrmNotesPreview(notes.map((n) => mapCrmNoteToPreview(n as Record<string, unknown>)));
        } catch {
          /* ignore */
        }
      })();
    });

    return () => {
      if (conversationUpdatedReloadTimerRef.current) {
        clearTimeout(conversationUpdatedReloadTimerRef.current);
        conversationUpdatedReloadTimerRef.current = null;
      }
      // Limpar socket quando token mudar ou componente desmontar
      if (socketRef.current) {
        console.log('[Chat] WebSocket: Cleaning up socket');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [session?.token, loadMessages, user?.tenant_id, chatInboxScope, scheduleOperationsPanelRefresh]);

  const loadClients = useCallback(async () => {
    try {
      const data = await clientsService.getClients();
      setClients(data);
    } catch (error) {
      console.error('Erro ao carregar clientes:', error);
    }
  }, []);

  const loadLeads = useCallback(async () => {
    setLoadingLeads(true);
    try {
      const response = await apiClient.get<any[]>('/api/leads');
      if (response.error) throw new Error(response.error);
      setLeads(response.data || []);
    } catch (error) {
      console.error('Erro ao carregar leads:', error);
      setLeads([]);
    } finally {
      setLoadingLeads(false);
    }
  }, []);

  const loadTicketCategories = useCallback(async () => {
    try {
      const data = await ticketsService.getTicketCategories();
      setTicketCategories(data);
    } catch (error) {
      console.error('Erro ao carregar categorias de ticket:', error);
    }
  }, []);

  useEffect(() => {
    loadInstances();
    loadClients();
    loadLeads();
    loadTicketCategories();
  }, [loadInstances, loadClients, loadLeads, loadTicketCategories]);

  /** Ativas no chat: `metadata.enabled_in_chat !== false` (persistido no backend). */
  useEffect(() => {
    if (instances.length === 0) {
      setSelectedInstanceId(null);
      setEnabledInstanceIds(new Set());
      setConversations([]);
      setSelectedConversationId(null);
      setMessages([]);
      return;
    }

    const enabledIds = instances
      .filter((inst) => (inst.metadata as Record<string, unknown> | null | undefined)?.enabled_in_chat !== false)
      .map((inst) => inst.id);

    setEnabledInstanceIds(new Set(enabledIds));
  }, [instances]);

  useEffect(() => {
    if (enabledInstanceIds.size === 0) {
      setSelectedInstanceId(null);
      return;
    }
    const enabledArray = Array.from(enabledInstanceIds);
    setSelectedInstanceId((currentSelected) => {
      if (!currentSelected || !enabledInstanceIds.has(currentSelected)) {
        return enabledArray[0] || null;
      }
      return currentSelected;
    });
  }, [enabledInstanceIds]);

  /** Após seleção automática da primeira instância, prioriza o canal vindo das Configurações. */
  useEffect(() => {
    const id = pendingFocusInstanceIdRef.current;
    if (!id) return;
    if (loadingInstances) return;
    if (instances.length === 0) return;

    if (!instances.some((i) => i.id === id)) {
      pendingFocusInstanceIdRef.current = null;
      toast.info('Este número não está mais disponível no chat.');
      return;
    }
    if (!enabledInstanceIds.has(id)) {
      pendingFocusInstanceIdRef.current = null;
      toast.info('Ative este número na lista do Chat para usá-lo como canal de atendimento.');
      return;
    }

    pendingFocusInstanceIdRef.current = null;
    setSelectedInstanceId(id);
  }, [instances, loadingInstances, enabledInstanceIds]);

  useEffect(() => {
    if (enabledInstanceIds.size === 0) {
      setConversations([]);
      if (!pendingConversationRestoreRef.current) {
        setSelectedConversationId(null);
      }
      setMessages([]);
      if (isMobile && routeConversationId) {
        chatCrmListReturnPathRef.current = null;
        navigate('/chat', { replace: true });
      }
      return;
    }
    if (!pendingConversationRestoreRef.current) {
      setSelectedConversationId(null);
    }
    setMessages([]);
    // Carregar conversas de todas as instâncias habilitadas
    // Nota: Não usamos polling automático pois os webhooks atualizam em tempo real
    loadConversations(Array.from(enabledInstanceIds));
  }, [enabledInstanceIds, loadConversations, isMobile, routeConversationId, navigate]);

  useEffect(() => {
    if (pendingConversationRestoreRef.current) {
      return;
    }
    if (!selectedConversationId) return;
    // Evita ciclo infinito de fetch (ERR_INSUFFICIENT_RESOURCES): a rota `/chat/:id` fixa a
    // conversa antes da lista hidratar; limpar aqui fazia o efeito da URL voltar a chamar
    // handleSelectConversation em rajada.
    if (loadingConversations) return;
    if (!conversationsHydratedRef.current) return;
    if (routeConversationId && routeConversationId === selectedConversationId) {
      return;
    }
    if (!conversations.some((conversation) => conversation.id === selectedConversationId)) {
      setSelectedConversationId(null);
      setMessages([]);
    }
  }, [conversations, selectedConversationId, loadingConversations, routeConversationId]);

  /** Mantém o viewport no fim do histórico (mensagem mais recente visível). */
  const scrollMessagesToBottom = useCallback(() => {
    const run = () => {
      const end = messagesEndRef.current;
      if (!end) return;
      const viewport = end.closest('[data-radix-scroll-area-viewport]') as HTMLElement | null;
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      } else {
        end.scrollIntoView({ behavior: 'auto', block: 'end' });
      }
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        run();
        // Segundo tick: após layout/pintura (área de scroll, mídia nas bolhas)
        requestAnimationFrame(run);
      });
    });
  }, []);

  // Scroll para o fim: mensagens novas, troca de conversa, fim do carregamento, ou volta ao painel da conversa
  // (ex.: criar fatura desmonta a lista — sem mudar `messages`, o efeito antigo não corria e o scroll ia ao topo)
  useLayoutEffect(() => {
    if (messages.length === 0 || loadingMessages) return;
    if (viewMode !== 'conversation') return;
    scrollMessagesToBottom();
  }, [messages, selectedConversationId, loadingMessages, viewMode, scrollMessagesToBottom]);

  const searchFilteredConversations = useMemo(() => {
    if (!searchTerm.trim()) return conversations;
    return conversations.filter((conversation) => {
      const term = searchTerm.toLowerCase();
      return (
        conversation.contactName?.toLowerCase().includes(term) ||
        conversation.profileName?.toLowerCase().includes(term) ||
        conversation.phoneNumber?.toLowerCase().includes(term) ||
        conversation.external_chat_id.toLowerCase().includes(term)
      );
    });
  }, [conversations, searchTerm]);

  const filteredConversations = useMemo(() => {
    if (!operationalPanelFilter) return searchFilteredConversations;
    return searchFilteredConversations.filter((c) =>
      matchesOperationalFilter(c, operationalPanelFilter, slaUiContext),
    );
  }, [searchFilteredConversations, operationalPanelFilter, slaUiContext]);

  // Filtros de conversas
  const unreadConversations = useMemo(
    () =>
      filteredConversations.filter(
        (conversation) => (conversation.unreadCount ?? 0) > 0,
      ),
    [filteredConversations],
  );

  // Função auxiliar para ordenar conversas por última mensagem (mais recente primeiro)
  const sortConversationsByLastMessage = (convs: ChatConversation[]) => {
    return [...convs].sort((a, b) => {
      // Priorizar lastMessageAt, depois updated_at, depois created_at
      const dateA = a.lastMessageAt
        ? new Date(a.lastMessageAt).getTime()
        : (a.created_at ? new Date(a.created_at).getTime() : (a.updated_at ? new Date(a.updated_at).getTime() : 0));
      const dateB = b.lastMessageAt
        ? new Date(b.lastMessageAt).getTime()
        : (b.created_at ? new Date(b.created_at).getTime() : (b.updated_at ? new Date(b.updated_at).getTime() : 0));
      
      // Se ambas têm data, ordenar por mais recente primeiro
      if (dateA > 0 && dateB > 0) {
        return dateB - dateA;
      }
      // Se apenas uma tem data, ela vem primeiro
      if (dateA > 0) return -1;
      if (dateB > 0) return 1;
      // Se nenhuma tem data, manter ordem original
      return 0;
    });
  };

  // Filtros de leads e clientes
  const leadConversations = useMemo(() => {
    const filtered = filteredConversations.filter((conversation) => {
      // Deve ter lead_id
      if (!conversation.leadId) return false;
      // Não deve ter client_id
      if (conversation.client_id) return false;
      // O lead não deve estar convertido
      if (conversation.lead_status === 'Convertido') return false;
      return true;
    });
    return sortConversationsByLastMessage(filtered);
  }, [filteredConversations]);

  const clientConversations = useMemo(() => {
    const filtered = filteredConversations.filter((conversation) => {
      // Deve ter client_id OU ser um lead convertido
      if (conversation.client_id) return true;
      if (conversation.leadId && conversation.lead_status === 'Convertido') return true;
      return false;
    });
    return sortConversationsByLastMessage(filtered);
  }, [filteredConversations]);

  // Determinar quais conversas mostrar baseado na aba ativa
  const conversationsToShow = useMemo(() => {
    let result: ChatConversation[];
    switch (activeTab) {
      case 'all':
        result = filteredConversations;
        break;
      case 'unread':
        result = unreadConversations;
        break;
      case 'leads':
        result = leadConversations;
        break;
      case 'clients':
        result = clientConversations;
        break;
      default:
        result = filteredConversations;
    }
    // Garantir que está ordenado por última mensagem (mais recente primeiro)
    return sortConversationsByLastMessage(result);
  }, [activeTab, unreadConversations, filteredConversations, leadConversations, clientConversations]);

  useEffect(() => {
    const chatListDiag =
      import.meta.env.DEV || import.meta.env.VITE_CHAT_LIST_DIAG === '1';
    if (!chatListDiag) return;
    console.log('[ChatListDiag] render pipeline', {
      activeTab,
      conversationsState: conversations.length,
      afterSearch: filteredConversations.length,
      conversationsToShow: conversationsToShow.length,
    });
  }, [
    activeTab,
    conversations.length,
    filteredConversations.length,
    conversationsToShow.length,
  ]);

  useEffect(() => {
    if (attendanceCounts.queue === 0 && chatAttendanceFilter === 'queue') {
      setChatAttendanceFilter('');
    }
  }, [attendanceCounts.queue, chatAttendanceFilter]);

  useEffect(() => {
    if (attendanceCounts.team === 0 && chatAttendanceFilter === 'team') {
      setChatAttendanceFilter('');
    }
  }, [attendanceCounts.team, chatAttendanceFilter]);

  useEffect(() => {
    setChatAttendanceFilter((prev) => ((prev as string) === 'unassigned' ? '' : prev));
  }, []);

  const selectedConversation = conversations.find(
    (conversation) => conversation.id === selectedConversationId,
  );

  useEffect(() => {
    chatProfileCrmLinkRef.current = {
      clientId: selectedConversation?.client_id ?? null,
      leadId: selectedConversation?.leadId ?? null,
    };
  }, [selectedConversation?.client_id, selectedConversation?.leadId]);

  const scrollToMessageId = useCallback((id: string) => {
    const el = messageRowRefs.current[id];
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  const openAllCommentsDialogForMessage = useCallback(async (messageId: string) => {
    setAllCommentsDialog({ messageId });
    setAllCommentsDialogLoading(true);
    setAllCommentsDialogItems([]);
    try {
      const rows = await chatService.getMessageComments(messageId);
      const items = rows
        .map((r) => normalizeInternalComment(r))
        .filter((x): x is ChatInternalComment => x != null);
      setAllCommentsDialogItems(items);
    } catch {
      toast.error('Não foi possível carregar os comentários');
    } finally {
      setAllCommentsDialogLoading(false);
    }
  }, []);

  const handleOpenCrmNoteInChat = useCallback(
    (note: CrmNotePreviewRow) => {
      const cid = note.conversation_id;
      const mid = note.message_id;
      if (!cid || !mid) return;
      setContactProfileOpen(false);
      if (selectedConversationId === cid) {
        const next = new URLSearchParams(searchParams);
        next.set('focusMessageId', mid);
        setSearchParams(next, { replace: false });
      } else {
        navigate(`/chat/${cid}?focusMessageId=${encodeURIComponent(mid)}`);
      }
    },
    [selectedConversationId, searchParams, setSearchParams, navigate],
  );

  useEffect(() => {
    const mid = focusMessageIdParam;
    const convId = selectedConversationId;
    if (!mid || !convId || loadingMessages) return;
    if (!messages.some((m) => m.id === mid)) return;

    let cancelled = false;
    let attempts = 0;
    const run = () => {
      if (cancelled || attempts++ > 50) return;
      const el = messageRowRefs.current[mid];
      if (!el) {
        window.setTimeout(run, 60);
        return;
      }
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setFlashMessageId(mid);
      setSearchParams((prev) => {
        const n = new URLSearchParams(prev);
        n.delete('focusMessageId');
        return n;
      }, { replace: true });
      window.setTimeout(() => setFlashMessageId(null), 2800);
    };
    const t = window.setTimeout(run, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [focusMessageIdParam, selectedConversationId, loadingMessages, messages, setSearchParams]);

  useEffect(() => {
    if (!contactProfileOpen || !selectedConversation) {
      setCrmNotesPreview([]);
      return;
    }
    const cid = selectedConversation.client_id;
    const lid = selectedConversation.leadId;
    if (!cid && !lid) {
      setCrmNotesPreview([]);
      return;
    }
    let cancelled = false;
    setCrmNotesLoading(true);
    void (async () => {
      try {
        const notes = cid
          ? await chatService.listCrmNotesForClient(cid, 10)
          : await chatService.listCrmNotesForLead(lid!, 10);
        if (cancelled) return;
        setCrmNotesPreview(notes.map((n) => mapCrmNoteToPreview(n as Record<string, unknown>)));
      } catch {
        if (!cancelled) setCrmNotesPreview([]);
      } finally {
        if (!cancelled) setCrmNotesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contactProfileOpen, selectedConversation?.id, selectedConversation?.client_id, selectedConversation?.leadId]);

  const refreshCrmNotesForProfile = useCallback(async () => {
    if (!selectedConversation) return;
    const cid = selectedConversation.client_id;
    const lid = selectedConversation.leadId;
    if (!cid && !lid) return;
    setCrmNotesLoading(true);
    try {
      const notes = cid
        ? await chatService.listCrmNotesForClient(cid, 10)
        : await chatService.listCrmNotesForLead(lid!, 10);
      setCrmNotesPreview(notes.map((n) => mapCrmNoteToPreview(n as Record<string, unknown>)));
    } catch {
      /* ignore */
    } finally {
      setCrmNotesLoading(false);
    }
  }, [selectedConversation]);

  const linkPageSize = 8;
  const filteredLinkClients = useMemo(() => {
    const q = linkSearch.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      [c.name, c.email, c.phone, c.company]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [clients, linkSearch]);
  const filteredLinkLeads = useMemo(() => {
    const q = linkSearch.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) =>
      [l.name, l.email, l.phone, l.company]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [leads, linkSearch]);
  const pagedLinkClients = useMemo(
    () => filteredLinkClients.slice(0, linkPage * linkPageSize),
    [filteredLinkClients, linkPage]
  );
  const pagedLinkLeads = useMemo(
    () => filteredLinkLeads.slice(0, linkPage * linkPageSize),
    [filteredLinkLeads, linkPage]
  );
  const suggestedCandidates = useMemo(() => {
    const raw = (selectedConversation?.metadata as any)?.match_sugerido?.candidates;
    if (!Array.isArray(raw)) return [];
    return raw.filter((c) => c && typeof c.id === 'string' && (c.type === 'client' || c.type === 'lead'));
  }, [selectedConversation?.metadata]);

  const clientsById = useMemo(() => {
    const m = new Map<string, (typeof clients)[number]>();
    for (const c of clients) m.set(c.id, c);
    return m;
  }, [clients]);

  const leadsById = useMemo(() => {
    const m = new Map<string, (typeof leads)[number]>();
    for (const l of leads) m.set(l.id, l);
    return m;
  }, [leads]);

  const selectedIdentity = useMemo(() => {
    if (!selectedConversation) return null;
    return resolveConversationIdentity(
      selectedConversation,
      selectedConversation.client_id ? currentClient : null,
      selectedConversation.leadId && !selectedConversation.client_id ? currentLead : null,
    );
  }, [selectedConversation, currentClient, currentLead]);

  /** Uma única linha no header mobile: vínculo+estado OU telefone — nunca repetir número. */
  const mobileThreadHeaderSubline = useMemo(() => {
    if (!isMobile || !routeConversationId || !selectedConversation || !selectedIdentity) return null;
    const conv = selectedConversation;
    const phone = selectedIdentity.phoneLine?.trim() || '';
    const att = attendanceStatusLabel(conv.attendance_status);
    const assignee = conv.assignee_display?.trim() ? shortOperatorName(conv.assignee_display) : '';
    const team =
      conv.assigned_team_id && conv.assigned_team_name?.trim()
        ? `Fila ${conv.assigned_team_name.trim()}`
        : '';

    if (conv.client_id) {
      const parts = ['Cliente'];
      if (att) parts.push(att);
      else if (assignee) parts.push(assignee);
      else if (team) parts.push(team);
      return parts.join(' · ');
    }
    if (conv.leadId) {
      const parts = ['Lead'];
      if (att) parts.push(att);
      else if (assignee) parts.push(assignee);
      else if (team) parts.push(team);
      return parts.join(' · ');
    }
    if (conv.link_state === 'review_required') {
      return att ? `Revisar vínculo · ${att}` : 'Revisar vínculo';
    }
    if (phone) return phone;
    const fallback = [att, assignee, team].filter(Boolean).join(' · ');
    return fallback || null;
  }, [isMobile, routeConversationId, selectedConversation, selectedIdentity]);

  const chatContractInitialSigners = useMemo(() => {
    const contact = currentClient || currentLead;
    if (!contact) return [];
    const taxFromClient = currentClient?.cpf_cnpj;
    const taxFromLead =
      currentLead &&
      (typeof (currentLead as { cpf_cnpj?: string }).cpf_cnpj === 'string'
        ? (currentLead as { cpf_cnpj?: string }).cpf_cnpj
        : undefined);
    return [
      {
        name: contact.name || '',
        email: contact.email || '',
        tax_id: normalizeBrazilTaxIdInput(taxFromClient || taxFromLead || ''),
        role: 'CLIENT' as const,
        signing_order: 1,
      },
    ];
  }, [currentClient, currentLead]);

  const inboxTemplateContext = useMemo(
    () =>
      buildChatInboxTemplateContext({
        conversation: selectedConversation ?? null,
        user,
        profile,
      }),
    [selectedConversation, user, profile],
  );

  const chatContactProfileModel = useMemo(() => {
    if (!selectedConversation || !user) return null;
    const conv = selectedConversation;
    const id = selectedIdentity;
    const displayName = id?.displayName ?? '—';
    const phoneDisplay =
      (id?.phoneLine && id.phoneLine.trim()) || conv.phoneNumber || conv.canonicalPhone || conv.canonical_phone || null;
    const statusParts: string[] = [];
    if (id?.waSubtitle?.trim()) statusParts.push(id.waSubtitle.trim());
    if (attendanceIsInProgress(conv.attendance_status)) statusParts.push('Em atendimento');
    if (conv.attendance_status === 'queued') statusParts.push('Na fila');
    if (conv.attendance_status === 'closed') statusParts.push('Encerrado');
    const statusLine = statusParts.length ? statusParts.join(' · ') : null;
    const lastInteractionLabel = formatRelativeDate(conv.lastMessageAt || conv.updated_at);
    const assigneeDisplay =
      conv.assignee_display?.trim() ||
      (conv.assigned_to_user_id ? 'Atribuído' : null);
    const teamName = conv.assigned_team_name?.trim() || null;
    const contact = currentClient || currentLead;
    const kind = conv.client_id ? ('client' as const) : conv.leadId ? ('lead' as const) : ('unlinked' as const);

    const profileFields: ChatProfileFieldRow[] = [];
    const leadCpf =
      currentLead && typeof (currentLead as { cpf_cnpj?: string }).cpf_cnpj === 'string'
        ? (currentLead as { cpf_cnpj?: string }).cpf_cnpj?.trim()
        : '';
    if (contact) {
      profileFields.push({
        key: 'name',
        label: 'Nome',
        value: (contact.name || '').trim() || null,
        editable: true,
      });
      profileFields.push({
        key: 'phone',
        label: 'Telefone',
        value: (contact.phone || phoneDisplay || '').trim() || null,
        editable: true,
      });
      profileFields.push({
        key: 'email',
        label: 'E-mail',
        value: contact.email?.trim() || null,
        editable: true,
      });
      const cpfVal = currentClient?.cpf_cnpj?.trim() || leadCpf || null;
      if (kind === 'client' || cpfVal) {
        profileFields.push({
          key: 'cpf_cnpj',
          label: 'CPF/CNPJ',
          value: cpfVal,
          editable: true,
        });
      }
      const companyVal =
        contact && 'company' in contact && (contact as { company?: string }).company?.trim()
          ? String((contact as { company?: string }).company).trim()
          : null;
      profileFields.push({ key: 'company', label: 'Empresa', value: companyVal, editable: true });
      const src =
        contact && 'source' in contact && typeof (contact as { source?: string }).source === 'string'
          ? (contact as { source?: string }).source?.trim() || null
          : null;
      profileFields.push({ key: 'source', label: 'Origem', value: src, editable: true });
    } else {
      profileFields.push({
        key: 'name',
        label: 'Nome',
        value: displayName !== '—' ? displayName : null,
        editable: false,
      });
      profileFields.push({
        key: 'phone',
        label: 'Telefone',
        value: phoneDisplay,
        editable: false,
      });
    }
    profileFields.push({
      key: 'lastInteraction',
      label: 'Última interação',
      value: lastInteractionLabel,
      editable: false,
    });

    const tagLabels: string[] = [];
    if (currentClient?.funnel_stage) tagLabels.push(String(currentClient.funnel_stage));
    if (currentClient?.client_groups?.name) tagLabels.push(currentClient.client_groups.name);

    const adminBypass = user.is_tenant_admin === true;
    const canTransferProfile =
      !!user.tenant_id &&
      attendanceIsInProgress(conv.attendance_status) &&
      !!conv.assigned_to_user_id &&
      (conv.assigned_to_user_id === user.id || adminBypass);
    return {
      displayName,
      phoneDisplay,
      statusLine,
      avatarUrl: id?.avatarUrl ?? null,
      initials: id?.initials ?? '?',
      kind,
      assigneeDisplay,
      teamName,
      profileFields,
      tagLabels,
      selectedClientGroupId: currentClient?.group_id ?? null,
      canTransferProfile,
    };
  }, [selectedConversation, user, selectedIdentity, currentClient, currentLead]);
  const activeInstance =
    instances.find((instance) => instance.id === selectedInstanceId) ||
    instances.find((instance) => instance.status === 'connected') ||
    null;
  const connectionStatus = activeInstance?.status || 'disconnected';
  const instanceConnectionUi = useMemo(
    () => resolveInstanceConnectionUi(activeInstance),
    [activeInstance],
  );

  type SelectConversationOpts = { chatListReturn?: string; clientProfileReturnId?: string };

  const handleSelectConversation = (conversationId: string, opts?: SelectConversationOpts) => {
    const listReturn = opts?.chatListReturn;
    if (isChatListReturnPath(listReturn)) {
      chatCrmListReturnPathRef.current = listReturn;
    }

    if (opts?.clientProfileReturnId) {
      chatClientProfileReturnIdRef.current = opts.clientProfileReturnId;
    } else {
      chatClientProfileReturnIdRef.current = null;
    }

    if (isMobile) {
      const navState: { chatListReturn?: string; clientProfileReturnId?: string } = {
        ...(isChatListReturnPath(listReturn) ? { chatListReturn: listReturn } : {}),
        ...(opts?.clientProfileReturnId ? { clientProfileReturnId: opts.clientProfileReturnId } : {}),
      };
      navigate(`/chat/${conversationId}`, {
        // `replace` evita empilhar `/chat` entre a lista CRM e a thread — o «voltar» do sistema regressa à lista.
        replace: isChatListReturnPath(listReturn),
        state: Object.keys(navState).length > 0 ? navState : undefined,
      });
    }
    setSelectedConversationId(conversationId);

    void chatService.syncConversationMessages(conversationId, {}).catch((error) => {
      console.error('Erro ao sincronizar mensagens ao selecionar conversa:', error);
    });

    const conversation = conversations.find((item) => item.id === conversationId);
    if (conversation && (conversation.unreadCount ?? 0) > 0) {
      void chatService
        .markConversationRead(conversationId)
        .then(() => {
          if (enabledInstanceIdsRef.current.size > 0) {
            loadConversations(Array.from(enabledInstanceIdsRef.current));
          }
        })
        .catch((error) => {
          console.error('Erro ao marcar conversa como lida:', error);
        });
    }

    void loadConversationProfile(conversationId);
  };

  const openContactProfileFromList = (conversation: ChatConversation, e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedConversationId !== conversation.id) {
      handleSelectConversation(conversation.id);
    }
    setContactProfileOpen(true);
  };

  const loadConversationProfile = useCallback(async (conversationId: string) => {
    setLoadingClient(true);
    setLoadingLead(true);
    try {
      const profile = await chatService.getConversationProfile(conversationId);
      if (profile.type === 'client' && profile.profile) {
        setCurrentClient(profile.profile);
        setCurrentLead(null);
      } else if (profile.type === 'lead' && profile.profile) {
        setCurrentLead(profile.profile);
        setCurrentClient(null);
      } else {
        setCurrentClient(null);
        setCurrentLead(null);
      }
      } catch (error) {
      console.error('Erro ao carregar perfil da conversa:', error);
      setCurrentClient(null);
      setCurrentLead(null);
    } finally {
      setLoadingClient(false);
      setLoadingLead(false);
    }
  }, []);

  const canEditChatProfileFields = useMemo(
    () =>
      Boolean(currentClient && canEdit('clients')) ||
      Boolean(currentLead && !currentClient && canEdit('leads')),
    [currentClient, currentLead, canEdit],
  );

  const handleSaveChatProfileField = useCallback(
    async (key: ChatProfileFieldKey, value: string) => {
      if (!selectedConversationId) return;
      setProfileFieldSaving(key);
      try {
        if (currentClient?.id) {
          const patch: Partial<Client> = {};
          if (key === 'name') patch.name = value;
          else if (key === 'email') patch.email = value;
          else if (key === 'phone') patch.phone = value;
          else if (key === 'cpf_cnpj') patch.cpf_cnpj = value ? normalizeBrazilTaxIdInput(value) : null;
          else if (key === 'company') patch.company = value;
          else if (key === 'source') patch.source = value;
          const updated = await clientsService.updateClient(currentClient.id, patch);
          setCurrentClient(updated);
          toast.success('Dados atualizados');
          void queryClient.invalidateQueries({ queryKey: ['clients'] });
        } else if (currentLead?.id) {
          const body: Record<string, unknown> = {};
          if (key === 'name') body.name = value;
          else if (key === 'email') body.email = value;
          else if (key === 'phone') body.phone = value;
          else if (key === 'company') body.company = value;
          else if (key === 'source') body.source = value;
          else if (key === 'cpf_cnpj') body.cpf_cnpj = value ? normalizeBrazilTaxIdInput(value) : null;
          await apiClient.patch(`/api/leads/${currentLead.id}`, body);
          await loadConversationProfile(selectedConversationId);
          toast.success('Dados atualizados');
          void queryClient.invalidateQueries({ queryKey: ['leads'] });
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erro ao guardar');
        throw e;
      } finally {
        setProfileFieldSaving(null);
      }
    },
    [currentClient, currentLead, selectedConversationId, loadConversationProfile, queryClient],
  );

  const handleChatClientGroupChange = useCallback(
    async (groupId: string | null) => {
      if (!currentClient?.id) return;
      setSavingClientGroup(true);
      try {
        const updated = await clientsService.updateClient(currentClient.id, {
          group_id: groupId ?? undefined,
        });
        setCurrentClient(updated);
        toast.success('Grupo atualizado');
        void queryClient.invalidateQueries({ queryKey: ['clients'] });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erro ao atualizar grupo');
      } finally {
        setSavingClientGroup(false);
      }
    },
    [currentClient, queryClient],
  );

  const handleSelectConversationRef = useRef(handleSelectConversation);
  handleSelectConversationRef.current = handleSelectConversation;

  /** Mobile: voltar da thread para o perfil do cliente, lista CRM (`/leads` / `/clients`) ou inbox. */
  const handleMobileThreadHeaderBack = useCallback(() => {
    const st = location.state as { chatListReturn?: string; clientProfileReturnId?: string } | null;
    const profileId = st?.clientProfileReturnId?.trim() || chatClientProfileReturnIdRef.current?.trim() || null;
    if (profileId) {
      chatClientProfileReturnIdRef.current = null;
      chatCrmListReturnPathRef.current = null;
      navigate(`/clients/${profileId}`, { replace: true });
      return;
    }

    const fromState = st?.chatListReturn;
    const fromRef = chatCrmListReturnPathRef.current;
    const ret = isChatListReturnPath(fromState)
      ? fromState
      : isChatListReturnPath(fromRef)
        ? fromRef
        : null;
    if (isChatListReturnPath(ret)) {
      chatCrmListReturnPathRef.current = null;
      navigate(ret, { replace: true });
      return;
    }
    chatCrmListReturnPathRef.current = null;
    setViewMode('conversation');
    navigate('/chat', { replace: true });
  }, [location.state, navigate]);

  /** Após lista hidratada, resolve uuid (incl. após deduplicação) e aplica o mesmo fluxo do clique na conversa. */
  useEffect(() => {
    const pending = pendingConversationRestoreRef.current;
    if (!pending) return;
    if (loadingConversations) return;
    if (enabledInstanceIds.size === 0) return;
    if (!conversationsHydratedRef.current) return;

    const resolved = resolveRestoreConversationId(conversations, pending);
    if (!resolved) {
      pendingConversationRestoreRef.current = null;
      setSelectedConversationId(null);
      setMessages([]);
      return;
    }
    pendingConversationRestoreRef.current = null;
    void handleSelectConversationRef.current(resolved);
  }, [conversations, loadingConversations, enabledInstanceIds.size]);

  /** Listas CRM: `/chat?openLeadId=` ou `?openClientId=` abre a conversa WhatsApp ligada ao registo. */
  const openLeadIdQ = searchParams.get('openLeadId')?.trim() ?? '';
  const openClientIdQ = searchParams.get('openClientId')?.trim() ?? '';
  useEffect(() => {
    if (!openLeadIdQ && !openClientIdQ) return;
    if (loadingConversations) return;
    if (!conversationsHydratedRef.current) return;
    if (enabledInstanceIds.size === 0) return;

    const returnRaw = searchParams.get('returnTo')?.trim() ?? '';
    const chatListReturn = isChatListReturnPath(returnRaw) ? returnRaw : undefined;
    const clientProfileReturn =
      isChatClientProfileReturn(returnRaw) && openClientIdQ ? openClientIdQ : undefined;

    const norm = (a: string | null | undefined, b: string) =>
      Boolean(a && b && String(a).toLowerCase() === String(b).toLowerCase());

    let targetId: string | null = null;
    if (openLeadIdQ) {
      targetId =
        conversations.find((x) => norm(x.leadId, openLeadIdQ))?.id ??
        conversations.find((x) => x.leadId === openLeadIdQ)?.id ??
        null;
    } else if (openClientIdQ) {
      targetId =
        conversations.find((x) => norm(x.client_id, openClientIdQ))?.id ??
        conversations.find((x) => x.client_id === openClientIdQ)?.id ??
        null;
    }

    const next = new URLSearchParams(searchParams);
    next.delete('openLeadId');
    next.delete('openClientId');
    next.delete('returnTo');
    setSearchParams(next, { replace: true });

    if (targetId) {
      void handleSelectConversationRef.current(
        targetId,
        chatListReturn
          ? { chatListReturn }
          : clientProfileReturn
            ? { clientProfileReturnId: clientProfileReturn }
            : undefined,
      );
    } else {
      toast.info('Nenhuma conversa WhatsApp encontrada para este registo.');
      if (chatListReturn) {
        chatCrmListReturnPathRef.current = null;
        navigate(chatListReturn, { replace: true });
      } else if (clientProfileReturn) {
        chatClientProfileReturnIdRef.current = null;
        navigate(`/clients/${clientProfileReturn}`, { replace: true });
      }
    }
  }, [
    openLeadIdQ,
    openClientIdQ,
    conversations,
    loadingConversations,
    enabledInstanceIds.size,
    searchParams,
    setSearchParams,
    navigate,
  ]);

  /** Mobile: apenas lista em `/chat` — limpa thread ao voltar ou ao abrir a lista. */
  useEffect(() => {
    if (!isMobile) return;
    if (!/^\/chat$/.test(location.pathname)) return;
    if (searchParams.get('conversationId')?.trim()) return;
    setSelectedConversationId(null);
    setMessages([]);
  }, [isMobile, location.pathname, searchParams]);

  /** Sininho / links: `/chat?conversationId=` abre a thread (alinha ao backend de notificações). */
  const conversationIdFromQuery = searchParams.get('conversationId')?.trim() ?? '';
  useEffect(() => {
    if (!conversationIdFromQuery) return;
    if (routeConversationId) return;
    if (selectedConversationId === conversationIdFromQuery) return;
    if (loadingConversations) return;
    if (!conversationsHydratedRef.current) return;
    if (enabledInstanceIds.size === 0) return;

    const next = new URLSearchParams(searchParams);
    next.delete('conversationId');
    setSearchParams(next, { replace: true });

    void handleSelectConversationRef.current(conversationIdFromQuery, undefined);
  }, [
    conversationIdFromQuery,
    routeConversationId,
    selectedConversationId,
    loadingConversations,
    enabledInstanceIds.size,
    searchParams,
    setSearchParams,
  ]);

  /** `/chat/:conversationId` — hidrata seleção (deep link ou refresh). */
  useEffect(() => {
    if (!routeConversationId) return;
    if (selectedConversationId === routeConversationId) return;
    const crmReturn = isChatListReturnPath(chatCrmListReturnPathRef.current)
      ? chatCrmListReturnPathRef.current
      : undefined;
    const st = location.state as { clientProfileReturnId?: string } | null;
    const profileReturn =
      st?.clientProfileReturnId?.trim() || chatClientProfileReturnIdRef.current?.trim() || undefined;
    if (crmReturn) {
      void handleSelectConversationRef.current(routeConversationId, { chatListReturn: crmReturn });
    } else if (profileReturn) {
      void handleSelectConversationRef.current(routeConversationId, {
        clientProfileReturnId: profileReturn,
      });
    } else {
      void handleSelectConversationRef.current(routeConversationId, undefined);
    }
  }, [routeConversationId, selectedConversationId, location.state]);

  useLayoutEffect(() => {
    const el = composerTextareaRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, CHAT_COMPOSER_MAX_HEIGHT_PX)}px`;
  }, [newMessage]);

  const handleSendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedConversationId || !newMessage.trim()) {
      return;
    }

    const text = newMessage.trim();
    const replySnap = replyingTo;
    const replyId = replySnap?.messageId;
    const optimisticId = `optimistic-${crypto.randomUUID()}`;
    pendingOutgoingOptimisticQueueRef.current.push(optimisticId);
    setNewMessage('');
    setReplyingTo(null);
    const optimistic: ChatMessage = {
      id: optimisticId,
      conversation_id: selectedConversationId,
      direction: 'outgoing',
      body: text,
      status: 'queued',
      sentAt: new Date().toISOString(),
      created_at: new Date().toISOString(),
      ...(replyId && replySnap
        ? {
            reply_to_message_id: replyId,
            reply_preview: replySnap.preview,
            reply_sender_name: replySnap.senderName,
          }
        : {}),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      await chatService.sendMessage(selectedConversationId, text, {
        ...(replyId ? { replyToMessageId: replyId } : {}),
      });
      pendingOutgoingOptimisticQueueRef.current = pendingOutgoingOptimisticQueueRef.current.filter(
        (id) => id !== optimisticId
      );
      await loadMessages(selectedConversationId, { silent: true });
      if (enabledInstanceIds.size > 0) {
        loadConversations(Array.from(enabledInstanceIds));
      }
      // Removido toast de sucesso para evitar notificação a cada envio
    } catch (error) {
      pendingOutgoingOptimisticQueueRef.current = pendingOutgoingOptimisticQueueRef.current.filter(
        (id) => id !== optimisticId
      );
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setNewMessage(text);
      if (replySnap) setReplyingTo(replySnap);
      console.error('Erro ao enviar mensagem:', error);
      toast.error('Não foi possível enviar a mensagem', {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const handleSubmitMessageComment = async () => {
    if (!commentForMessage?.id || !commentDraft.trim()) return;
    setCommentSubmitting(true);
    const alsoNote = commentAlsoProfile;
    try {
      const data = await chatService.postMessageComment(commentForMessage.id, {
        commentText: commentDraft.trim(),
        alsoCreateCrmNote: alsoNote,
      });
      const mid = commentForMessage.id;
      setCommentDialogOpen(false);
      setCommentForMessage(null);
      setCommentDraft('');
      setCommentAlsoProfile(false);
      const created = normalizeInternalComment(data?.comment);
      if (created) {
        setMessages((prev) =>
          prev.map((m) => (m.id === mid ? mergeInternalCommentIntoMessage(m, created) : m)),
        );
      }
      if (
        alsoNote &&
        contactProfileOpen &&
        (selectedConversation?.client_id || selectedConversation?.leadId)
      ) {
        const cid = selectedConversation?.client_id;
        const lid = selectedConversation?.leadId;
        try {
          const notes = cid
            ? await chatService.listCrmNotesForClient(cid, 10)
            : await chatService.listCrmNotesForLead(lid!, 10);
          setCrmNotesPreview(notes.map((n) => mapCrmNoteToPreview(n as Record<string, unknown>)));
        } catch {
          /* ignore */
        }
      }
      toast.success('Comentário guardado');
    } catch (error) {
      toast.error('Não foi possível guardar o comentário', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleSubmitNewCrmNote = async () => {
    const t = newCrmNoteText.trim();
    if (!t || !selectedConversation) return;
    const cid = selectedConversation.client_id;
    const lid = selectedConversation.leadId;
    if (!cid && !lid) {
      toast.error('Vincule um cliente ou lead para criar anotações.');
      return;
    }
    setNewCrmNoteSaving(true);
    try {
      await chatService.postCrmNote({
        clientId: cid ?? undefined,
        leadId: lid ?? undefined,
        conversationId: selectedConversation.id,
        noteType: 'general',
        noteText: t,
      });
      setNewCrmNoteOpen(false);
      setNewCrmNoteText('');
      const notes = cid
        ? await chatService.listCrmNotesForClient(cid, 10)
        : await chatService.listCrmNotesForLead(lid!, 10);
      setCrmNotesPreview(notes.map((n) => mapCrmNoteToPreview(n as Record<string, unknown>)));
      toast.success('Anotação criada');
    } catch (error) {
      toast.error('Não foi possível criar a anotação', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setNewCrmNoteSaving(false);
    }
  };

  const handleImageFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selectedConversationId) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Selecione um arquivo de imagem');
      return;
    }
    const caption = newMessage.trim();
    setNewMessage('');
    try {
      setSendingMessage(true);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(new Error('Falha ao ler arquivo'));
        r.readAsDataURL(file);
      });
      const comma = dataUrl.indexOf(',');
      const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
      console.log('[Chat] Enviando imagem', {
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        base64Length: base64.length,
        hasCaption: Boolean(caption),
      });
      await chatService.sendImageMessage(selectedConversationId, {
        fileBase64: base64,
        mimeType: file.type || 'image/jpeg',
        caption: caption || undefined,
      });
      await loadMessages(selectedConversationId, { silent: true });
      if (enabledInstanceIds.size > 0) {
        loadConversations(Array.from(enabledInstanceIds));
      }
    } catch (error) {
      setNewMessage(caption);
      console.error('Erro ao enviar imagem:', error);
      toast.error('Não foi possível enviar a imagem', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSendingMessage(false);
    }
  };

  const handleDocumentFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selectedConversationId) return;
    const mime = (file.type || '').toLowerCase();
    if (mime !== 'application/pdf') {
      toast.error('Selecione um documento PDF');
      return;
    }
    const caption = newMessage.trim();
    setNewMessage('');
    try {
      setSendingMessage(true);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(new Error('Falha ao ler arquivo'));
        r.readAsDataURL(file);
      });
      const comma = dataUrl.indexOf(',');
      const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
      await chatService.sendDocumentMessage(selectedConversationId, {
        fileBase64: base64,
        mimeType: 'application/pdf',
        fileName: file.name,
        caption: caption || undefined,
      });
      await loadMessages(selectedConversationId, { silent: true });
      if (enabledInstanceIds.size > 0) {
        loadConversations(Array.from(enabledInstanceIds));
      }
    } catch (error) {
      setNewMessage(caption);
      console.error('Erro ao enviar documento:', error);
      toast.error('Não foi possível enviar o documento', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSendingMessage(false);
    }
  };

  const handleSyncConversations = async () => {
    if (!selectedInstanceId) return;
    try {
      setSyncingConversations(true);
      const summary = (await chatService.syncConversations(selectedInstanceId, { limit: 200 })) as {
        total?: number;
        upserted?: number;
        skipped?: boolean;
        reason?: string;
      };
      if (summary?.skipped && summary?.reason === 'sync_mode_none') {
        toast.message('Sincronização em lote desativada', {
          description:
            'Esta instância está com sync_mode=none. Use outro período nas configurações ou envie syncMode na API.',
        });
        return;
      }
      if (enabledInstanceIds.size > 0) {
        loadConversations(Array.from(enabledInstanceIds));
      }
      toast.success('Conversas sincronizadas com o WhatsApp', {
        description: `Total encontrado: ${summary?.total ?? 0}`,
      });
    } catch (error) {
      console.error('Erro ao sincronizar conversas:', error);
      toast.error('Não foi possível sincronizar as conversas', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSyncingConversations(false);
    }
  };

  /** Sync com mensagens + tentativa explícita de foto (refresh identity) quando o sync não atualizar identidade. */
  const handleSyncConversation = async () => {
    if (!selectedConversationId) return;
    try {
      setSyncingMessages(true);
      const syncResult = await chatService.syncConversationMessages(selectedConversationId, {
        force: true,
      });
      if (syncResult.conversation) {
        setConversations((prev) =>
          prev.map((c) => (c.id === selectedConversationId ? syncResult.conversation! : c))
        );
      } else if (enabledInstanceIds.size > 0) {
        await loadConversations(Array.from(enabledInstanceIds));
      }
      const summary = syncResult.chat_sync_summary as { identity_refreshed?: boolean; identity_skipped_cooldown?: boolean } | undefined;
      const identityOk = summary?.identity_refreshed === true;
      if (!identityOk && summary?.identity_skipped_cooldown !== true) {
        try {
          const idRes = await chatService.refreshConversationIdentity(selectedConversationId);
          if (idRes.conversation) {
            setConversations((prev) =>
              prev.map((c) => (c.id === selectedConversationId ? idRes.conversation! : c))
            );
          }
        } catch {
          /* refresh opcional */
        }
      }
      await loadMessages(selectedConversationId, { silent: true });
      await loadConversationProfile(selectedConversationId);
      toast.success('Sincronização concluída', {
        description: 'Mensagens atualizadas; foto do perfil quando disponível na origem.',
      });
    } catch (error) {
      console.error('Erro ao sincronizar conversa:', error);
      toast.error('Não foi possível sincronizar a conversa', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSyncingMessages(false);
    }
  };

  const handleMarkConversationRead = async () => {
    if (!selectedConversationId) return;
    try {
      await chatService.markConversationRead(selectedConversationId, true);
      toast.success('Conversa marcada como lida');
      if (enabledInstanceIds.size > 0) {
        loadConversations(Array.from(enabledInstanceIds));
      }
    } catch (error) {
      console.error('Erro ao marcar conversa como lida:', error);
      toast.error('Não foi possível marcar como lida', {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const openLinkDialog = () => {
    if (!selectedConversation) return;
    setLinkSearch('');
    setLinkPage(1);
    setSelectedLinkTarget(null);
    if (selectedConversation.link_state === 'review_required') {
      const suggestedType = (selectedConversation.metadata as any)?.match_sugerido?.type;
      if (suggestedType === 'lead') setLinkTab('leads');
      else setLinkTab('clients');
      const candidates = (selectedConversation.metadata as any)?.match_sugerido?.candidates;
      if (Array.isArray(candidates) && candidates.length > 0) {
        const first = candidates[0];
        if (first && typeof first.id === 'string' && (first.type === 'client' || first.type === 'lead')) {
          setSelectedLinkTarget({ type: first.type, id: first.id });
        }
      }
    } else {
      setLinkTab(selectedConversation.client_id ? 'clients' : selectedConversation.leadId ? 'leads' : 'clients');
    }
    setLinkDialogOpen(true);
  };

  const handleConfirmLink = async () => {
    if (!selectedConversation || !selectedLinkTarget) return;
    try {
      const updated = await chatService.linkConversation(selectedConversation.id, selectedLinkTarget);
      setConversations((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      if (selectedConversationId === updated.id) {
        await loadConversationProfile(updated.id);
      }
      setLinkDialogOpen(false);
      toast.success('Conversa vinculada com sucesso');
    } catch (error) {
      console.error('Erro ao vincular conversa:', error);
      toast.error('Não foi possível vincular a conversa', {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const handleConfirmUnlink = async () => {
    if (!selectedConversation) return;
    try {
      const updated = await chatService.unlinkConversation(selectedConversation.id);
      setConversations((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setCurrentClient(null);
      setCurrentLead(null);
      if (selectedConversationId === updated.id) {
        await loadConversationProfile(updated.id);
      }
      setUnlinkConfirmOpen(false);
      toast.success('Vínculo da conversa removido');
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
    } catch (error) {
      console.error('Erro ao remover vínculo:', error);
      toast.error('Não foi possível remover o vínculo', {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const handleAddLead = async () => {
    if (!selectedConversation) return;
    
    try {
      const leadData: any = {
        name: selectedConversation.contactName || 
              selectedConversation.profileName || 
              selectedConversation.phoneNumber || 
              selectedConversation.external_chat_id || 
              'Contato WhatsApp',
        source: 'WhatsApp',
      };

      if (selectedConversation.phoneNumber) {
        leadData.phone = selectedConversation.phoneNumber;
      }

      const response = await apiClient.post('/api/leads', leadData);
      if (response.error) {
        throw new Error(response.error);
      }
      const createdLead = response.data as { id: string } | undefined;
      if (!createdLead?.id) {
        throw new Error('Lead criado sem ID retornado');
      }

      await chatService.linkConversation(selectedConversation.id, {
        type: 'lead',
        id: createdLead.id,
      });

      // Atualizar lista/perfil da conversa após criar lead + vínculo
      if (selectedConversationId) {
        if (enabledInstanceIds.size > 0) {
          await loadConversations(Array.from(enabledInstanceIds));
        }
        await loadConversationProfile(selectedConversationId);
      }

      toast.success('Lead adicionado com sucesso!');
    } catch (error) {
      console.error('Erro ao adicionar lead:', error);
      toast.error('Não foi possível adicionar o lead', {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const handleConvertToClient = async () => {
    if (!currentLead || !selectedConversation) return;

    try {
      // Importar helper de clientes
      const { addClient } = await import('@/utils/clients-helpers');
      
      // Criar cliente a partir do lead
      const clientResult = await addClient({
        name: currentLead.name,
        company: currentLead.company || undefined,
        email: currentLead.email || undefined,
        phone: currentLead.phone || selectedConversation.phoneNumber || undefined,
        notes: currentLead.notes || undefined,
        status: 'Ativo',
      });

      if (!clientResult.success || !clientResult.data) {
        throw new Error('Erro ao criar cliente');
      }

      const createdClient = clientResult.data as { id?: string };
      if (!createdClient.id) {
        throw new Error('Resposta de criação de cliente sem id');
      }

      await apiClient.patch(`/api/leads/${currentLead.id}`, {
        status: 'Convertido',
        migrated_client_id: createdClient.id,
      });

      void queryClient.invalidateQueries({ queryKey: ['clients', 'list'] });
      void queryClient.invalidateQueries({ queryKey: ['leads'] });

      // Atualizar o perfil da conversa após converter lead para cliente
      if (selectedConversationId) {
        if (enabledInstanceIds.size > 0) {
          await loadConversations(Array.from(enabledInstanceIds));
        }
        await loadConversationProfile(selectedConversationId);
      }

      toast.success('Lead convertido para cliente com sucesso!');
    } catch (error) {
      console.error('Erro ao converter lead:', error);
      toast.error('Não foi possível converter o lead para cliente', {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  // Função auxiliar para enviar notificação
  const sendNotification = async (
    resourceType: string,
    action: string,
    variables: Record<string, string>,
    resourceId?: string
  ): Promise<boolean> => {
    try {
      const client = currentClient || currentLead;
      if (!client) return false;

      const phone = client.phone || selectedConversation?.phoneNumber;
      const email = client.email;

      if (!phone && !email) {
        console.warn('Cliente sem telefone ou email para enviar notificação');
        return false;
      }

      const result = await messagesService.send({
        resourceType,
        action,
        recipientPhone: phone || undefined,
        recipientEmail: email || undefined,
        channel: phone ? 'whatsapp' : 'email',
        variables,
        metadata: {
          resource_id: resourceId,
          /** Nunca enviar `leads.id` como client_id do CRM (evita vínculo inválido). */
          ...(currentClient?.id ? { client_id: currentClient.id } : {}),
          created_from: 'chat_quick_action',
        },
      });

      // Se a mensagem foi enviada via WhatsApp, sincronizar a conversa
      if (result && result.conversationId && phone) {
        try {
          // Pequeno delay para garantir que a mensagem foi salva no backend
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Sincronizar mensagens da conversa
          await chatService.syncConversationMessages(result.conversationId, { limit: 100, syncMode: 'full' });
          
          // Se esta é a conversa selecionada, recarregar mensagens
          if (selectedConversationId === result.conversationId) {
            await loadMessages(result.conversationId, { silent: true });
            // Reforço: novo conteúdo + Radix às vezes só estabiliza scrollHeight no frame seguinte
            queueMicrotask(() => scrollMessagesToBottom());
            setTimeout(() => scrollMessagesToBottom(), 50);
          } else {
            // Se não é a conversa selecionada, atualizar a lista de conversas
            if (enabledInstanceIds.size > 0) {
              loadConversations(Array.from(enabledInstanceIds));
            }
          }
        } catch (error) {
          console.error('Erro ao sincronizar mensagens após enviar notificação:', error);
        }
      }
      return true;
    } catch (error) {
      console.error('Erro ao enviar notificação:', error);
      // Não mostrar erro ao usuário, apenas logar
      return false;
    }
  };

  const handleCreateProposal = () => {
    if (!selectedConversation?.client_id && !selectedConversation?.leadId) return;
    consumeKanbanProposalColumnContextIfMatch(selectedConversation.id);
    setViewMode('proposal-create');
  };

  const handleBackFromProposalCreate = () => {
    setViewMode('conversation');
  };

  const handleProposalCreatedInChat = async (
    created: ProposalCreateSuccessPayload,
    mode: 'sent' | 'draft'
  ) => {
    setViewMode('conversation');
    try {
      const clientIdForTimeline = selectedConversation?.client_id ?? created.client_id ?? null;
      if (clientIdForTimeline) {
        await recordClientTimelineEvent(clientIdForTimeline, {
          event_name: mode === 'sent' ? 'chat_proposal_created' : 'chat_proposal_draft_saved',
          source: 'chat',
          actor_type: 'user',
          reference_type: 'proposal',
          reference_id: created.id,
          event_key: `chat_proposal_${mode}:${created.id}`,
          metadata: {
            conversation_id: selectedConversation?.id ?? null,
            proposal_status: mode,
          },
        });
      }
    } catch (error) {
      console.error('Erro ao registrar timeline da proposta criada no chat:', error);
    }

    const contact = currentClient || currentLead;
    if (contact) {
      try {
        const proposalLink = created.public_link_path
          ? `${window.location.origin}${created.public_link_path}`
          : `${window.location.origin}/proposals/${created.id}`;
        await sendNotification('proposals', 'created', {
          client_name: contact.name || 'Cliente',
          proposal_title: created.title,
          proposal_amount: (created.amount ?? 0).toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
          proposal_link: proposalLink,
        }, created.id);
      } catch (error) {
        console.error('Erro ao notificar proposta criada no chat:', error);
      }
    }

    if (mode === 'sent') {
      toast.success('Proposta criada com sucesso');
    } else {
      toast.success('Rascunho de proposta salvo');
    }
  };

  const handleChatOpenAgendaComposer = useCallback(() => {
    if (!selectedConversation) return;
    if (!selectedConversation.client_id && !selectedConversation.leadId) {
      toast.error('Vincule um cliente a esta conversa para agendar um compromisso.');
      return;
    }
    const label = selectedIdentity?.displayName?.trim() || 'cliente';
    const title = encodeURIComponent(`Atendimento com ${label}`);
    if (selectedConversation.client_id) {
      navigate(`/agenda?new=1&client_id=${selectedConversation.client_id}&title=${title}`);
      return;
    }
    if (selectedConversation.leadId) {
      navigate(`/agenda?new=1&lead_id=${selectedConversation.leadId}&title=${title}`);
    }
  }, [navigate, selectedConversation, selectedIdentity?.displayName]);

  const handleChatMeetNowConfirmed = useCallback(async () => {
    if (!selectedConversationId) return;
    setMeetNowConfirmOpen(false);
    setMeetNowSubmitting(true);
    try {
      const r = await chatService.createMeetNowFromChat(selectedConversationId);
      void loadMessages(selectedConversationId, { silent: true });
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
  }, [selectedConversationId, loadMessages]);

  const handleChatOpenScheduleLater = useCallback(() => {
    if (!selectedConversation) return;
    if (!selectedConversation.client_id && !selectedConversation.leadId) {
      toast.error('Vincule um cliente a esta conversa para agendar um compromisso.');
      return;
    }
    setSchedDay(new Date());
    setSchedTime('10:00');
    setSchedDuration(60);
    setSchedCreateMeet(true);
    setSchedNote('');
    setScheduleLaterOpen(true);
  }, [selectedConversation]);

  const handleChatScheduleLaterSubmit = useCallback(async () => {
    if (!selectedConversationId || !selectedConversation) return;
    const dayStr = format(schedDay, 'yyyy-MM-dd');
    const startLocal = parse(`${dayStr} ${schedTime}`, 'yyyy-MM-dd HH:mm', new Date());
    if (Number.isNaN(startLocal.getTime())) {
      toast.error('Data ou horário inválido');
      return;
    }
    const endLocal = addMinutes(startLocal, schedDuration);
    const label = selectedIdentity?.displayName?.trim() || 'cliente';
    setScheduleLaterBusy(true);
    try {
      const r = await chatService.scheduleAppointmentFromChat(selectedConversationId, {
        title: `Atendimento com ${label}`,
        starts_at: startLocal.toISOString(),
        ends_at: endLocal.toISOString(),
        type: 'meeting',
        description: schedNote.trim() || 'Agendado a partir do chat',
        create_google_event: schedCreateMeet,
        create_meet: schedCreateMeet,
        send_chat_confirmation: true,
      });
      setScheduleLaterOpen(false);
      void loadMessages(selectedConversationId, { silent: true });
      if (r.warnings?.length) {
        for (const w of r.warnings) toast.message(w);
      }
      if (r.message_sent) {
        toast.success('Compromisso criado e confirmação enviada no chat.');
      } else {
        toast.warning('Compromisso criado, mas a mensagem não foi enviada no WhatsApp.');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao agendar');
    } finally {
      setScheduleLaterBusy(false);
    }
  }, [
    selectedConversationId,
    selectedConversation,
    schedDay,
    schedTime,
    schedDuration,
    schedCreateMeet,
    schedNote,
    selectedIdentity?.displayName,
    loadMessages,
  ]);

  const handleCreateTask = () => {
    setTaskDialogOpen(true);
  };

  const handleSaveTask = async (formData: FormData) => {
    try {
      const title = formData.get('title') as string;
      const description = formData.get('description') as string;
      const date = formData.get('date') as string;
      const time = formData.get('time') as string;
      const priority = formData.get('priority') as string;

      const task = await tasksService.createTask({
        title,
        description: description || null,
        date: date || null,
        time: time || null,
        status: 'pending',
        priority: (priority === 'low' || priority === 'high' ? priority : 'medium') as 'low' | 'medium' | 'high',
        clientId: currentClient?.id || currentLead?.id || null,
        client: currentClient?.name || currentLead?.name || null,
        checklist: [],
      });

      toast.success('Tarefa criada com sucesso!');
      setTaskDialogOpen(false);

      // Enviar notificação
      const client = currentClient || currentLead;
      if (client) {
        const dueDate = date ? format(new Date(date), 'dd/MM/yyyy', { locale: ptBR }) : 'Não definido';
        await sendNotification('tasks', 'created', {
          client_name: client.name || 'Cliente',
          task_title: title,
          task_description: description || '',
          task_due_date: dueDate,
          task_link: `${window.location.origin}/tasks/${task.id}`,
        }, task.id);
      }
    } catch (error) {
      console.error('Erro ao criar tarefa:', error);
      toast.error('Não foi possível criar a tarefa', {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const handleOpenTicket = () => {
    setTicketDialogOpen(true);
  };

  const handleSaveTicket = async (formData: FormData) => {
    try {
      const subject = formData.get('subject') as string;
      const description = formData.get('description') as string;
      const categoryId = formData.get('categoryId') as string;
      const priority = formData.get('priority') as string;

      const contactName = currentClient?.name || currentLead?.name || selectedConversation?.contactName || 'Contato WhatsApp';
      const contactEmail = currentClient?.email || currentLead?.email || '';
      const contactPhone = currentClient?.phone || currentLead?.phone || selectedConversation?.phoneNumber || '';

      const ticket = await ticketsService.createTicket({
        contact_name: contactName,
        contact_email: contactEmail,
        contact_phone: contactPhone || undefined,
        subject,
        description,
        category_id: categoryId || undefined,
        priority: priority as any,
        client_id: currentClient?.id || undefined,
        channel: 'whatsapp',
        status: 'new',
      });

      toast.success('Ticket criado com sucesso!');
      setTicketDialogOpen(false);

      // Enviar notificação
      if (contactPhone || contactEmail) {
        await sendNotification('tickets', 'created', {
          contact_name: contactName,
          ticket_number: ticket.id.substring(0, 8).toUpperCase(),
          ticket_subject: subject,
          ticket_link: `${window.location.origin}/tickets/${ticket.id}`,
        }, ticket.id);
      }
    } catch (error) {
      console.error('Erro ao criar ticket:', error);
      toast.error('Não foi possível criar o ticket', {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const handleCreateInvoice = () => {
    if (!selectedConversation?.client_id) return;
    setViewMode('invoice-create');
  };

  const handleBackFromInvoiceCreate = () => {
    setViewMode('conversation');
  };

  const handleInvoiceCreatedInChat = async (invoiceId: string) => {
    setViewMode('conversation');
    try {
      const invoice = await customerInvoicesService.getById(invoiceId);
      const clientIdForTimeline = selectedConversation?.client_id ?? invoice?.client_id ?? null;
      if (clientIdForTimeline) {
        await recordClientTimelineEvent(clientIdForTimeline, {
          event_name: 'chat_invoice_created',
          source: 'chat',
          actor_type: 'user',
          reference_type: 'customer_invoice',
          reference_id: invoiceId,
          event_key: `chat_invoice_created:${invoiceId}`,
          metadata: {
            conversation_id: selectedConversation?.id ?? null,
          },
        });
      }
      if (invoice?.payment_token) {
        const dueDate = new Date(invoice.due_date).toLocaleDateString('pt-BR');
        const sent = await sendNotification('invoices', 'created', {
          client_name: currentClient?.name || 'Cliente',
          invoice_number: invoice.invoice_number || invoice.id.slice(0, 8).toUpperCase(),
          invoice_total: (invoice.amount_cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
          due_date: dueDate,
          invoice_link: buildInvoiceLink(invoice.payment_token),
        }, invoice.id);
        if (sent && clientIdForTimeline) {
          await recordClientTimelineEvent(clientIdForTimeline, {
            event_name: 'chat_invoice_sent',
            source: 'chat',
            actor_type: 'user',
            reference_type: 'customer_invoice',
            reference_id: invoice.id,
            event_key: `chat_invoice_sent:${invoice.id}:${selectedConversation?.id ?? 'unknown'}`,
            metadata: {
              channel: 'whatsapp',
              conversation_id: selectedConversation?.id ?? null,
            },
          });
        }
      }
    } catch (error) {
      console.error('Erro ao enviar fatura criada no chat:', error);
    }
    toast.success('Fatura criada com sucesso');
  };

  const handleCreateContract = () => {
    if (!selectedConversation?.client_id && !selectedConversation?.leadId) return;
    if (!currentClient && !currentLead) return;
    setViewMode('contract-create');
  };

  const handleBackFromContractCreate = () => {
    setViewMode('conversation');
  };

  const handleContractCreatedInChat = async (created: Contract, mode: 'draft' | 'signature') => {
    const createdWithView = created as Contract & {
      public_view?: { public_view_url?: string | null; token?: string };
    };
    setViewMode('conversation');
    try {
      const clientIdForTimeline = selectedConversation?.client_id ?? created.client_id ?? null;
      if (clientIdForTimeline) {
        await recordClientTimelineEvent(clientIdForTimeline, {
          event_name:
            mode === 'draft' ? 'chat_contract_draft_saved' : 'chat_contract_sent_for_signature',
          source: 'chat',
          actor_type: 'user',
          reference_type: 'contract',
          reference_id: created.id,
          event_key: `chat_contract_${mode}:${created.id}`,
          metadata: {
            conversation_id: selectedConversation?.id ?? null,
            contract_mode: mode,
          },
        });
      }
    } catch (error) {
      console.error('Erro ao registrar timeline do contrato criado no chat:', error);
    }

    const contact = currentClient || currentLead;
    if (contact) {
      try {
        await sendNotification('contracts', 'created', {
          client_name: contact.name || 'Cliente',
          contract_title: createdWithView.title,
          contract_number: createdWithView.id.substring(0, 8).toUpperCase(),
          contract_link: `${window.location.origin}/contracts/${createdWithView.id}`,
          contract_public_view_url:
            createdWithView.public_view?.public_view_url ??
            (createdWithView.public_view?.token
              ? `${window.location.origin}/contract-view/${createdWithView.public_view.token}`
              : undefined),
        }, createdWithView.id);
      } catch (error) {
        console.error('Erro ao notificar contrato criado no chat:', error);
      }
    }

    if (mode === 'draft') {
      toast.success('Rascunho de contrato salvo');
    } else {
      toast.success('Contrato enviado para assinatura');
    }
  };

  const handleNavigateToSettings = () => {
    navigate('/settings?section=whatsapp&openAddConnection=1');
  };

  const mergeAttendanceFromPayload = useCallback((raw: Record<string, unknown>) => {
    const id = typeof raw.id === 'string' ? raw.id : null;
    if (!id) return;
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        return {
          ...c,
          attendance_status:
            (raw.attendance_status as ChatConversation['attendance_status']) ?? c.attendance_status,
          assigned_to_user_id:
            (raw.assigned_to_user_id as string | null | undefined) ?? c.assigned_to_user_id,
          queue_id: (raw.queue_id as string | null | undefined) ?? c.queue_id,
          assigned_at: (raw.assigned_at as string | undefined) ?? c.assigned_at,
          closed_at: (raw.closed_at as string | null | undefined) ?? c.closed_at,
          last_assignment_reason:
            (raw.last_assignment_reason as string | undefined) ?? c.last_assignment_reason,
          assignee_email:
            raw.assignee_email !== undefined ? (raw.assignee_email as string | null | undefined) : c.assignee_email,
          assignee_display:
            raw.assignee_display !== undefined
              ? (raw.assignee_display as string | null | undefined)
              : c.assignee_display,
          assigned_team_id:
            raw.assigned_team_id !== undefined
              ? (raw.assigned_team_id as string | null | undefined)
              : c.assigned_team_id,
          assigned_team_name:
            raw.assigned_team_name !== undefined
              ? (raw.assigned_team_name as string | null | undefined)
              : c.assigned_team_name,
        };
      }),
    );
  }, []);

  const handleAttendConversation = useCallback(async () => {
    if (!selectedConversationId || !user?.id) return;
    setAttendingConversation(true);
    try {
      await chatService.attendConversation(selectedConversationId);
      toast.success('Você assumiu o atendimento desta conversa');
      mergeAttendanceFromPayload({
        id: selectedConversationId,
        attendance_status: 'in_progress',
        assigned_to_user_id: user.id,
        assigned_team_id: null,
        assigned_team_name: null,
        assignee_email: user.email,
        assignee_display:
          [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.email,
      });
    } catch (error) {
      toast.error('Não foi possível atender', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setAttendingConversation(false);
    }
  }, [selectedConversationId, user, mergeAttendanceFromPayload]);

  const handleCloseAttendance = useCallback(async () => {
    if (!selectedConversationId) return;
    try {
      await chatService.patchConversationAttendance(selectedConversationId, { action: 'close' });
      toast.success('Atendimento encerrado');
      mergeAttendanceFromPayload({
        id: selectedConversationId,
        attendance_status: 'closed',
        closed_at: new Date().toISOString(),
        assigned_to_user_id: null,
        queue_id: null,
        assigned_team_id: null,
        assigned_team_name: null,
        assignee_email: null,
        assignee_display: null,
      });
    } catch (error) {
      toast.error('Não foi possível encerrar', {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }, [selectedConversationId, mergeAttendanceFromPayload]);

  const openTransferDialog = useCallback(async () => {
    if (!user?.tenant_id) {
      toast.info('A transferência requer conta com equipa na empresa.');
      return;
    }
    setTransferMode('operator');
    setTransferTargetId('');
    setTransferTeamId('');
    setTransferDialogOpen(true);
    try {
      const [list, teamsList] = await Promise.all([
        getMyTenantUsers(),
        teamsService.getTeams().catch(() => [] as Team[]),
      ]);
      const others = list.filter((u) => u.id !== user.id);
      setTransferUsers(others);
      setTransferTeams(teamsList);
      if (others.length === 1) {
        setTransferTargetId(others[0].id);
      }
      if (teamsList.length === 1) {
        setTransferTeamId(teamsList[0].id);
      }
    } catch (e) {
      toast.error('Não foi possível carregar dados para transferência', {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }, [user?.id, user?.tenant_id]);

  const handleConfirmTransfer = useCallback(async () => {
    if (!selectedConversationId) return;
    if (transferMode === 'operator' && !transferTargetId) return;
    if (transferMode === 'team' && !transferTeamId) return;
    setTransferSubmitting(true);
    try {
      if (transferMode === 'operator') {
        await chatService.transferConversation(selectedConversationId, { toUserId: transferTargetId });
        toast.success('Atendimento transferido para o operador');
      } else {
        await chatService.transferConversation(selectedConversationId, { toTeamId: transferTeamId });
        toast.success('Conversa transferida para a equipe');
      }
      setTransferDialogOpen(false);
      const ids = Array.from(enabledInstanceIdsRef.current);
      if (ids.length > 0) {
        await loadConversations(ids);
      }
    } catch (error) {
      toast.error('Não foi possível transferir', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setTransferSubmitting(false);
    }
  }, [selectedConversationId, transferMode, transferTargetId, transferTeamId, loadConversations]);

  const handleToggleInstance = async (instanceId: string) => {
    const enabling = !enabledInstanceIds.has(instanceId);
    try {
      await chatService.patchInstance(instanceId, { enabledInChat: enabling });
      await loadInstances();
    } catch (error) {
      console.error('Erro ao atualizar instância no chat:', error);
      toast.error('Não foi possível alterar a instância', {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const handleAddConnection = () => {
    setFiltersPopoverOpen(false);
    handleNavigateToSettings();
  };

  const enabledInstances = useMemo(() => {
    return instances.filter((instance) => enabledInstanceIds.has(instance.id));
  }, [instances, enabledInstanceIds]);

  const renderConversationItem = (conversation: ChatConversation) => {
    const isActive = selectedConversationId === conversation.id;
    const unread = conversation.unreadCount ?? 0;
    const linkedClient = conversation.client_id ? clientsById.get(conversation.client_id) ?? null : null;
    const linkedLead = conversation.leadId ? leadsById.get(conversation.leadId) ?? null : null;
    const identity = resolveConversationIdentity(conversation, linkedClient, linkedLead);
    const showPhoneRow =
      Boolean(identity.phoneLine) && identity.displayName.trim() !== identity.phoneLine.trim();

    return (
      <button
      key={conversation.id}
        type="button"
        onClick={() => {
          chatCrmListReturnPathRef.current = null;
          handleSelectConversation(conversation.id);
        }}
        className={cn(
          'my-0.5 box-border w-full max-w-full min-w-0 rounded-lg border border-transparent px-2 py-1.5 text-left transition-colors active:bg-muted/40 md:min-h-0 md:px-2 md:py-1.5',
          'touch-manipulation',
          isActive
            ? 'bg-primary/10 shadow-none ring-1 ring-primary/25 dark:bg-primary/15 dark:ring-primary/35'
            : 'bg-background/50 hover:border-border/40 hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        )}
      >
      <div className="flex items-start gap-2 md:gap-2.5">
          <div className="relative shrink-0">
          <Avatar 
              className={cn(
                'h-9 w-9 md:h-10 md:w-10',
                'cursor-pointer transition-opacity hover:opacity-85',
              )}
            onClick={(e) => openContactProfileFromList(conversation, e)}
          >
            {identity.avatarUrl ? (
                <AvatarImage src={identity.avatarUrl} alt={identity.displayName || 'Contato'} />
            ) : (
                <AvatarFallback className="bg-primary/10 text-xs font-semibold uppercase text-primary md:text-[13px]">
              {identity.initials}
              </AvatarFallback>
            )}
        </Avatar>
            {unread > 0 ? (
              <span
                className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-bold leading-none text-primary-foreground shadow-sm"
                aria-label={`${unread} não lidas`}
              >
                {unread > 99 ? '99+' : unread}
              </span>
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div
                className={cn(
                  'min-w-0 flex-1 truncate text-sm font-semibold leading-tight md:text-sm md:font-medium',
                  isActive ? 'text-foreground' : 'text-foreground/95',
                  'cursor-pointer transition-opacity hover:opacity-80',
                )}
                onClick={(e) => openContactProfileFromList(conversation, e)}
              >
                <span>{identity.displayName}</span>
                {conversation.client_id ? (
                  <span className="ml-1.5 font-normal text-[10px] text-muted-foreground">· Cliente</span>
                ) : null}
                {!conversation.client_id && conversation.leadId ? (
                  <span className="ml-1.5 font-normal text-[10px] text-muted-foreground">· Lead</span>
                ) : null}
              </div>
              {shouldShowCommunicationChannelBadge(conversation.provider) ? (
                <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:inline">
                  {communicationProviderBadgeLabel(conversation.provider)}
                </span>
              ) : null}
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {formatRelativeDate(conversation.lastMessageAt || conversation.updated_at)}
            </span>
          </div>
            {showPhoneRow ? (
              <p className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">{identity.phoneLine}</p>
            ) : null}
            <p className="mt-0.5 line-clamp-1 text-[12px] leading-snug text-muted-foreground md:text-xs">
              {conversation.lastMessagePreview || 'Sem mensagens recentes'}
          </p>
            <div className="mt-1 flex flex-wrap items-center gap-0.5 md:mt-1 md:gap-1">
              {selectChatBadges(conversation, slaUiContext).map((b) => (
                <Badge
                  key={b.key}
                  variant={b.variant}
                  className="h-4 border-border/40 px-1 py-0 text-[10px] font-normal leading-none md:h-4"
                >
                  {b.label}
                </Badge>
              ))}
          </div>
        </div>
        </div>
      </button>
  );
  };

  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-hidden max-md:mx-0 max-md:h-full max-md:min-h-0 md:-m-6',
        isMobileConversationView &&
          'fixed inset-0 z-[60] m-0 max-h-[100dvh] h-[100dvh] bg-background',
        !isMobileConversationView &&
          'md:h-[calc(100dvh-var(--app-topbar-height)-var(--chat-page-offset)+var(--chat-extra-height))] md:max-h-[calc(100dvh-var(--app-topbar-height)-var(--chat-page-offset)+var(--chat-extra-height))] md:overflow-hidden md:pb-0',
      )}
    >
      {instances.length > 0 ? (
        <div className="flex flex-1 flex-col min-h-0 overflow-hidden max-md:h-full max-md:min-h-0 md:h-full">
          {/* Renderizar conteúdo do chat - apenas uma vez, reutilizado para todas as abas */}
            <div
              className={cn(
                'flex min-h-0 flex-1 flex-col overflow-hidden px-3 pt-2 pb-2 max-md:h-full max-md:min-h-0 md:max-w-none md:px-3 md:pb-0 md:pt-3',
                isMobileConversationView && 'px-0 pt-0 pb-0',
                !isMobileConversationView && 'md:h-full md:min-h-0',
              )}
            >
            <div
              className={cn(
                'flex min-h-0 flex-1 flex-col gap-3 max-md:h-full max-md:min-h-0 md:flex-row md:items-stretch md:gap-3',
                isMobileConversationView && 'gap-0',
                !isMobileConversationView && 'md:h-full md:min-h-0 md:overflow-hidden',
              )}
            >
                <Card
                  className={cn(
                    'flex min-h-0 flex-col border-border/80 shadow-sm max-md:flex-1 md:h-full md:min-h-0 md:w-[minmax(360px,400px)] md:max-w-[400px] md:shrink-0 md:overflow-hidden md:self-stretch',
                    isMobile && routeConversationId && 'hidden md:flex',
                  )}
                >
                  <CardHeader className="flex-shrink-0 space-y-2 border-b border-border bg-muted/20 px-2 py-2 md:space-y-2 md:px-2.5 md:py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="relative min-w-0 flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={searchTerm}
                          onChange={(event) => setSearchTerm(event.target.value)}
                          placeholder="Buscar por nome ou telefone..."
                          className="h-9 bg-background pl-9 md:h-8 md:text-[13px]"
                        />
                      </div>
                      <Popover open={filtersPopoverOpen} onOpenChange={setFiltersPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                            variant={filtersPopoverOpen ? 'secondary' : 'outline'}
                            size="icon"
                            className="h-9 w-9 shrink-0 rounded-lg md:h-8 md:w-8"
                            aria-label="WhatsApp e filtros da lista"
                            aria-expanded={filtersPopoverOpen}
                          >
                            <ListFilter className="h-4 w-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className={cn(
                            'p-0',
                            isMobile
                              ? 'w-[calc(100vw-0.5rem)] max-w-[100vw] rounded-t-2xl border-t p-0'
                              : 'w-[min(100vw-1.5rem,22rem)]',
                          )}
                          align={isMobile ? 'center' : 'end'}
                          side={isMobile ? 'bottom' : undefined}
                          sideOffset={isMobile ? 8 : 6}
                          collisionPadding={8}
                        >
                          <div
                            className={cn(
                              'overflow-y-auto overscroll-contain',
                              isMobile ? 'max-h-[min(78dvh,560px)]' : 'max-h-[min(72dvh,520px)]',
                            )}
                          >
                            {instances.length > 0 ? (
                              <>
                                <div className="border-b border-border bg-muted/20 px-3 py-2.5">
                                  <div className="flex min-w-0 items-center gap-2.5 rounded-lg border border-border/60 bg-card/90 px-2.5 py-2 shadow-sm">
                      {activeInstance ? (
                        <>
                          <div className="relative shrink-0">
                                          <Avatar className="h-9 w-9 rounded-lg shadow-sm ring-2 ring-background">
                              {instanceConnectionUi.avatarUrl ? (
                                <AvatarImage
                                  src={instanceConnectionUi.avatarUrl}
                                  alt=""
                                  className="object-cover"
                                />
                              ) : (
                                              <AvatarFallback className="rounded-lg bg-emerald-600/12 text-sm font-semibold uppercase text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                                  {(instanceConnectionUi.displayName || '?').slice(0, 2)}
                                </AvatarFallback>
                              )}
                            </Avatar>
                            <span
                                            className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-card ${
                                activeInstance.status === 'connected'
                                  ? 'bg-emerald-500'
                                  : activeInstance.status === 'connecting'
                                    ? 'bg-amber-500'
                                    : 'bg-muted-foreground/50'
                              }`}
                              aria-hidden
                            />
                          </div>
                                        <div className="min-w-0 flex-1 text-left">
                                          <div className="flex min-w-0 items-center gap-2">
                                            <span className="truncate text-sm font-semibold leading-snug">
                                {instanceConnectionUi.displayName}
                              </span>
                              {enabledInstanceIds.size > 1 && (
                                <Badge
                                  variant="secondary"
                                                className="h-4 shrink-0 px-1.5 py-0 text-[10px]"
                                >
                                  +{enabledInstanceIds.size - 1}
                                </Badge>
                              )}
                            </div>
                            {instanceConnectionUi.phoneDisplay ? (
                                            <p className="mt-0.5 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
                                {instanceConnectionUi.phoneDisplay}
                              </p>
                            ) : (
                                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                                {activeInstance.status === 'connected'
                                  ? 'Conectado'
                                  : activeInstance.status === 'connecting'
                                    ? 'A conectar…'
                                    : 'Desconectado'}
                              </p>
                            )}
                          </div>
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground">Selecione uma instância</span>
                      )}
                    </div>
                                </div>
                  <div className="p-2">
                                  <div className="border-b border-border px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                      Conexões WhatsApp
            </div>
                                  <div className="max-h-[240px] overflow-y-auto">
                      {instances.map((instance) => {
                        const isEnabled = enabledInstanceIds.has(instance.id);
                        const rowUi = resolveInstanceConnectionUi(instance);
                        const statusLine =
                          instance.status === 'connected'
                            ? 'Conectado'
                            : instance.status === 'connecting'
                              ? 'A conectar…'
                              : 'Desconectado';
                        return (
                          <div
                            key={instance.id}
                                          className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50"
                            onClick={() => {
                                            void handleToggleInstance(instance.id);
                              if (!isEnabled) {
                                setSelectedInstanceId(instance.id);
                              }
                            }}
                          >
                            <Checkbox
                              checked={isEnabled}
                              disabled={instance.can_manage === false}
                              className="shrink-0"
                              onCheckedChange={() => {
                                if (instance.can_manage === false) return;
                                              void handleToggleInstance(instance.id);
                                if (!isEnabled) {
                                  setSelectedInstanceId(instance.id);
                                }
                              }}
                            />
                            <div className="relative h-9 w-9 shrink-0">
                              <Avatar className="h-9 w-9 rounded-lg ring-1 ring-border">
                                {rowUi.avatarUrl ? (
                                                <AvatarImage src={rowUi.avatarUrl} alt="" className="object-cover" />
                                              ) : (
                                                <AvatarFallback className="rounded-lg bg-emerald-600/12 text-xs font-semibold uppercase text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                                    {(rowUi.displayName || '?').slice(0, 2)}
                                  </AvatarFallback>
                                )}
                              </Avatar>
                              <span
                                className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-popover ${
                                  instance.status === 'connected'
                                    ? 'bg-emerald-500'
                                    : instance.status === 'connecting'
                                      ? 'bg-amber-500'
                                      : 'bg-muted-foreground/50'
                                }`}
                                aria-hidden
                              />
                            </div>
                            <div className="min-w-0 flex-1 text-left">
                                            <div className="truncate text-sm font-semibold leading-snug">
                                {rowUi.displayName}
                              </div>
                                            <div className="truncate text-xs tabular-nums text-muted-foreground">
                                {rowUi.phoneDisplay || statusLine}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-1 border-t border-border">
                      <div
                                      className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50"
                        onClick={handleAddConnection}
                      >
                                      <div className="flex h-4 w-4 items-center justify-center rounded border-2 border-dashed border-muted-foreground/50">
                          <Plus className="h-3 w-3 text-muted-foreground" />
            </div>
                        <span className="text-sm text-muted-foreground">Adicionar conexão</span>
          </div>
              </div>
                  </div>
                              </>
                            ) : null}
                            <div
                              className={cn(
                                'space-y-4 p-3',
                                instances.length > 0 && 'border-t border-border',
                              )}
                            >
                    <div className="space-y-1.5">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Tipo de conversa
                      </p>
                      <Tabs
                        value={activeTab}
                        onValueChange={(value) =>
                          setActiveTab(value as 'all' | 'unread' | 'leads' | 'clients')
                        }
                        className="w-full"
                      >
                                  <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/50 p-1">
                                    <TabsTrigger value="all" className="h-8 px-2.5 py-1.5 text-xs">
                            Todas
                          </TabsTrigger>
                                    <TabsTrigger value="unread" className="h-8 gap-1 px-2.5 py-1.5 text-xs">
                            Não lidas
                            {attendanceCounts.unread > 0 && (
                              <Badge
                                variant="destructive"
                                          className="h-4 min-w-[1.25rem] justify-center px-1.5 py-0 text-[10px]"
                              >
                                {attendanceCounts.unread > 99 ? '99+' : attendanceCounts.unread}
                              </Badge>
                            )}
                          </TabsTrigger>
                                    <TabsTrigger value="leads" className="h-8 px-2.5 py-1.5 text-xs">
                            Leads
                          </TabsTrigger>
                                    <TabsTrigger value="clients" className="h-8 px-2.5 py-1.5 text-xs">
                            Clientes
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </div>
                    {user?.tenant_id ? (
                      <div className="space-y-1.5">
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Inbox
                        </p>
                        <Select
                          value={chatInboxScope}
                          onValueChange={(v) => setChatInboxScope(v as 'owner' | 'tenant')}
                        >
                          <SelectTrigger className="h-9 w-full text-xs">
                            <SelectValue placeholder="Inbox" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="owner">Só as minhas (criador da conversa)</SelectItem>
                                      <SelectItem value="tenant">Equipa — toda a empresa</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                            </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
                      <div
                        className={cn(
                          '-mx-0.5 overflow-x-auto px-0.5 pb-0.5 max-md:[scrollbar-width:none] max-md:[-ms-overflow-style:none]',
                          'max-md:[&::-webkit-scrollbar]:hidden',
                        )}
                      >
                        <ToggleGroup
                          type="single"
                          value={chatAttendanceFilter === '' ? 'all' : chatAttendanceFilter}
                          onValueChange={(v) => {
                            if (!v) return;
                            setChatAttendanceFilter(v === 'all' ? '' : (v as typeof chatAttendanceFilter));
                          }}
                          variant="outline"
                          size="sm"
                          className="inline-flex min-h-0 w-max min-w-full flex-nowrap justify-start gap-0.5 md:gap-1"
                        >
                          <ToggleGroupItem value="all" className="h-7 shrink-0 px-2 text-[11px] md:h-7 md:px-2 md:text-[10px]">
                            Todas
                          </ToggleGroupItem>
                          <ToggleGroupItem value="mine" className="h-7 shrink-0 gap-1 px-2 text-[11px] md:h-7 md:px-2 md:text-[10px]">
                            Minhas
                            {attendanceCounts.mine > 0 && (
                              <span className="tabular-nums rounded-full bg-muted px-1.5 py-0 text-[10px] font-medium text-muted-foreground">
                                {attendanceCounts.mine > 99 ? '99+' : attendanceCounts.mine}
                              </span>
                            )}
                          </ToggleGroupItem>
                          {user?.tenant_id &&
                            chatInboxScope === 'tenant' &&
                            (attendanceCounts.team > 0 || chatAttendanceFilter === 'team') && (
                              <ToggleGroupItem value="team" className="h-7 shrink-0 gap-1 px-2 text-[11px] md:h-7 md:px-2 md:text-[10px]">
                                Equipe
                                {attendanceCounts.team > 0 && (
                                  <span className="tabular-nums rounded-full bg-muted px-1.5 py-0 text-[10px] font-medium text-muted-foreground">
                                    {attendanceCounts.team > 99 ? '99+' : attendanceCounts.team}
                                  </span>
                                )}
                              </ToggleGroupItem>
                            )}
                          {(attendanceCounts.queue > 0 || chatAttendanceFilter === 'queue') && (
                            <ToggleGroupItem value="queue" className="h-7 shrink-0 gap-1 px-2 text-[11px] md:h-7 md:px-2 md:text-[10px]">
                              Fila
                              {attendanceCounts.queue > 0 && (
                                <span className="tabular-nums rounded-full bg-muted px-1.5 py-0 text-[10px] font-medium text-muted-foreground">
                                  {attendanceCounts.queue > 99 ? '99+' : attendanceCounts.queue}
                                </span>
                              )}
                            </ToggleGroupItem>
                          )}
                          <ToggleGroupItem value="unassigned" className="h-7 shrink-0 gap-1 px-2 text-[11px] md:h-7 md:px-2 md:text-[10px]">
                            Não atribuídas
                            {attendanceCounts.unassigned > 0 && (
                              <span className="tabular-nums rounded-full bg-muted px-1.5 py-0 text-[10px] font-medium text-muted-foreground">
                                {attendanceCounts.unassigned > 99 ? '99+' : attendanceCounts.unassigned}
                              </span>
                            )}
                          </ToggleGroupItem>
                          <ToggleGroupItem value="closed" className="h-7 shrink-0 gap-1 px-2 text-[11px] md:h-7 md:px-2 md:text-[10px]">
                            Encerradas
                            {attendanceCounts.closed > 0 && (
                              <span className="tabular-nums rounded-full bg-muted px-1.5 py-0 text-[10px] font-medium text-muted-foreground">
                                {attendanceCounts.closed > 99 ? '99+' : attendanceCounts.closed}
                              </span>
                            )}
                          </ToggleGroupItem>
                        </ToggleGroup>
                    </div>
                  </CardHeader>
                  <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0 max-md:min-h-0">
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/50">
                      {loadingConversations ? (
                        <div className="flex min-h-[12rem] flex-col items-center justify-center gap-3 px-6 py-10 text-center text-muted-foreground">
                          <RefreshCw className="h-8 w-8 animate-spin text-primary/70" aria-hidden />
                          <div>
                            <p className="text-sm font-medium text-foreground">Carregando conversas</p>
                            <p className="mt-1 text-xs">Aguarde um momento.</p>
                          </div>
                        </div>
                      ) : enabledInstanceIds.size === 0 ? (
                        <div className="flex min-h-[12rem] flex-col items-center justify-center gap-3 px-6 py-10 text-center">
                          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                            <ListFilter className="h-7 w-7 text-muted-foreground" aria-hidden />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">Nenhum WhatsApp ativo no inbox</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Use o botão de filtro ao lado da pesquisa e marque pelo menos uma conexão.
                            </p>
                          </div>
                          </div>
                      ) : conversationsToShow.length === 0 ? (
                        <div className="flex min-h-[12rem] flex-col items-center justify-center gap-3 px-6 py-10 text-center">
                          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                            <MessageSquare className="h-7 w-7 text-muted-foreground" aria-hidden />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">Nenhuma conversa</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Ajuste a pesquisa, os filtros ou as conexões WhatsApp.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="min-w-0 px-1 pb-1 pt-0.5">{conversationsToShow.map(renderConversationItem)}</div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card
                  className={cn(
                    'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-border/80 shadow-sm max-md:flex-1 md:min-h-0 md:h-full md:self-stretch',
                    isMobile && !routeConversationId && 'hidden md:flex',
                    isMobileConversationView && 'rounded-none border-0 shadow-none',
                  )}
                >
                  {selectedConversation ? (
                    <>
                      {viewMode === 'invoice-create' ? (
                        <CardContent className={cn('flex-1 min-h-0 overflow-auto p-4', isMobile && 'p-0')}>
                          {!isMobile ? (
                          <div className="mb-3">
                            <Button variant="ghost" size="sm" onClick={handleBackFromInvoiceCreate}>
                              Voltar para conversa
                            </Button>
                          </div>
                          ) : null}
                          <CustomerInvoiceNew
                            embedded
                            initialClientId={selectedConversation.client_id ?? null}
                            onBack={handleBackFromInvoiceCreate}
                            onCreated={(invoiceId) => {
                              void handleInvoiceCreatedInChat(invoiceId);
                            }}
                          />
                        </CardContent>
                      ) : viewMode === 'proposal-create' ? (
                        <CardContent className={cn('flex-1 min-h-0 overflow-auto p-4', isMobile && 'p-0')}>
                          {!isMobile ? (
                          <div className="mb-3">
                            <Button variant="ghost" size="sm" onClick={handleBackFromProposalCreate}>
                              Voltar para conversa
                            </Button>
                          </div>
                          ) : null}
                          <ProposalCreateForm
                            key={`proposal-create:${selectedConversation.id}`}
                            embedded
                            initialClientId={selectedConversation.client_id ?? null}
                            initialLeadId={
                              selectedConversation.client_id ? null : selectedConversation.leadId ?? null
                            }
                            initialLeadName={
                              !selectedConversation.client_id && currentLead?.name ? currentLead.name : null
                            }
                            initialTitle={
                              currentClient?.name || currentLead?.name
                                ? `Proposta — ${currentClient?.name || currentLead?.name}`
                                : ''
                            }
                            lockClientPicker={Boolean(selectedConversation.client_id)}
                            lockLeadPicker={
                              Boolean(!selectedConversation.client_id && selectedConversation.leadId)
                            }
                            onBack={handleBackFromProposalCreate}
                            onCreated={(created, mode) => {
                              void handleProposalCreatedInChat(created, mode);
                            }}
                          />
                        </CardContent>
                      ) : viewMode === 'contract-create' ? (
                        <MobileCommerceScreenLayout
                          className="min-h-0 flex-1"
                          enabled={isMobile}
                          header={
                            <div className="flex items-center gap-2 px-2 py-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="shrink-0 gap-1"
                                onClick={handleBackFromContractCreate}
                              >
                                <ChevronLeft className="h-4 w-4" />
                                Conversa
                              </Button>
                              <span className="min-w-0 flex-1 truncate text-sm font-semibold">Novo contrato</span>
                            </div>
                          }
                        >
                          <CardContent className={cn('flex-1 min-h-0 overflow-auto p-4', isMobile && 'p-0 pt-2')}>
                            {!isMobile ? (
                          <div className="mb-3">
                            <Button variant="ghost" size="sm" onClick={handleBackFromContractCreate}>
                              Voltar para conversa
                            </Button>
                          </div>
                            ) : null}
                          <ContractCreateForm
                            key={selectedConversation.id}
                            embedded
                            initialClientId={selectedConversation.client_id ?? null}
                            initialSigners={chatContractInitialSigners}
                            initialTitleHint={
                              currentClient?.name || currentLead?.name
                                ? `Contrato — ${currentClient?.name || currentLead?.name}`
                                : ''
                            }
                            onBack={handleBackFromContractCreate}
                            onCreated={(created, mode) => {
                              void handleContractCreatedInChat(created, mode);
                            }}
                          />
                        </CardContent>
                        </MobileCommerceScreenLayout>
                      ) : (
                        <>
                      <CardHeader
                        className={cn(
                          'flex-shrink-0 border-b border-border bg-muted/15',
                          isMobile && routeConversationId
                            ? 'space-y-1 px-2 py-1.5'
                            : 'space-y-3 px-4 py-3 md:space-y-0 md:px-3 md:py-2 md:min-h-[4rem]',
                          isMobileConversationView &&
                            'sticky top-0 z-30 bg-background/96 pb-1 pt-[max(0.25rem,env(safe-area-inset-top))] backdrop-blur pointer-events-auto',
                        )}
                      >
                        <div className="flex items-start justify-between gap-1.5 md:items-center md:gap-2">
                          <div className="flex min-w-0 flex-1 items-center gap-1.5 md:gap-2.5">
                            {isMobile && routeConversationId ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0 md:hidden"
                                aria-label={
                                  (location.state as { clientProfileReturnId?: string } | null)
                                    ?.clientProfileReturnId
                                    ? 'Voltar para o perfil do cliente'
                                    : 'Voltar'
                                }
                                onClick={handleMobileThreadHeaderBack}
                              >
                                <ChevronLeft className="h-5 w-5" />
                              </Button>
                            ) : null}
                            <button
                              type="button"
                              className={cn(
                                'flex min-w-0 flex-1 items-center gap-1.5 text-left md:gap-2.5',
                                'cursor-pointer rounded-md outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring/40',
                              )}
                              onClick={toggleContactProfilePanel}
                              aria-expanded={contactProfileOpen}
                              aria-controls="chat-contact-profile-panel"
                              title="Abrir ou fechar perfil do contato"
                            >
                            <Avatar 
                              className={cn(
                                'h-7 w-7 shrink-0 md:h-10 md:w-10',
                              )}
                            >
                              {selectedIdentity?.avatarUrl ? (
                                <AvatarImage
                                  src={selectedIdentity.avatarUrl}
                                  alt={selectedIdentity.displayName || 'Contato'}
                                />
                              ) : (
                                <AvatarFallback className="bg-primary/10 text-primary font-semibold uppercase">
                                {(selectedIdentity?.initials || '?')}
                                </AvatarFallback>
                              )}
                            </Avatar>
                            <div 
                              className={cn(
                                'min-w-0 flex-1',
                              )}
                            >
                              <div className="flex min-w-0 items-center gap-1.5 md:gap-1.5">
                                <h3 className="truncate text-sm font-semibold leading-tight md:text-[15px] md:leading-snug">
                                {selectedIdentity?.displayName ?? '—'}
                              </h3>
                                {selectedConversation.client_id && (
                                  <Badge variant="default" className="hidden h-5 shrink-0 px-1.5 text-[10px] md:inline-flex">
                                    Cliente
                                  </Badge>
                                )}
                                {!selectedConversation.client_id && selectedConversation.leadId && (
                                  <Badge className="hidden h-5 shrink-0 border-blue-300/80 bg-blue-500/10 px-1.5 text-[10px] text-blue-900 hover:bg-blue-500/15 dark:border-blue-800/60 dark:bg-blue-950/45 dark:text-blue-200 dark:hover:bg-blue-950/55 md:inline-flex">
                                    Lead
                                  </Badge>
                                )}
                                {!selectedConversation.client_id &&
                                  !selectedConversation.leadId &&
                                  selectedConversation.link_state === 'review_required' && (
                                    <Badge className="hidden h-5 shrink-0 border-amber-300/80 bg-amber-500/10 px-1.5 text-[10px] text-amber-950 hover:bg-amber-500/15 dark:border-amber-800/60 dark:bg-amber-950/45 dark:text-amber-100 dark:hover:bg-amber-950/55 md:inline-flex">
                                      Revisar vínculo
                                    </Badge>
                                  )}
                                {!selectedConversation.client_id &&
                                  !selectedConversation.leadId &&
                                  (!selectedConversation.link_state ||
                                    selectedConversation.link_state === 'unlinked') && (
                                    <Badge
                                      variant="outline"
                                      className="hidden h-5 shrink-0 bg-muted px-1.5 text-[10px] text-muted-foreground md:inline-flex"
                                    >
                                      Sem vínculo
                                    </Badge>
                                  )}
                              </div>
                              {isMobile && routeConversationId && mobileThreadHeaderSubline ? (
                                <p className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground md:hidden">
                                  {mobileThreadHeaderSubline}
                                </p>
                              ) : null}
                              {selectedIdentity?.phoneLine &&
                                selectedIdentity.displayName.trim() !== selectedIdentity.phoneLine.trim() && (
                                  <p className="mt-0.5 hidden max-w-[min(90vw,280px)] truncate text-[11px] text-muted-foreground md:mt-0 md:max-w-[min(36vw,200px)] md:block md:text-[10px]">
                                    {selectedIdentity.phoneLine}
                                  </p>
                                )}
                              <div className="mt-2 hidden flex-wrap items-center gap-1.5 md:mt-1 md:flex">
                                {selectedConversation.assigned_team_id &&
                                !selectedConversation.assignee_display &&
                                selectedConversation.assigned_team_name ? (
                                  <span className="inline-flex max-w-[min(160px,28vw)] items-center gap-1 rounded border border-sky-300/80 bg-sky-500/10 px-1.5 py-0 text-[10px] leading-tight text-sky-900 dark:border-sky-700/60 dark:bg-sky-950/40 dark:text-sky-100">
                                    <Users className="h-3 w-3 shrink-0" aria-hidden />
                                    <span className="truncate font-medium">
                                      Fila {selectedConversation.assigned_team_name}
                                    </span>
                                  </span>
                                ) : attendanceIsInProgress(selectedConversation.attendance_status) &&
                                selectedConversation.assignee_display ? (
                                  <span className="inline-flex max-w-[min(160px,28vw)] items-center gap-1 rounded border border-violet-300/80 bg-violet-500/10 px-1.5 py-0 text-[10px] leading-tight text-violet-900 dark:border-violet-700/60 dark:bg-violet-950/40 dark:text-violet-100">
                                    <Headphones className="h-3 w-3 shrink-0" aria-hidden />
                                    <span className="truncate font-medium">
                                      {shortOperatorName(selectedConversation.assignee_display)}
                                    </span>
                                  </span>
                                ) : attendanceStatusLabel(selectedConversation.attendance_status) ? (
                                  <Badge
                                    variant="outline"
                                    className="h-5 border-violet-300/80 bg-violet-500/10 px-1.5 text-[10px] text-violet-900 dark:border-violet-700/60 dark:bg-violet-950/40 dark:text-violet-100"
                                  >
                                    {attendanceStatusLabel(selectedConversation.attendance_status)}
                                  </Badge>
                                ) : null}
                                {!(
                                  attendanceIsInProgress(selectedConversation.attendance_status) &&
                                  selectedConversation.assignee_display?.trim()
                                ) &&
                                  !(
                                    selectedConversation.assigned_team_id &&
                                    !selectedConversation.assignee_display &&
                                    selectedConversation.assigned_team_name
                                  ) && (
                                  <span className="text-[10px] text-muted-foreground">
                                    <span className="font-medium text-foreground/85">Resp.</span>
                                    {' '}
                                    {selectedConversation.assignee_display?.trim() ||
                                      (selectedConversation.assigned_to_user_id ? 'Atribuído' : '—')}
                                  </span>
                                )}
                              </div>
                            </div>
                            </button>
                          </div>
                          <div className="flex shrink-0 items-center justify-end gap-1 md:gap-2">
                            {user &&
                              selectedConversation &&
                              (() => {
                                const takenByOther =
                                  attendanceIsInProgress(selectedConversation.attendance_status) &&
                                  selectedConversation.assigned_to_user_id &&
                                  selectedConversation.assigned_to_user_id !== user.id;
                                const adminBypass = user.is_tenant_admin === true;
                                const hideAttendEncerrarSlot = takenByOther && !adminBypass;
                                const canCloseAttendance =
                                  attendanceIsInProgress(selectedConversation.attendance_status) &&
                                  (selectedConversation.user_id === user.id ||
                                    selectedConversation.assigned_to_user_id === user.id ||
                                    adminBypass);
                                const canTransferAttendance =
                                  !!user.tenant_id &&
                                  attendanceIsInProgress(selectedConversation.attendance_status) &&
                                  !!selectedConversation.assigned_to_user_id &&
                                  (selectedConversation.assigned_to_user_id === user.id || adminBypass);
                                return (
                                  <>
                                    {!hideAttendEncerrarSlot && (
                                      <>
                                        {canCloseAttendance ? (
                                          <Button
                                            variant="destructive"
                                            size="sm"
                                            className={cn(
                                              'h-7 gap-0.5 px-2 text-[11px] md:h-8 md:gap-1 md:px-3 md:text-sm',
                                              isMobileConversationView && 'h-7 w-7 px-0',
                                              isMobile && routeConversationId && 'h-7 w-7 px-0',
                                            )}
                                            onClick={() => void handleCloseAttendance()}
                                            title="Encerrar atendimento"
                                          >
                                            <XCircle className={cn('h-3.5 w-3.5', isMobileConversationView && 'h-3.5 w-3.5')} />
                                            <span className={cn((isMobileConversationView || (isMobile && routeConversationId)) && 'sr-only')}>
                                              Encerrar
                                            </span>
                                          </Button>
                                        ) : (
                                          <Button
                                            variant="secondary"
                                            size="sm"
                                            className={cn(
                                              'h-7 gap-0.5 px-2 text-[11px] md:h-8 md:gap-1 md:px-3 md:text-sm',
                                              isMobileConversationView && 'h-7 w-7 px-0',
                                              isMobile && routeConversationId && 'h-7 w-7 px-0',
                                            )}
                                            disabled={attendingConversation}
                                            onClick={() => void handleAttendConversation()}
                                            title="Atender conversa"
                                          >
                                            <UserCheck className={cn('h-3.5 w-3.5', isMobileConversationView && 'h-3.5 w-3.5')} />
                                            <span className={cn((isMobileConversationView || (isMobile && routeConversationId)) && 'sr-only')}>
                                              Atender
                                            </span>
                                          </Button>
                                        )}
                                      </>
                                    )}
                                    {canTransferAttendance && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="hidden h-7 gap-0.5 px-2 text-[11px] md:inline-flex md:h-8 md:gap-1 md:px-3 md:text-sm"
                                        onClick={() => void openTransferDialog()}
                                      >
                                        <ArrowRightLeft className="h-3.5 w-3.5" />
                                        Transferir
                                      </Button>
                                    )}
                                  </>
                                );
                              })()}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className={cn(
                                'h-8 w-8 pointer-events-auto md:h-7 md:w-7',
                                isMobile && routeConversationId && 'h-7 w-7 shrink-0',
                              )}
                              aria-label={
                                contactProfileOpen ? 'Fechar perfil do contato' : 'Abrir perfil do contato'
                              }
                              title={contactProfileOpen ? 'Fechar perfil do contato' : 'Abrir perfil do contato'}
                              aria-expanded={contactProfileOpen}
                              aria-controls="chat-contact-profile-panel"
                              onClick={toggleContactProfilePanel}
                            >
                              <PanelRight className="h-4 w-4 md:h-3.5 md:w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
                        <div
                          className={cn(
                            'min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain touch-pan-y [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/50',
                          )}
                        >
                          <div className="min-w-0 max-w-full px-2 py-2 md:px-4 md:pb-2 md:pt-3">
                            {loadingMessages ? (
                              <div className="flex min-h-[10rem] flex-col items-center justify-center gap-3 py-10 text-center text-muted-foreground">
                                <RefreshCw className="h-7 w-7 animate-spin text-primary/70" aria-hidden />
                                <div>
                                  <p className="text-sm font-medium text-foreground">Carregando mensagens</p>
                                  <p className="mt-1 text-xs">Histórico da conversa.</p>
                                </div>
                          </div>
                            ) : messages.length === 0 ? (
                              <div className="flex min-h-[10rem] flex-col items-center justify-center gap-2 px-4 py-10 text-center">
                                <MessageSquare className="h-8 w-8 text-muted-foreground/80" aria-hidden />
                                <p className="text-sm font-medium text-foreground">Sem mensagens ainda</p>
                                <p className="text-xs text-muted-foreground">Envie a primeira mensagem abaixo.</p>
                        </div>
                      ) : (
                              <div className="flex min-h-full w-full min-w-0 flex-col justify-end">
                                <div className="w-full min-w-0 space-y-2 pb-2 md:space-y-2">
                                  {messages.map((message) => {
                                    const mc = message.message_contract;
                                    const rawPrev =
                                      coerceChatPlainText(mc?.body) ||
                                      coerceChatPlainText(message.body) ||
                                      '';
                                    const mk = mc?.kind;
                                    const replyPreviewPick =
                                      rawPrev ||
                                      (mk === 'image'
                                        ? '[Imagem]'
                                        : mk === 'audio'
                                          ? '[Áudio]'
                                          : mk === 'document'
                                            ? '[Documento]'
                                            : mk === 'video'
                                              ? '[Vídeo]'
                                              : '[Mensagem]');
                                    const replySenderPick =
                                      message.direction === 'incoming'
                                        ? selectedConversation?.display_name?.trim() ||
                                          selectedConversation?.displayName?.trim() ||
                                          selectedConversation?.contactName ||
                                          'Contato'
                                        : 'Sua equipe';
                                    const sortedInternal = [...(message.internal_comments ?? [])].sort(
                                      (a, b) =>
                                        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
                                    );
                                    const visibleInternal = sortedInternal.slice(0, 2);
                                    const moreInternal = sortedInternal.length - visibleInternal.length;
                                    const internalAuthorLabel = (c: ChatInternalComment) =>
                                      c.author_display?.trim() ||
                                      c.author_email?.split('@')[0]?.trim() ||
                                      'Equipa';
                                    return (
                                      <div
                                        key={message.id}
                                        className={cn(
                                          'group/msg flex min-w-0 flex-col gap-1',
                                          message.direction === 'outgoing' ? 'items-end' : 'items-start',
                                        )}
                                      >
                                        <div
                                          ref={(el) => {
                                            messageRowRefs.current[message.id] = el;
                                          }}
                                          className={cn(
                                            'flex min-w-0 flex-col gap-1.5 rounded-2xl transition-shadow duration-300',
                                            message.direction === 'outgoing' ? 'items-end' : 'items-start',
                                            flashMessageId === message.id &&
                                              'ring-2 ring-amber-400/85 ring-offset-2 ring-offset-background',
                                          )}
                                        >
                                          <div
                                            className={cn(
                                              'flex max-w-[min(100%,28rem)] min-w-0 items-start gap-0.5 md:max-w-[68%]',
                                              message.direction === 'outgoing' ? 'flex-row-reverse' : 'flex-row',
                                            )}
                                          >
                                            <div
                                              className={`max-w-[min(92%,26rem)] min-w-0 rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm md:rounded-xl md:px-3 md:py-2 ${
                                                message.direction === 'outgoing'
                                                  ? 'bg-primary text-primary-foreground ring-1 ring-primary/20'
                                                  : 'border border-border/50 bg-muted/90 text-foreground ring-1 ring-border/30 dark:bg-muted/75 dark:ring-border/20'
                                              }`}
                                            >
                                              {message.reply_to_message_id && message.reply_preview ? (
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    message.reply_to_message_id &&
                                                    scrollToMessageId(message.reply_to_message_id)
                                                  }
                                                  className={`mb-2 w-full rounded-lg border px-2 py-1.5 text-left text-xs ${
                                                    message.direction === 'outgoing'
                                                      ? 'border-primary-foreground/25 bg-primary-foreground/10'
                                                      : 'border-border/60 bg-background/50 dark:bg-background/20'
                                                  }`}
                                                >
                                                  <span className="block text-[10px] font-semibold opacity-90">
                                                    {message.reply_sender_name || 'Mensagem'}
                                                  </span>
                                                  <span className="line-clamp-2 opacity-85">{message.reply_preview}</span>
                                                </button>
                                              ) : null}
                                              <ChatBubbleContent message={message} />
                                              <span
                                                className={`text-[10px] mt-1 flex items-center gap-1 ${
                                                  message.direction === 'outgoing'
                                                    ? 'text-primary-foreground/80'
                                                    : 'text-muted-foreground'
                                                }`}
                                              >
                                                <span>{formatHour(message.sentAt)}</span>
                                                {message.direction === 'outgoing' ? (
                                                  <MessageStatusIndicator
                                                    status={message.status}
                                                    className="h-3 w-3"
                                                  />
                                                ) : null}
                                              </span>
                                            </div>
                                            <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className={cn(
                                                  'h-8 w-8 shrink-0 touch-manipulation text-muted-foreground opacity-70 hover:opacity-100 md:opacity-0 md:group-hover/msg:opacity-100',
                                                  message.direction === 'outgoing' && 'md:-mr-1',
                                                )}
                                                aria-label="Ações da mensagem"
                                              >
                                                <MoreVertical className="h-4 w-4" />
                                              </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent
                                              align={message.direction === 'outgoing' ? 'end' : 'start'}
                                              className="z-[85]"
                                            >
                                              <DropdownMenuItem
                                                onSelect={(e) => {
                                                  e.preventDefault();
                                                  setReplyingTo({
                                                    messageId: message.id,
                                                    preview: replyPreviewPick.slice(0, 280),
                                                    senderName: replySenderPick,
                                                  });
                                                  composerTextareaRef.current?.focus();
                                                }}
                                              >
                                                <Reply className="mr-2 h-4 w-4" />
                                                Responder
                                              </DropdownMenuItem>
                                              <DropdownMenuItem
                                                onSelect={(e) => {
                                                  e.preventDefault();
                                                  setCommentForMessage(message);
                                                  setCommentDraft('');
                                                  setCommentAlsoProfile(false);
                                                  setCommentDialogOpen(true);
                                                }}
                                              >
                                                <MessageCircle className="mr-2 h-4 w-4" />
                                                Comentário interno
                                              </DropdownMenuItem>
                                              <DropdownMenuItem
                                                onSelect={(e) => {
                                                  e.preventDefault();
                                                  const t =
                                                    coerceChatPlainText(mc?.body) ||
                                                    coerceChatPlainText(message.body) ||
                                                    '';
                                                  void navigator.clipboard.writeText(t);
                                                  toast.success('Texto copiado');
                                                }}
                                              >
                                                <Copy className="mr-2 h-4 w-4" />
                                                Copiar texto
                                              </DropdownMenuItem>
                                            </DropdownMenuContent>
                                          </DropdownMenu>
                                          </div>
                                          {sortedInternal.length > 0 ? (
                                            <div
                                              className={cn(
                                                'flex w-full max-w-[min(100%,28rem)] flex-col gap-1 md:max-w-[68%]',
                                                message.direction === 'outgoing'
                                                  ? 'items-end pr-9 md:pr-10'
                                                  : 'items-start pl-0.5',
                                              )}
                                            >
                                              {visibleInternal.map((c) => (
                                                <div
                                                  key={c.id}
                                                  className="w-full max-w-[min(92%,26rem)] rounded-lg border-l-2 border-amber-400/80 bg-amber-50/85 px-2.5 py-1.5 text-left dark:border-amber-600/60 dark:bg-amber-950/40"
                                                >
                                                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium text-amber-950/90 dark:text-amber-100/90">
                                                    <StickyNote className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
                                                    <span className="min-w-0 truncate">
                                                      Comentário interno · {internalAuthorLabel(c)}
                                                    </span>
                                                    <Badge
                                                      variant="outline"
                                                      className="h-4 border-amber-600/45 px-1 py-0 text-[9px] font-normal text-amber-900/90 dark:text-amber-100/85"
                                                    >
                                                      Interno
                                                    </Badge>
                                                  </div>
                                                  <p className="mt-0.5 whitespace-pre-wrap text-[11px] leading-snug text-foreground/95">
                                                    {c.comment_text}
                                                  </p>
                                                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                                                    {formatHour(c.created_at)}
                                                  </p>
                                                </div>
                                              ))}
                                              {moreInternal > 0 ? (
                                                <button
                                                  type="button"
                                                  className="text-[10px] font-medium text-primary underline underline-offset-2"
                                                  onClick={() => void openAllCommentsDialogForMessage(message.id)}
                                                >
                                                  Ver todos ({sortedInternal.length})
                                                </button>
                                              ) : null}
                                            </div>
                                          ) : null}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                            {/* Elemento invisível no final para scroll automático */}
                            <div ref={messagesEndRef} />
                          </div>
                        </div>
                        <form
                          onSubmit={handleSendMessage}
                          className={cn(
                            'flex w-full min-w-0 max-w-full shrink-0 flex-col gap-1 overflow-x-hidden border-t border-border/90 bg-muted/30 p-2 backdrop-blur-sm dark:bg-muted/10 md:gap-1.5 md:px-3 md:py-2 md:mb-0 md:min-h-[56px]',
                            isMobile &&
                              routeConversationId &&
                              'sticky bottom-0 z-40 border-border bg-background/95 pb-[max(0.35rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.12)] pointer-events-auto dark:bg-background/92 dark:shadow-[0_-10px_28px_-14px_rgba(0,0,0,0.45)]',
                          )}
                          style={
                            isMobile && routeConversationId
                              ? { bottom: `${keyboardInset}px` }
                              : undefined
                          }
                        >
                          {replyingTo ? (
                            <div className="flex min-w-0 items-start gap-2 rounded-lg border border-border/60 bg-background/80 px-2 py-1.5 shadow-sm dark:bg-background/40">
                              <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-medium text-muted-foreground">
                                  Respondendo {replyingTo.senderName}
                                </p>
                                <p className="line-clamp-2 text-xs text-foreground">{replyingTo.preview}</p>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0"
                                onClick={() => setReplyingTo(null)}
                                aria-label="Cancelar resposta"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : null}
                          <div className="flex w-full min-w-0 max-w-full items-end gap-2 md:items-center">
                            <input
                              ref={imageFileInputRef}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={handleImageFileChange}
                            />
                            <input
                              ref={documentFileInputRef}
                              type="file"
                              accept="application/pdf"
                              className="hidden"
                              onChange={handleDocumentFileChange}
                            />
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  disabled={sendingMessage}
                                  className="pointer-events-auto h-9 w-9 shrink-0 md:h-9 md:w-9"
                                  title="Ações rápidas"
                                  aria-label="Ações rápidas"
                                >
                                  <Plus className="h-4 w-4 md:h-3.5 md:w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                side="top"
                                align="start"
                                className="z-[80] w-56"
                              >
                                <DropdownMenuItem
                                  disabled={sendingMessage}
                                  onSelect={(ev) => {
                                    ev.preventDefault();
                                    imageFileInputRef.current?.click();
                                  }}
                                >
                                  <ImageIcon className="mr-2 h-4 w-4" />
                                  Enviar imagem
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={sendingMessage}
                                  onSelect={(ev) => {
                                    ev.preventDefault();
                                    documentFileInputRef.current?.click();
                                  }}
                                >
                                  <FileText className="mr-2 h-4 w-4" />
                                  Enviar documento
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={sendingMessage || !selectedConversationId}
                                  onSelect={(ev) => {
                                    ev.preventDefault();
                                    setWhatsappModelPickerOpen(true);
                                  }}
                                >
                                  <LayoutTemplate className="mr-2 h-4 w-4" />
                                  Usar template
                                </DropdownMenuItem>
                                {canCreateAgendaInChat ? (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      disabled={sendingMessage || meetNowSubmitting || !selectedConversationId}
                                      onSelect={(ev) => {
                                        ev.preventDefault();
                                        handleChatOpenAgendaComposer();
                                      }}
                                    >
                                      <CalendarIcon className="mr-2 h-4 w-4" />
                                      Agendar compromisso
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      disabled={sendingMessage || meetNowSubmitting || !selectedConversationId}
                                      onSelect={(ev) => {
                                        ev.preventDefault();
                                        if (
                                          !selectedConversation?.client_id &&
                                          !selectedConversation?.leadId
                                        ) {
                                          toast.error(
                                            'Vincule um cliente a esta conversa para agendar um compromisso.',
                                          );
                                          return;
                                        }
                                        setMeetNowConfirmOpen(true);
                                      }}
                                    >
                                      <Video className="mr-2 h-4 w-4" />
                                      Criar reunião para agora
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      disabled={sendingMessage || scheduleLaterBusy || !selectedConversationId}
                                      onSelect={(ev) => {
                                        ev.preventDefault();
                                        handleChatOpenScheduleLater();
                                      }}
                                    >
                                      <CalendarIcon className="mr-2 h-4 w-4" />
                                      Criar reunião para depois
                                    </DropdownMenuItem>
                                  </>
                                ) : null}
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <Textarea
                              ref={composerTextareaRef}
                              rows={1}
                              placeholder="Digite uma mensagem"
                              value={newMessage}
                              onChange={(event) => setNewMessage(event.target.value)}
                              onKeyDown={(e) => {
                                if (!isMobile) return;
                                if (e.key !== 'Enter' || e.shiftKey) return;
                                e.preventDefault();
                                void handleSendMessage(e as unknown as React.FormEvent<HTMLFormElement>);
                              }}
                              enterKeyHint="send"
                              autoComplete="off"
                              autoCorrect="off"
                              className="min-h-11 max-h-[min(40dvh,9.5rem)] flex-1 resize-none overflow-y-auto border-border bg-background py-3 text-[15px] leading-snug shadow-sm focus-visible:ring-primary/25 md:min-h-[36px] md:max-h-[min(30dvh,7.5rem)] md:py-2 md:text-sm md:leading-5"
                            />
                            <Button 
                              type="submit" 
                              size="icon"
                            disabled={!newMessage.trim()}
                            className="h-9 w-9 shrink-0 md:h-9 md:w-9"
                            >
                              <Send className="h-4 w-4 md:h-4 md:w-4" />
                            </Button>
                          </div>
                          </form>
                      </CardContent>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-8 text-center text-muted-foreground md:py-6">
                      <div>
                        <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                          <MessageSquare className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <p className="font-medium">Selecione uma conversa</p>
                        <p className="text-sm">
                          Escolha um contato na lista ao lado para carregar o histórico e responder via
                          WhatsApp
                        </p>
                      </div>
                    </div>
                  )}
                </Card>

                {!isMobile && selectedConversation && user && chatContactProfileModel ? (
                  <aside
                    className={cn(
                      'hidden min-h-0 shrink-0 overflow-hidden bg-background md:flex md:flex-col md:self-stretch md:border-border/70 md:shadow-[inset_1px_0_0_0_hsl(var(--border)/0.35)]',
                      'md:transition-[width] md:duration-300 md:ease-[cubic-bezier(0.33,1,0.68,1)]',
                      contactProfileOpen
                        ? 'md:w-[380px] md:border-l md:opacity-100'
                        : 'md:w-0 md:border-transparent md:opacity-0 md:pointer-events-none',
                    )}
                    aria-hidden={!contactProfileOpen}
                  >
                    <div className="flex h-full min-h-0 w-[380px] min-w-[380px] flex-col border-l border-transparent">
                      {contactProfileOpen ? (
                        <ChatContactProfilePanel
                          open={contactProfileOpen}
                          onOpenChange={setContactProfileOpen}
                          isMobile={false}
                          interactionMode="desktop"
                          onDesktopClose={() => setContactProfileOpen(false)}
                          showOpenFullProfile={Boolean(selectedConversation.client_id && currentClient?.id)}
                          onOpenFullProfile={() => {
                            if (currentClient?.id && selectedConversation) {
                              goToClientProfileFromChat(currentClient.id, selectedConversation);
                            }
                          }}
                          displayName={chatContactProfileModel.displayName}
                          phoneDisplay={chatContactProfileModel.phoneDisplay}
                          statusLine={chatContactProfileModel.statusLine}
                          avatarUrl={chatContactProfileModel.avatarUrl}
                          initials={chatContactProfileModel.initials}
                          kind={chatContactProfileModel.kind}
                          assigneeDisplay={chatContactProfileModel.assigneeDisplay}
                          teamName={chatContactProfileModel.teamName}
                          profileFields={chatContactProfileModel.profileFields}
                          canEditProfileFields={canEditChatProfileFields}
                          profileSavingKey={profileFieldSaving}
                          onSaveProfileField={canEditChatProfileFields ? handleSaveChatProfileField : undefined}
                          tagLabels={chatContactProfileModel.tagLabels}
                          clientGroups={clientGroupsList}
                          selectedClientGroupId={chatContactProfileModel.selectedClientGroupId}
                          onClientGroupChange={
                            chatContactProfileModel.kind === 'client' ? handleChatClientGroupChange : undefined
                          }
                          savingClientGroup={savingClientGroup}
                          syncingMessages={syncingMessages}
                          loadingLead={loadingLead}
                          canCreateInvoice={Boolean(selectedConversation.client_id && canCreateInvoicesInChat)}
                          canCreateProposal={Boolean(
                            (selectedConversation.client_id || selectedConversation.leadId) && canCreateProposalsInChat,
                          )}
                          canCreateContract={Boolean(
                            (selectedConversation.client_id || selectedConversation.leadId) && canCreateContractsInChat,
                          )}
                          canTransfer={chatContactProfileModel.canTransferProfile}
                          showScheduleAppointment={
                            canCreateAgendaInChat && Boolean(selectedConversation.client_id || selectedConversation.leadId)
                          }
                          onBackToConversation={() => setContactProfileOpen(false)}
                          onCreateInvoice={handleCreateInvoice}
                          onCreateProposal={handleCreateProposal}
                          onCreateContract={handleCreateContract}
                          onTransfer={() => void openTransferDialog()}
                          onSync={() => void handleSyncConversation()}
                          onCreateTask={handleCreateTask}
                          onOpenTicket={handleOpenTicket}
                          onScheduleAppointment={() => void handleChatOpenScheduleLater()}
                          onConvertLead={handleConvertToClient}
                          onLink={openLinkDialog}
                          onAddLead={() => {
                            void handleAddLead();
                          }}
                          onUnlink={() => setUnlinkConfirmOpen(true)}
                          showConvertLead={Boolean(selectedConversation.leadId && !selectedConversation.client_id)}
                          showLinkActions={!selectedConversation.client_id && !selectedConversation.leadId}
                          showUnlink={Boolean(selectedConversation.client_id || selectedConversation.leadId)}
                          linkConversationLabel={
                            selectedConversation.link_state === 'review_required'
                              ? 'Escolher vínculo'
                              : 'Vincular conversa'
                          }
                          crmNotesPreview={crmNotesPreview}
                          crmNotesLoading={crmNotesLoading}
                          onCrmNotesRefresh={() => void refreshCrmNotesForProfile()}
                          onNewCrmNote={() => {
                            setNewCrmNoteText('');
                            setNewCrmNoteOpen(true);
                          }}
                          onOpenNoteInChat={handleOpenCrmNoteInChat}
                        />
                      ) : null}
                    </div>
                  </aside>
                ) : null}
              </div>
                          </div>
                        </div>
      ) : (
        <Card className="flex-shrink-0">
          <CardContent className="py-10 text-center text-muted-foreground space-y-4">
            <p>Configure sua primeira conexão WhatsApp em Configurações (fluxo completo com sincronização).</p>
            <Button type="button" onClick={handleNavigateToSettings}>
              Abrir Configurações — WhatsApp
            </Button>
          </CardContent>
        </Card>
      )}

      <ChatWhatsappModelPickerDialog
        open={whatsappModelPickerOpen}
        onOpenChange={setWhatsappModelPickerOpen}
        conversationId={selectedConversationId}
        previewContext={inboxTemplateContext}
        onAfterSend={() => {
          if (selectedConversationId) {
            void loadMessages(selectedConversationId, { silent: true });
          }
          if (enabledInstanceIds.size > 0) {
            loadConversations(Array.from(enabledInstanceIds));
          }
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
                void handleChatMeetNowConfirmed();
              }}
            >
              {meetNowSubmitting ? 'A criar…' : 'Criar e enviar link'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={scheduleLaterOpen} onOpenChange={setScheduleLaterOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reunião para depois</DialogTitle>
            <DialogDescription>
              Cliente ou lead já vinculado à conversa. Confirme data, horário e se deseja Google Meet.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal">
                    {format(schedDay, 'PPP', { locale: ptBR })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={schedDay} onSelect={(d) => d && setSchedDay(d)} locale={ptBR} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="chat-sched-time">Hora inicial</Label>
                <Input
                  id="chat-sched-time"
                  type="time"
                  value={schedTime}
                  onChange={(e) => setSchedTime(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Duração (min)</Label>
                <Select
                  value={String(schedDuration)}
                  onValueChange={(v) => setSchedDuration(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30</SelectItem>
                    <SelectItem value="45">45</SelectItem>
                    <SelectItem value="60">60</SelectItem>
                    <SelectItem value="90">90</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="chat-sched-meet"
                checked={schedCreateMeet}
                onCheckedChange={(c) => setSchedCreateMeet(c === true)}
              />
              <Label htmlFor="chat-sched-meet" className="text-sm font-normal">
                Criar Google Calendar e Meet
              </Label>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="chat-sched-note">Observação (opcional)</Label>
              <Textarea
                id="chat-sched-note"
                value={schedNote}
                onChange={(e) => setSchedNote(e.target.value)}
                rows={2}
                placeholder="Notas internas / descrição do compromisso"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setScheduleLaterOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={scheduleLaterBusy} onClick={() => void handleChatScheduleLaterSubmit()}>
              {scheduleLaterBusy ? 'A guardar…' : 'Agendar e notificar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedConversation && user && chatContactProfileModel && isMobile ? (
        <ChatContactProfileSheet
          open={contactProfileOpen}
          onOpenChange={setContactProfileOpen}
          isMobile={isMobile}
          showOpenFullProfile={Boolean(selectedConversation.client_id && currentClient?.id)}
          onOpenFullProfile={() => {
            if (currentClient?.id && selectedConversation) {
              goToClientProfileFromChat(currentClient.id, selectedConversation);
            }
          }}
          displayName={chatContactProfileModel.displayName}
          phoneDisplay={chatContactProfileModel.phoneDisplay}
          statusLine={chatContactProfileModel.statusLine}
          avatarUrl={chatContactProfileModel.avatarUrl}
          initials={chatContactProfileModel.initials}
          kind={chatContactProfileModel.kind}
          assigneeDisplay={chatContactProfileModel.assigneeDisplay}
          teamName={chatContactProfileModel.teamName}
          profileFields={chatContactProfileModel.profileFields}
          canEditProfileFields={canEditChatProfileFields}
          profileSavingKey={profileFieldSaving}
          onSaveProfileField={canEditChatProfileFields ? handleSaveChatProfileField : undefined}
          tagLabels={chatContactProfileModel.tagLabels}
          clientGroups={clientGroupsList}
          selectedClientGroupId={chatContactProfileModel.selectedClientGroupId}
          onClientGroupChange={chatContactProfileModel.kind === 'client' ? handleChatClientGroupChange : undefined}
          savingClientGroup={savingClientGroup}
          syncingMessages={syncingMessages}
          loadingLead={loadingLead}
          canCreateInvoice={Boolean(selectedConversation.client_id && canCreateInvoicesInChat)}
          canCreateProposal={Boolean(
            (selectedConversation.client_id || selectedConversation.leadId) && canCreateProposalsInChat,
          )}
          canCreateContract={Boolean(
            (selectedConversation.client_id || selectedConversation.leadId) && canCreateContractsInChat,
          )}
          canTransfer={chatContactProfileModel.canTransferProfile}
          showScheduleAppointment={
            canCreateAgendaInChat && Boolean(selectedConversation.client_id || selectedConversation.leadId)
          }
          onBackToConversation={() => setContactProfileOpen(false)}
          onCreateInvoice={handleCreateInvoice}
          onCreateProposal={handleCreateProposal}
          onCreateContract={handleCreateContract}
          onTransfer={() => void openTransferDialog()}
          onSync={() => void handleSyncConversation()}
          onCreateTask={handleCreateTask}
          onOpenTicket={handleOpenTicket}
          onScheduleAppointment={() => void handleChatOpenScheduleLater()}
          onConvertLead={handleConvertToClient}
          onLink={openLinkDialog}
          onAddLead={() => {
            void handleAddLead();
          }}
          onUnlink={() => setUnlinkConfirmOpen(true)}
          showConvertLead={Boolean(selectedConversation.leadId && !selectedConversation.client_id)}
          showLinkActions={!selectedConversation.client_id && !selectedConversation.leadId}
          showUnlink={Boolean(selectedConversation.client_id || selectedConversation.leadId)}
          linkConversationLabel={
            selectedConversation.link_state === 'review_required'
              ? 'Escolher vínculo'
              : 'Vincular conversa'
          }
          crmNotesPreview={crmNotesPreview}
          crmNotesLoading={crmNotesLoading}
          onCrmNotesRefresh={() => void refreshCrmNotesForProfile()}
          onNewCrmNote={() => {
            setNewCrmNoteText('');
            setNewCrmNoteOpen(true);
          }}
          onOpenNoteInChat={handleOpenCrmNoteInChat}
        />
      ) : null}

      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Transferir</DialogTitle>
            <DialogDescription>
              Envie para um operador específico ou para a fila de uma equipe (membros veem na aba Equipe).
            </DialogDescription>
          </DialogHeader>
          <Tabs
            value={transferMode}
            onValueChange={(v) => setTransferMode(v as 'operator' | 'team')}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="operator" className="text-xs sm:text-sm">
                Operador
              </TabsTrigger>
              <TabsTrigger value="team" className="text-xs sm:text-sm">
                Equipe
              </TabsTrigger>
            </TabsList>
            <TabsContent value="operator" className="mt-3 space-y-2">
              <Label htmlFor="transfer-to">Operador</Label>
              <Select value={transferTargetId} onValueChange={setTransferTargetId}>
                <SelectTrigger id="transfer-to">
                  <SelectValue placeholder="Escolha um operador" />
                </SelectTrigger>
                <SelectContent>
                  {transferUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name?.trim() || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {transferUsers.length === 0 && (
                <p className="text-xs text-muted-foreground">Não há outros utilizadores na conta para receber.</p>
              )}
            </TabsContent>
            <TabsContent value="team" className="mt-3 space-y-2">
              <Label htmlFor="transfer-team">Equipe de atendimento</Label>
              <Select value={transferTeamId} onValueChange={setTransferTeamId}>
                <SelectTrigger id="transfer-team">
                  <SelectValue placeholder="Escolha uma equipe" />
                </SelectTrigger>
                <SelectContent>
                  {transferTeams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {transferTeams.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Crie equipes em Configurações e adicione membros para usar esta opção.
                </p>
              )}
            </TabsContent>
          </Tabs>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setTransferDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={
                transferSubmitting ||
                (transferMode === 'operator' && !transferTargetId) ||
                (transferMode === 'team' && !transferTeamId)
              }
              onClick={() => void handleConfirmTransfer()}
            >
              {transferSubmitting ? 'A transferir…' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={commentDialogOpen}
        onOpenChange={(o) => {
          setCommentDialogOpen(o);
          if (!o) setCommentForMessage(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Comentário interno</DialogTitle>
            <DialogDescription>
              Visível só para a equipa no PainelCRM. Não é enviado ao WhatsApp.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={commentDraft}
            onChange={(e) => setCommentDraft(e.target.value)}
            rows={4}
            placeholder="Ex.: follow-up em 7 dias, intenção de fechar…"
            className="text-sm"
          />
          {selectedConversation?.client_id || selectedConversation?.leadId ? (
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="comment-also-profile"
                checked={commentAlsoProfile}
                onCheckedChange={(c) => setCommentAlsoProfile(c === true)}
              />
              <Label htmlFor="comment-also-profile" className="text-sm font-normal leading-snug">
                Também salvar no perfil do cliente / lead
              </Label>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCommentDialogOpen(false);
                setCommentForMessage(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={commentSubmitting || !commentDraft.trim() || !commentForMessage}
              onClick={() => void handleSubmitMessageComment()}
            >
              {commentSubmitting ? 'A guardar…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={allCommentsDialog != null}
        onOpenChange={(o) => {
          if (!o) {
            setAllCommentsDialog(null);
            setAllCommentsDialogItems([]);
          }
        }}
      >
        <DialogContent className="max-h-[min(80vh,520px)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Comentários internos</DialogTitle>
            <DialogDescription>
              Visíveis só para a equipa. Não são enviados ao WhatsApp.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[min(60vh,360px)] pr-2">
            {allCommentsDialogLoading ? (
              <p className="text-sm text-muted-foreground">A carregar…</p>
            ) : allCommentsDialogItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem comentários.</p>
            ) : (
              <ul className="space-y-2">
                {allCommentsDialogItems.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-lg border-l-2 border-amber-400/80 bg-amber-50/85 px-2.5 py-1.5 dark:border-amber-600/60 dark:bg-amber-950/40"
                  >
                    <p className="text-[10px] font-medium text-amber-950/90 dark:text-amber-100/90">
                      {c.author_display?.trim() || c.author_email?.split('@')[0] || 'Equipa'}
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap text-xs text-foreground/95">{c.comment_text}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">{formatHour(c.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={newCrmNoteOpen} onOpenChange={setNewCrmNoteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova anotação</DialogTitle>
            <DialogDescription>Guardada no perfil do contacto vinculado.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={newCrmNoteText}
            onChange={(e) => setNewCrmNoteText(e.target.value)}
            rows={4}
            placeholder="Nota interna…"
            className="text-sm"
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setNewCrmNoteOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={
                newCrmNoteSaving ||
                !newCrmNoteText.trim() ||
                (!selectedConversation?.client_id && !selectedConversation?.leadId)
              }
              onClick={() => void handleSubmitNewCrmNote()}
            >
              {newCrmNoteSaving ? 'A guardar…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={unlinkConfirmOpen} onOpenChange={setUnlinkConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remover vínculo com o CRM?</DialogTitle>
            <DialogDescription>
              A conversa permanece no WhatsApp, mas deixa de estar associada a este cliente ou lead no
              painel. Você pode vincular novamente depois pelo menu da conversa.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setUnlinkConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleConfirmUnlink()}>
              Remover vínculo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialogs para ações rápidas */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Vincular conversa</DialogTitle>
            <DialogDescription>
              Escolha um cliente ou lead para definir o vínculo efetivo desta conversa.
            </DialogDescription>
          </DialogHeader>
          {selectedConversation?.link_state === 'review_required' && suggestedCandidates.length > 0 && (
            <div className="rounded-md border border-amber-300/80 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100">
              Revisão necessária: foram encontrados múltiplos candidatos para este telefone.
            </div>
          )}
          <div className="space-y-3">
            <Tabs value={linkTab} onValueChange={(v) => { setLinkTab(v as 'clients' | 'leads'); setLinkPage(1); }}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="clients">Clientes</TabsTrigger>
                <TabsTrigger value="leads">Leads</TabsTrigger>
              </TabsList>
            </Tabs>
            <Input
              placeholder="Buscar por nome, e-mail ou telefone..."
              value={linkSearch}
              onChange={(e) => { setLinkSearch(e.target.value); setLinkPage(1); }}
            />
            <div className="max-h-64 overflow-auto rounded-md border border-border">
              {linkTab === 'clients' ? (
                <div className="divide-y divide-border">
                  {pagedLinkClients.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 ${
                        selectedLinkTarget?.type === 'client' && selectedLinkTarget?.id === c.id ? 'bg-muted' : ''
                      }`}
                      onClick={() => setSelectedLinkTarget({ type: 'client', id: c.id })}
                    >
                      <CrmIdentityListRow
                        entity={c}
                        whatsappAvatarUrl={c.whatsapp_avatar_url}
                        className="min-w-0 flex-1"
                      />
                    </button>
                  ))}
                  {pagedLinkClients.length === 0 && (
                    <div className="px-3 py-6 text-sm text-muted-foreground text-center">Nenhum cliente encontrado</div>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {loadingLeads ? (
                    <div className="px-3 py-6 text-sm text-muted-foreground text-center">Carregando leads...</div>
                  ) : pagedLinkLeads.length > 0 ? (
                    pagedLinkLeads.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 ${
                          selectedLinkTarget?.type === 'lead' && selectedLinkTarget?.id === l.id ? 'bg-muted' : ''
                        }`}
                        onClick={() => setSelectedLinkTarget({ type: 'lead', id: l.id })}
                      >
                        <CrmIdentityListRow
                          entity={l}
                          whatsappAvatarUrl={l.whatsapp_avatar_url}
                          className="min-w-0 flex-1"
                        />
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-6 text-sm text-muted-foreground text-center">Nenhum lead encontrado</div>
                  )}
                </div>
              )}
            </div>
            {((linkTab === 'clients' && filteredLinkClients.length > pagedLinkClients.length) ||
              (linkTab === 'leads' && filteredLinkLeads.length > pagedLinkLeads.length)) && (
              <Button variant="ghost" size="sm" onClick={() => setLinkPage((p) => p + 1)}>
                Carregar mais
              </Button>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleConfirmLink} disabled={!selectedLinkTarget}>
              Confirmar vínculo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Tarefa */}
      <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Criar Tarefa</DialogTitle>
            <DialogDescription>
              Crie uma nova tarefa relacionada a {currentClient?.name || currentLead?.name || 'o contato'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            handleSaveTask(formData);
          }}>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="taskTitle">Título</Label>
                <Input id="taskTitle" name="title" placeholder="Ex: Reunião com cliente" required />
                          </div>
              <div className="space-y-2">
                <Label htmlFor="taskDescription">Descrição</Label>
                <Textarea id="taskDescription" name="description" placeholder="Detalhes da tarefa..." />
                        </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="taskDate">Data</Label>
                  <Input id="taskDate" name="date" type="date" />
                                  </div>
                <div className="space-y-2">
                  <Label htmlFor="taskTime">Horário</Label>
                  <Input id="taskTime" name="time" type="time" />
                                </div>
                              </div>
              <div className="space-y-2">
                <Label htmlFor="taskPriority">Prioridade</Label>
                <Select name="priority" defaultValue="medium">
                  <SelectTrigger id="taskPriority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baixa</SelectItem>
                    <SelectItem value="medium">Média</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                  </SelectContent>
                </Select>
                          </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTaskDialogOpen(false)}>
                Cancelar
                            </Button>
              <Button type="submit">Criar Tarefa</Button>
            </DialogFooter>
                          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog de Ticket */}
      <Dialog open={ticketDialogOpen} onOpenChange={setTicketDialogOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Abrir Ticket</DialogTitle>
            <DialogDescription>
              Crie um novo ticket de suporte para {currentClient?.name || currentLead?.name || selectedConversation?.contactName || 'o contato'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            handleSaveTicket(formData);
          }}>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="ticketSubject">Assunto</Label>
                <Input id="ticketSubject" name="subject" placeholder="Ex: Problema com produto" required />
                        </div>
              <div className="space-y-2">
                <Label htmlFor="ticketDescription">Descrição</Label>
                <Textarea id="ticketDescription" name="description" placeholder="Descreva o problema ou solicitação..." required />
                        </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ticketCategory">Categoria</Label>
                  <Select name="categoryId">
                    <SelectTrigger id="ticketCategory">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {ticketCategories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                      </div>
                <div className="space-y-2">
                  <Label htmlFor="ticketPriority">Prioridade</Label>
                  <Select name="priority" defaultValue="normal">
                    <SelectTrigger id="ticketPriority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Baixa</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">Alta</SelectItem>
                      <SelectItem value="urgent">Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                    </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTicketDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Criar Ticket</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Chat;
