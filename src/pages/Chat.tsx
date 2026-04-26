import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState, useRef } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/sonner';
import {
  RefreshCw,
  Send,
  Search,
  MessageSquare,
  ChevronLeft,
  Plus,
  MoreVertical,
  FileText,
  User,
  Users,
  CalendarIcon,
  Image as ImageIcon,
  LayoutTemplate,
  UserCheck,
  XCircle,
  Headphones,
  ArrowRightLeft,
  ListFilter,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { Textarea } from '@/components/ui/textarea';
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
  parseMediaField,
} from '@/services/chat';
import { useAuth } from '@/contexts/AuthContext';
import { useModulePermissions } from '@/contexts/ModulePermissionsContext';
import { ChatWhatsappModelPickerDialog } from '@/components/chat/ChatWhatsappModelPickerDialog';
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
import { clientsService } from '@/services/clients';
import { recordClientTimelineEvent } from '@/services/clientTimeline';
import { messagesService } from '@/services/messages';
import { customerInvoicesService } from '@/services/customerInvoices';
import { buildInvoiceLink } from '@/services/chatFinancialAdapter';
import CustomerInvoiceNew from '@/pages/CustomerInvoiceNew';
import { ChatContactProfileSheet } from '@/components/chat/ChatContactProfileSheet';
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

const statusBadgeClass = (status?: string | null) => {
  if (!status)
    return 'border-border bg-muted text-muted-foreground dark:bg-muted/70 dark:text-foreground/90';
  if (status === 'connected' || status === 'open')
    return 'border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/45 dark:text-emerald-200';
  if (status === 'connecting')
    return 'border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/45 dark:text-amber-200';
  if (status === 'disconnected' || status === 'closed')
    return 'border-rose-300 bg-rose-100 text-rose-900 dark:border-rose-800/60 dark:bg-rose-950/45 dark:text-rose-200';
  return 'border-border bg-muted text-muted-foreground dark:bg-muted/70 dark:text-foreground/90';
};

/** Etapa 5 — rótulo curto para badge de atendimento (evita confundir com `status` da conversa Uaz). */
const attendanceStatusLabel = (s?: string | null) => {
  switch (s) {
    case 'unassigned':
      return 'Sem responsável';
    case 'queued':
      return 'Fila';
    case 'in_service':
      return 'Em atendimento';
    case 'closed':
      return 'Encerrada';
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
    avatarUrl: pic,
    displayName: name,
    phoneDisplay: formatConnectedPhoneForDisplay(phoneRaw || ''),
  };
}

const CHAT_COMPOSER_MAX_HEIGHT_PX = 120;

const Chat = () => {
  const { user, session, profile } = useAuth();
  const { canCreate, loading: modulePermLoading } = useModulePermissions();
  const canCreateProposalsInChat = canCreate('proposals') && !modulePermLoading;
  const canCreateContractsInChat = canCreate('contracts') && !modulePermLoading;
  const canCreateInvoicesInChat = canCreate('billing') && !modulePermLoading;
  const navigate = useNavigate();
  const location = useLocation();
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
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'leads' | 'clients'>('all');
  /** Etapa 5 — inbox partilhada por defeito quando há tenant (evita lista vazia com escopo “equipa”). */
  const [chatInboxScope, setChatInboxScope] = useState<'owner' | 'tenant'>('tenant');
  const [chatAttendanceFilter, setChatAttendanceFilter] = useState<
    '' | 'queue' | 'team' | 'mine' | 'closed'
  >('');
  const [attendanceCounts, setAttendanceCounts] = useState({
    queue: 0,
    team: 0,
    mine: 0,
    unassigned: 0,
    closed: 0,
    unread: 0,
  });
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferUsers, setTransferUsers] = useState<TenantUser[]>([]);
  const [transferTeams, setTransferTeams] = useState<Team[]>([]);
  const [transferTargetId, setTransferTargetId] = useState('');
  const [transferTeamId, setTransferTeamId] = useState('');
  const [transferMode, setTransferMode] = useState<'operator' | 'team'>('operator');
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [contactProfileOpen, setContactProfileOpen] = useState(false);
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
  /** Evita restaurar no primeiro paint com lista vazia e loading=false (race antes do primeiro setLoading(true) aplicar). */
  const conversationsHydratedRef = useRef(false);
  /** FIFO: um id otimista por envio em voo; o WebSocket remove o mais antigo ao chegar a mensagem real. */
  const pendingOutgoingOptimisticQueueRef = useRef<string[]>([]);
  /** Evita GET /messages em rajada quando `conversation_updated` chega muitas vezes sem mudar o histórico visível. */
  const conversationUpdatedReloadSigRef = useRef<{
    id: string | null;
    lastAt: string | null;
    preview: string | null;
  }>({ id: null, lastAt: null, preview: null });
  const conversationUpdatedReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  /** Etapa 3+: modelo oficial (`proposal_templates`) e/ou legado rascunho `proposals` da coluna Kanban. */
  const [proposalKanbanModelId, setProposalKanbanModelId] = useState<string | null>(null);
  const [proposalKanbanLegacyDraftId, setProposalKanbanLegacyDraftId] = useState<string | null>(null);
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
    } catch (error) {
      console.error('Erro ao carregar conversas:', error);
      toast.error('Erro ao carregar conversas', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setLoadingConversations(false);
      conversationsHydratedRef.current = true;
    }
  }, [user?.tenant_id, chatInboxScope, chatAttendanceFilter, activeTab, searchTerm]);

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

    const socket: Socket = io(socketUrl, socketOptions);
    socketRef.current = socket;

    // Logs detalhados para debug
    socket.on('connect', () => {
      console.log('[Chat] WebSocket connected successfully', {
        id: socket.id,
        transport: socket.io.engine.transport.name,
        url: socketUrl,
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

    // Escutar atualizações de conversa
    socket.on('conversation_updated', (raw: any) => {
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
    });

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
    });

    // Escutar novas mensagens
    socket.on('new_message', (data: { message: any; conversationId: string }) => {
      console.log('[Chat] New message via WebSocket (raw):', data.message);
      
      const normalizedMessage = normalizeChatMessage({
        ...data.message,
        conversation_id: data.message.conversation_id || data.conversationId,
      });
      
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
            return base;
          }
          const ext = normalizedMessage.external_message_id;
          if (ext && base.some((m) => m.external_message_id === ext)) {
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
    });

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
  }, [session?.token, loadMessages, user?.tenant_id, chatInboxScope]);

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

  useEffect(() => {
    if (enabledInstanceIds.size === 0) {
      setConversations([]);
      if (!pendingConversationRestoreRef.current) {
        setSelectedConversationId(null);
      }
      setMessages([]);
      if (isMobile && routeConversationId) {
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
    if (
      selectedConversationId &&
      !conversations.some((conversation) => conversation.id === selectedConversationId)
    ) {
      setSelectedConversationId(null);
      setMessages([]);
    }
  }, [conversations, selectedConversationId]);

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
        // Segundo tick: após layout/pintura (Radix ScrollArea, mídia nas bolhas)
        requestAnimationFrame(run);
      });
    });
  }, []);

  // Scroll para o fim: mensagens novas, troca de conversa, fim do carregamento, ou volta ao painel da conversa
  // (ex.: criar fatura desmonta o ScrollArea — sem mudar `messages`, o efeito antigo não corria e o scroll ia ao topo)
  useLayoutEffect(() => {
    if (messages.length === 0 || loadingMessages) return;
    if (viewMode !== 'conversation') return;
    scrollMessagesToBottom();
  }, [messages, selectedConversationId, loadingMessages, viewMode, scrollMessagesToBottom]);

  const filteredConversations = useMemo(() => {
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
    if (id?.waSubtitle) statusParts.push(`WhatsApp: ${id.waSubtitle}`);
    if (conv.attendance_status === 'in_service') statusParts.push('Em atendimento');
    if (conv.attendance_status === 'queued') statusParts.push('Na fila');
    if (conv.attendance_status === 'closed') statusParts.push('Encerrado');
    const statusLine = statusParts.length ? statusParts.join(' · ') : null;
    const lastInteractionLabel = formatRelativeDate(conv.lastMessageAt || conv.updated_at);
    const assigneeDisplay =
      conv.assignee_display?.trim() ||
      (conv.assigned_to_user_id ? 'Atribuído' : null);
    const teamName = conv.assigned_team_name?.trim() || null;
    const detailRows: { label: string; value: string }[] = [];
    const contact = currentClient || currentLead;
    if (contact?.email?.trim()) detailRows.push({ label: 'E-mail', value: contact.email.trim() });
    if (contact && 'company' in contact && (contact as { company?: string }).company?.trim()) {
      detailRows.push({ label: 'Empresa', value: String((contact as { company?: string }).company).trim() });
    }
    if (currentClient?.cpf_cnpj?.trim()) {
      detailRows.push({ label: 'CPF/CNPJ', value: currentClient.cpf_cnpj.trim() });
    }
    if (currentLead && !currentClient) {
      const notes = typeof currentLead.notes === 'string' ? currentLead.notes.trim() : '';
      if (notes) detailRows.push({ label: 'Notas', value: notes.slice(0, 280) + (notes.length > 280 ? '…' : '') });
    }
    const tagLabels: string[] = [];
    if (currentClient?.funnel_stage) tagLabels.push(String(currentClient.funnel_stage));
    if (currentClient?.client_groups?.name) tagLabels.push(currentClient.client_groups.name);
    const adminBypass = user.is_tenant_admin === true;
    const canTransferProfile =
      !!user.tenant_id &&
      conv.attendance_status === 'in_service' &&
      !!conv.assigned_to_user_id &&
      (conv.assigned_to_user_id === user.id || adminBypass);
    return {
      displayName,
      phoneDisplay,
      statusLine,
      avatarUrl: id?.avatarUrl ?? null,
      initials: id?.initials ?? '?',
      kind: conv.client_id ? ('client' as const) : conv.leadId ? ('lead' as const) : ('unlinked' as const),
      lastInteractionLabel,
      assigneeDisplay,
      teamName,
      detailRows,
      tagLabels,
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

  const handleSelectConversation = (conversationId: string) => {
    if (isMobile) {
      navigate(`/chat/${conversationId}`);
    }
    setSelectedConversationId(conversationId);

    void chatService.syncConversationMessages(conversationId, { limit: 100, syncMode: 'full' }).catch((error) => {
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

  const handleSelectConversationRef = useRef(handleSelectConversation);
  handleSelectConversationRef.current = handleSelectConversation;

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

  /** Mobile: apenas lista em `/chat` — limpa thread ao voltar ou ao abrir a lista. */
  useEffect(() => {
    if (!isMobile) return;
    if (!/^\/chat$/.test(location.pathname)) return;
    setSelectedConversationId(null);
    setMessages([]);
  }, [isMobile, location.pathname]);

  /** `/chat/:conversationId` — hidrata seleção (deep link ou refresh). */
  useEffect(() => {
    if (!routeConversationId) return;
    if (selectedConversationId === routeConversationId) return;
    void handleSelectConversationRef.current(routeConversationId);
  }, [routeConversationId, selectedConversationId]);

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
    const optimisticId = `optimistic-${crypto.randomUUID()}`;
    pendingOutgoingOptimisticQueueRef.current.push(optimisticId);
    setNewMessage('');
    const optimistic: ChatMessage = {
      id: optimisticId,
      conversation_id: selectedConversationId,
      direction: 'outgoing',
      body: text,
      status: 'queued',
      sentAt: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      await chatService.sendMessage(selectedConversationId, text);
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
      console.error('Erro ao enviar mensagem:', error);
      toast.error('Não foi possível enviar a mensagem', {
        description: error instanceof Error ? error.message : undefined,
      });
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

  /** Um único ícone: mensagens remotas + dados do contato, depois recarrega lista. */
  const handleSyncConversation = async () => {
    if (!selectedConversationId) return;
    try {
      setSyncingMessages(true);
      const convBefore = conversations.find((c) => c.id === selectedConversationId);
      const syncResult = await chatService.syncConversationMessages(selectedConversationId, {
        limit: 100,
        syncMode: 'full',
        force: true,
      });
      const identityState = convBefore?.identityState ?? convBefore?.identity_state;
      const canonical =
        convBefore?.canonicalChatId ?? convBefore?.canonical_chat_id ?? null;
      const display =
        convBefore?.displayName ?? convBefore?.display_name ?? convBefore?.contactName ?? '';
      const nameOk = String(display || '').trim().length >= 2;
      const meta = (convBefore?.metadata || {}) as Record<string, unknown>;
      const portraitOk = !!(
        convBefore?.avatarUrl ||
        convBefore?.avatar_url ||
        (typeof meta.whatsapp_profile_photo === 'string' && meta.whatsapp_profile_photo.trim()) ||
        (typeof meta.image === 'string' && meta.image.trim())
      );
      const identityAlreadyHydrated =
        convBefore &&
        identityState === 'resolved' &&
        !!String(canonical || '').trim() &&
        nameOk &&
        portraitOk;

      const backendSkippedIdentity = syncResult?.identity_refresh_skipped === true;

      if (!backendSkippedIdentity && !identityAlreadyHydrated) {
        const identityResult = await chatService.refreshConversationIdentity(selectedConversationId);
        if (identityResult.conversation) {
          setConversations((prev) =>
            prev.map((c) => (c.id === selectedConversationId ? identityResult.conversation! : c))
          );
        }
      }
      await loadMessages(selectedConversationId, { silent: true });
      if (enabledInstanceIds.size > 0) {
        await loadConversations(Array.from(enabledInstanceIds));
      }
      void queryClient.invalidateQueries({ queryKey: ['clients', 'list'] });
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Conversa sincronizada');
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

      await apiClient.patch(`/api/leads/${currentLead.id}`, {
        status: 'Convertido',
        migrated_client_id: clientResult.data.id,
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
    setProposalKanbanModelId(null);
    setProposalKanbanLegacyDraftId(null);
    setViewMode('proposal-create');
  };

  const handleBackFromProposalCreate = () => {
    setProposalKanbanModelId(null);
    setProposalKanbanLegacyDraftId(null);
    setViewMode('conversation');
  };

  const handleProposalCreatedInChat = async (
    created: ProposalCreateSuccessPayload,
    mode: 'sent' | 'draft'
  ) => {
    setProposalKanbanModelId(null);
    setProposalKanbanLegacyDraftId(null);
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
        attendance_status: 'in_service',
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
      toast.info('A transferência requer conta com equipa (tenant).');
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
    const hasProfile = !!(conversation.client_id || conversation.leadId);
    const showPhoneRow =
      Boolean(identity.phoneLine) && identity.displayName.trim() !== identity.phoneLine.trim();

    const handleAvatarClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (conversation.client_id) {
        goToClientProfileFromChat(conversation.client_id, conversation);
      } else if (conversation.leadId) {
        toast.info('Visualização de perfil de lead em desenvolvimento');
      }
    };

    const handleNameClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (conversation.client_id) {
        goToClientProfileFromChat(conversation.client_id, conversation);
      } else if (conversation.leadId) {
        toast.info('Visualização de perfil de lead em desenvolvimento');
      }
    };

    return (
      <button
        key={conversation.id}
        type="button"
        onClick={() => handleSelectConversation(conversation.id)}
        className={cn(
          'my-1 box-border w-full max-w-full min-w-0 rounded-xl border border-transparent px-3 py-3 text-left transition-colors active:bg-muted/40 md:min-h-0 md:py-2.5',
          'min-h-[4.5rem] touch-manipulation',
          isActive
            ? 'bg-primary/10 shadow-none ring-1 ring-primary/25 dark:bg-primary/15 dark:ring-primary/35'
            : 'bg-background/50 hover:border-border/40 hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        )}
      >
        <div className="flex items-start gap-3">
          <div className="relative shrink-0">
            <Avatar
              className={cn(
                'h-11 w-11 md:h-10 md:w-10',
                hasProfile ? 'cursor-pointer transition-opacity hover:opacity-85' : '',
              )}
              onClick={hasProfile ? handleAvatarClick : undefined}
            >
              {identity.avatarUrl ? (
                <AvatarImage src={identity.avatarUrl} alt={identity.displayName || 'Contato'} />
              ) : (
                <AvatarFallback className="bg-primary/10 text-sm font-semibold uppercase text-primary">
                  {identity.initials}
                </AvatarFallback>
              )}
            </Avatar>
            {unread > 0 ? (
              <span
                className="absolute -right-1 -top-1 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground shadow-sm"
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
                  'min-w-0 flex-1 truncate text-[15px] font-semibold leading-tight md:text-sm md:font-medium',
                  isActive ? 'text-foreground' : 'text-foreground/95',
                  hasProfile ? 'cursor-pointer transition-opacity hover:opacity-80' : '',
                )}
                onClick={hasProfile ? handleNameClick : undefined}
              >
                {identity.displayName}
              </div>
              <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-muted-foreground">
                {formatRelativeDate(conversation.lastMessageAt || conversation.updated_at)}
              </span>
            </div>
            {showPhoneRow ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{identity.phoneLine}</p>
            ) : null}
            <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted-foreground md:text-xs">
              {conversation.lastMessagePreview || 'Sem mensagens recentes'}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {conversation.client_id ? (
                <Badge variant="default" className="px-1.5 py-0 text-[10px] font-medium">
                  Cliente
                </Badge>
              ) : null}
              {!conversation.client_id && conversation.leadId ? (
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-medium">
                  Lead
                </Badge>
              ) : null}
              {conversation.status ? (
                <Badge variant="outline" className={cn('px-1.5 py-0 text-[10px]', statusBadgeClass(conversation.status))}>
                  {conversation.status}
                </Badge>
              ) : null}
              {conversation.assigned_team_id &&
              !conversation.assignee_display &&
              conversation.assigned_team_name ? (
                <span
                  className="inline-flex max-w-[9.5rem] items-center gap-1 rounded-md border border-sky-300/80 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-900 dark:border-sky-700/60 dark:bg-sky-950/40 dark:text-sky-100"
                  title={`Fila da equipe: ${conversation.assigned_team_name}`}
                >
                  <Users className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
                  <span className="truncate">{conversation.assigned_team_name}</span>
                </span>
              ) : null}
              {conversation.attendance_status === 'in_service' && conversation.assignee_display ? (
                <span
                  className="inline-flex max-w-[10rem] items-center gap-1 rounded-md border border-violet-300/80 bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-900 dark:border-violet-700/60 dark:bg-violet-950/40 dark:text-violet-100"
                  title={conversation.assignee_display}
                >
                  <Headphones className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
                  <span className="truncate font-medium">{shortOperatorName(conversation.assignee_display)}</span>
                </span>
              ) : attendanceStatusLabel(conversation.attendance_status) ? (
                <Badge
                  variant="outline"
                  className="max-w-[11rem] truncate border-violet-300/80 bg-violet-500/10 px-1.5 py-0 text-[10px] text-violet-900 dark:border-violet-700/60 dark:bg-violet-950/40 dark:text-violet-100"
                  title={attendanceStatusLabel(conversation.attendance_status) || undefined}
                >
                  {attendanceStatusLabel(conversation.attendance_status)}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
      </button>
    );
  };

  return (
    <div
      className={cn(
        'flex flex-col h-screen max-h-screen -m-6',
        isMobileConversationView &&
          'fixed inset-0 z-[60] m-0 h-[100dvh] max-h-[100dvh] bg-background',
      )}
    >
      {instances.length > 0 ? (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Renderizar conteúdo do chat - apenas uma vez, reutilizado para todas as abas */}
          <div
            className={cn(
              'flex-1 flex flex-col min-h-0 px-6 pt-4 pb-6 md:pt-6 overflow-hidden',
              isMobileConversationView && 'px-0 pt-0 pb-0',
            )}
          >
            <div
              className={cn(
                'grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 min-h-0',
                isMobileConversationView && 'gap-0',
              )}
            >
                <Card
                  className={cn(
                    'md:col-span-1 flex flex-col min-h-0 border-border/80 shadow-sm',
                    isMobile && routeConversationId && 'hidden md:flex',
                  )}
                >
                  <CardHeader className="flex-shrink-0 space-y-3 border-b border-border bg-muted/20 px-3 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="relative min-w-0 flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={searchTerm}
                          onChange={(event) => setSearchTerm(event.target.value)}
                          placeholder="Buscar por nome ou telefone..."
                          className="h-9 bg-background pl-9"
                        />
                      </div>
                      <Popover open={filtersPopoverOpen} onOpenChange={setFiltersPopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant={filtersPopoverOpen ? 'secondary' : 'outline'}
                            size="icon"
                            className="h-9 w-9 shrink-0 rounded-lg"
                            aria-label="WhatsApp e filtros da lista"
                            aria-expanded={filtersPopoverOpen}
                          >
                            <ListFilter className="h-4 w-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-[min(100vw-1.5rem,22rem)] p-0"
                          align="end"
                          sideOffset={6}
                        >
                          <div className="max-h-[min(72dvh,520px)] overflow-y-auto overscroll-contain">
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
                                      <SelectItem value="tenant">Equipa — mesmo tenant</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="overflow-x-auto -mx-0.5 px-0.5 pb-0.5">
                        <ToggleGroup
                          type="single"
                          value={chatAttendanceFilter === '' ? 'all' : chatAttendanceFilter}
                          onValueChange={(v) => {
                            if (!v) return;
                            setChatAttendanceFilter(v === 'all' ? '' : (v as typeof chatAttendanceFilter));
                          }}
                          variant="outline"
                          size="sm"
                          className="inline-flex w-max min-w-full justify-start gap-1"
                        >
                          {(attendanceCounts.queue > 0 || chatAttendanceFilter === 'queue') && (
                            <ToggleGroupItem value="queue" className="text-xs px-2.5 h-8 shrink-0 gap-1">
                              Fila
                              {attendanceCounts.queue > 0 && (
                                <span className="tabular-nums rounded-full bg-muted px-1.5 py-0 text-[10px] font-medium text-muted-foreground">
                                  {attendanceCounts.queue > 99 ? '99+' : attendanceCounts.queue}
                                </span>
                              )}
                            </ToggleGroupItem>
                          )}
                          {user?.tenant_id &&
                            chatInboxScope === 'tenant' &&
                            (attendanceCounts.team > 0 || chatAttendanceFilter === 'team') && (
                              <ToggleGroupItem value="team" className="text-xs px-2.5 h-8 shrink-0 gap-1">
                                Equipe
                                {attendanceCounts.team > 0 && (
                                  <span className="tabular-nums rounded-full bg-muted px-1.5 py-0 text-[10px] font-medium text-muted-foreground">
                                    {attendanceCounts.team > 99 ? '99+' : attendanceCounts.team}
                                  </span>
                                )}
                              </ToggleGroupItem>
                            )}
                          <ToggleGroupItem value="mine" className="text-xs px-2.5 h-8 shrink-0 gap-1">
                            Minhas
                            {attendanceCounts.mine > 0 && (
                              <span className="tabular-nums rounded-full bg-muted px-1.5 py-0 text-[10px] font-medium text-muted-foreground">
                                {attendanceCounts.mine > 99 ? '99+' : attendanceCounts.mine}
                              </span>
                            )}
                          </ToggleGroupItem>
                          <ToggleGroupItem value="all" className="text-xs px-2.5 h-8 shrink-0">
                            Todas
                          </ToggleGroupItem>
                          <ToggleGroupItem value="closed" className="text-xs px-2.5 h-8 shrink-0 gap-1">
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
                  <CardContent className="p-0 flex-1 min-h-0 overflow-hidden">
                    <ScrollArea className="h-full [&>div>div[data-radix-scroll-area-viewport]]:!block [&_[data-radix-scroll-area-scrollbar]]:w-1.5 [&_[data-radix-scroll-area-thumb]]:bg-border/50">
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
                        <div className="min-w-0 px-1 pb-2 pt-0.5">{conversationsToShow.map(renderConversationItem)}</div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>

                <Card
                  className={cn(
                    'md:col-span-2 flex min-h-0 flex-1 flex-col overflow-hidden border-border/80 shadow-sm md:flex-none',
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
                            key={`${selectedConversation.id}:${proposalKanbanModelId ?? 'noM'}:${proposalKanbanLegacyDraftId ?? 'noD'}`}
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
                            initialProposalModelId={proposalKanbanModelId}
                            initialTemplateProposalId={proposalKanbanLegacyDraftId}
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
                            ? 'space-y-2 px-3 py-2'
                            : 'space-y-3 px-4 py-3',
                          isMobileConversationView &&
                            'sticky top-0 z-30 bg-background/96 pb-1.5 pt-[max(0.35rem,env(safe-area-inset-top))] backdrop-blur pointer-events-auto',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2 md:gap-3">
                          <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
                            {isMobile && routeConversationId ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0 md:hidden"
                                aria-label="Voltar às conversas"
                                onClick={() => {
                                  setViewMode('conversation');
                                  navigate('/chat');
                                }}
                              >
                                <ChevronLeft className="h-5 w-5" />
                              </Button>
                            ) : null}
                            <Avatar
                              className={cn(
                                'h-8 w-8 shrink-0 md:h-11 md:w-11',
                                (currentClient || currentLead) && 'cursor-pointer transition-opacity hover:opacity-80',
                              )}
                              onClick={() => {
                                if (currentClient && selectedConversation) {
                                  goToClientProfileFromChat(currentClient.id, selectedConversation);
                                } else if (currentLead) {
                                  toast.info('Visualização de perfil de lead em desenvolvimento');
                                }
                              }}
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
                                (currentClient || currentLead)
                                  ? 'cursor-pointer transition-opacity hover:opacity-80'
                                  : '',
                              )}
                              onClick={() => {
                                if (currentClient && selectedConversation) {
                                  goToClientProfileFromChat(currentClient.id, selectedConversation);
                                } else if (currentLead) {
                                  toast.info('Visualização de perfil de lead em desenvolvimento');
                                }
                              }}
                            >
                              <div className="flex min-w-0 items-center gap-1.5 md:gap-2">
                                <h3 className="truncate text-[15px] font-semibold leading-tight md:text-lg">
                                  {selectedIdentity?.displayName ?? '—'}
                                </h3>
                                {selectedConversation.client_id && (
                                  <Badge variant="default" className="hidden text-xs md:inline-flex">
                                    Cliente
                                  </Badge>
                                )}
                                {!selectedConversation.client_id && selectedConversation.leadId && (
                                  <Badge className="hidden border-blue-300/80 bg-blue-500/10 text-xs text-blue-900 hover:bg-blue-500/15 dark:border-blue-800/60 dark:bg-blue-950/45 dark:text-blue-200 dark:hover:bg-blue-950/55 md:inline-flex">
                                    Lead
                                  </Badge>
                                )}
                                {!selectedConversation.client_id &&
                                  !selectedConversation.leadId &&
                                  selectedConversation.link_state === 'review_required' && (
                                    <Badge className="hidden border-amber-300/80 bg-amber-500/10 text-xs text-amber-950 hover:bg-amber-500/15 dark:border-amber-800/60 dark:bg-amber-950/45 dark:text-amber-100 dark:hover:bg-amber-950/55 md:inline-flex">
                                      Revisar vínculo
                                    </Badge>
                                  )}
                                {!selectedConversation.client_id &&
                                  !selectedConversation.leadId &&
                                  (!selectedConversation.link_state ||
                                    selectedConversation.link_state === 'unlinked') && (
                                    <Badge
                                      variant="outline"
                                      className="hidden bg-muted text-xs text-muted-foreground md:inline-flex"
                                    >
                                      Sem vínculo
                                    </Badge>
                                  )}
                              </div>
                              {isMobile && routeConversationId ? (
                                <p className="mt-0.5 truncate text-[11px] text-muted-foreground md:hidden">
                                  {[
                                    selectedIdentity?.phoneLine,
                                    selectedConversation.instance_name ? `WhatsApp ${selectedConversation.instance_name}` : null,
                                    selectedConversation.assignee_display?.trim()
                                      ? shortOperatorName(selectedConversation.assignee_display)
                                      : selectedConversation.assigned_team_id &&
                                          selectedConversation.assigned_team_name
                                        ? `Fila ${selectedConversation.assigned_team_name}`
                                        : null,
                                    attendanceStatusLabel(selectedConversation.attendance_status),
                                  ]
                                    .filter((s): s is string => Boolean(s && String(s).trim()))
                                    .join(' · ')}
                                </p>
                              ) : null}
                              {selectedIdentity?.waSubtitle && (
                                <p className="hidden max-w-[280px] truncate text-xs text-muted-foreground/90 md:block">
                                  WhatsApp: {selectedIdentity.waSubtitle}
                                </p>
                              )}
                              {selectedIdentity?.phoneLine &&
                                selectedIdentity.displayName.trim() !== selectedIdentity.phoneLine.trim() && (
                                  <p className="hidden text-xs text-muted-foreground md:block">
                                    {selectedIdentity.phoneLine}
                                  </p>
                                )}
                              <div className="mt-2 hidden flex-wrap items-center gap-2 md:flex">
                                <span className="inline-flex items-center rounded-md border border-border/60 bg-background/90 px-2 py-0.5 text-[11px] text-muted-foreground">
                                  WhatsApp
                                  {selectedConversation.instance_name
                                    ? ` · ${selectedConversation.instance_name}`
                                    : ''}
                                </span>
                                {selectedConversation.assigned_team_id &&
                                !selectedConversation.assignee_display &&
                                selectedConversation.assigned_team_name ? (
                                  <span className="inline-flex items-center gap-1.5 rounded-md border border-sky-300/80 bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-900 dark:border-sky-700/60 dark:bg-sky-950/40 dark:text-sky-100">
                                    <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    <span className="font-medium truncate max-w-[200px]">
                                      Fila {selectedConversation.assigned_team_name}
                                    </span>
                                  </span>
                                ) : selectedConversation.attendance_status === 'in_service' &&
                                selectedConversation.assignee_display ? (
                                  <span className="inline-flex items-center gap-1.5 rounded-md border border-violet-300/80 bg-violet-500/10 px-2 py-0.5 text-[11px] text-violet-900 dark:border-violet-700/60 dark:bg-violet-950/40 dark:text-violet-100">
                                    <Headphones className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    <span className="font-medium truncate max-w-[200px]">
                                      {shortOperatorName(selectedConversation.assignee_display)}
                                    </span>
                                  </span>
                                ) : attendanceStatusLabel(selectedConversation.attendance_status) ? (
                                  <Badge
                                    variant="outline"
                                    className="border-violet-300/80 bg-violet-500/10 text-[10px] text-violet-900 dark:border-violet-700/60 dark:bg-violet-950/40 dark:text-violet-100"
                                  >
                                    {attendanceStatusLabel(selectedConversation.attendance_status)}
                                  </Badge>
                                ) : null}
                                {!(
                                  selectedConversation.attendance_status === 'in_service' &&
                                  selectedConversation.assignee_display?.trim()
                                ) &&
                                  !(
                                    selectedConversation.assigned_team_id &&
                                    !selectedConversation.assignee_display &&
                                    selectedConversation.assigned_team_name
                                  ) && (
                                  <span className="text-[11px] text-muted-foreground">
                                    <span className="font-medium text-foreground/85">Responsável</span>
                                    {' · '}
                                    {selectedConversation.assignee_display?.trim() ||
                                      (selectedConversation.assigned_to_user_id ? 'Atribuído' : '—')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center justify-end gap-1 md:gap-2">
                            {user &&
                              selectedConversation &&
                              (() => {
                                const takenByOther =
                                  selectedConversation.attendance_status === 'in_service' &&
                                  selectedConversation.assigned_to_user_id &&
                                  selectedConversation.assigned_to_user_id !== user.id;
                                const adminBypass = user.is_tenant_admin === true;
                                const hideAttendEncerrarSlot = takenByOther && !adminBypass;
                                const canCloseAttendance =
                                  selectedConversation.attendance_status === 'in_service' &&
                                  (selectedConversation.user_id === user.id ||
                                    selectedConversation.assigned_to_user_id === user.id ||
                                    adminBypass);
                                const canTransferAttendance =
                                  !!user.tenant_id &&
                                  selectedConversation.attendance_status === 'in_service' &&
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
                                            )}
                                            onClick={() => void handleCloseAttendance()}
                                            title="Encerrar atendimento"
                                          >
                                            <XCircle className={cn('h-3.5 w-3.5', isMobileConversationView && 'h-3.5 w-3.5')} />
                                            <span className={cn(isMobileConversationView && 'sr-only')}>Encerrar</span>
                                          </Button>
                                        ) : (
                                          <Button
                                            variant="secondary"
                                            size="sm"
                                            className={cn(
                                              'h-7 gap-0.5 px-2 text-[11px] md:h-8 md:gap-1 md:px-3 md:text-sm',
                                              isMobileConversationView && 'h-7 w-7 px-0',
                                            )}
                                            disabled={attendingConversation}
                                            onClick={() => void handleAttendConversation()}
                                            title="Atender conversa"
                                          >
                                            <UserCheck className={cn('h-3.5 w-3.5', isMobileConversationView && 'h-3.5 w-3.5')} />
                                            <span className={cn(isMobileConversationView && 'sr-only')}>Atender</span>
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
                              variant="ghost"
                              size="icon"
                              onClick={() => void handleSyncConversation()}
                              disabled={syncingMessages}
                              className={cn(
                                'h-8 w-8',
                                isMobile && routeConversationId && 'hidden md:inline-flex md:h-8 md:w-8',
                              )}
                              title="Sincronizar mensagens e identidade do contato"
                            >
                              <RefreshCw className={`h-4 w-4 ${syncingMessages ? 'animate-spin' : ''}`} />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className={cn(
                                'h-8 w-8 pointer-events-auto',
                                isMobile && routeConversationId && 'h-7 w-7 shrink-0',
                              )}
                              aria-label="Perfil do contato e ações"
                              title="Perfil do contato e ações"
                              onClick={() => setContactProfileOpen(true)}
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
                        <ScrollArea
                          className={cn(
                            'min-h-0 flex-1 [&_[data-radix-scroll-area-scrollbar]]:w-1.5 [&_[data-radix-scroll-area-thumb]]:bg-border/50',
                            isMobileConversationView && 'overflow-hidden',
                          )}
                        >
                          <div className="px-3 py-3 md:p-4">
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
                              <div className="mx-auto w-full max-w-3xl space-y-3.5 pb-6 md:space-y-3">
                                {messages.map((message) => (
                                  <div
                                    key={message.id}
                                    className={`flex ${message.direction === 'outgoing' ? 'justify-end' : 'justify-start'}`}
                                  >
                                    <div
                                      className={`max-w-[min(88%,28rem)] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm md:max-w-[min(82%,28rem)] md:rounded-xl ${
                                        message.direction === 'outgoing'
                                          ? 'bg-primary text-primary-foreground ring-1 ring-primary/20'
                                          : 'border border-border/50 bg-muted/90 text-foreground ring-1 ring-border/30 dark:bg-muted/75 dark:ring-border/20'
                                      }`}
                                    >
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
                              </div>
                            ))}
                              </div>
                            )}
                            {/* Elemento invisível no final para scroll automático */}
                            <div ref={messagesEndRef} />
                          </div>
                        </ScrollArea>
                        <form
                          onSubmit={handleSendMessage}
                          className={cn(
                            'flex shrink-0 gap-2 border-t border-border bg-muted/20 p-2 backdrop-blur-sm dark:bg-muted/10 md:p-3',
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
                                  className="pointer-events-auto"
                                  title="Ações rápidas"
                                  aria-label="Ações rápidas"
                                >
                                  <Plus className="h-4 w-4" />
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
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <Textarea
                              ref={composerTextareaRef}
                              rows={1}
                              placeholder="Mensagem ou legenda da imagem..."
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
                              className="min-h-11 max-h-[min(40dvh,9.5rem)] flex-1 resize-none overflow-y-auto border-border bg-background py-3 text-[15px] leading-snug shadow-sm focus-visible:ring-primary/25 md:min-h-10 md:max-h-[120px] md:py-2.5 md:text-sm"
                            />
                            <Button 
                              type="submit" 
                              size="icon"
                            disabled={!newMessage.trim()}
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          </form>
                      </CardContent>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-center text-muted-foreground px-6">
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

      {selectedConversation && user && chatContactProfileModel ? (
        <ChatContactProfileSheet
          open={contactProfileOpen}
          onOpenChange={setContactProfileOpen}
          isMobile={isMobile}
          displayName={chatContactProfileModel.displayName}
          phoneDisplay={chatContactProfileModel.phoneDisplay}
          statusLine={chatContactProfileModel.statusLine}
          avatarUrl={chatContactProfileModel.avatarUrl}
          initials={chatContactProfileModel.initials}
          kind={chatContactProfileModel.kind}
          lastInteractionLabel={chatContactProfileModel.lastInteractionLabel}
          assigneeDisplay={chatContactProfileModel.assigneeDisplay}
          teamName={chatContactProfileModel.teamName}
          detailRows={chatContactProfileModel.detailRows}
          tagLabels={chatContactProfileModel.tagLabels}
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
          onBackToConversation={() => setContactProfileOpen(false)}
          onCreateInvoice={handleCreateInvoice}
          onCreateProposal={handleCreateProposal}
          onCreateContract={handleCreateContract}
          onTransfer={() => void openTransferDialog()}
          onSync={() => void handleSyncConversation()}
          onCreateTask={handleCreateTask}
          onOpenTicket={handleOpenTicket}
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
