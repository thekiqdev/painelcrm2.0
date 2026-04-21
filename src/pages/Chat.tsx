import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/sonner';
import {
  RefreshCw,
  Send,
  Search,
  MessageSquare,
  ChevronDown,
  Plus,
  MoreVertical,
  UserPlus,
  FileText,
  CheckSquare,
  Ticket,
  Receipt,
  FileSignature,
  User,
  Trash2,
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
import { resolveConversationIdentity } from '@/utils/chatIdentityDisplay';
import { CrmIdentityListRow } from '@/components/crm/CrmIdentityListRow';
import {
  buildClientProfileStateFromChat,
  buildClientProfileToFromChat,
  resolveRestoreConversationId,
} from '@/utils/clientProfileNavigation';
import { consumeKanbanProposalColumnContextIfMatch } from '@/utils/kanbanProposalColumnContext';
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

const Chat = () => {
  const { user, session, profile } = useAuth();
  const { canCreate, loading: modulePermLoading } = useModulePermissions();
  const canCreateProposalsInChat = canCreate('proposals') && !modulePermLoading;
  const canCreateContractsInChat = canCreate('contracts') && !modulePermLoading;
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const [instances, setInstances] = useState<ChatInstance[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [enabledInstanceIds, setEnabledInstanceIds] = useState<Set<string>>(new Set());
  const [popoverOpen, setPopoverOpen] = useState(false);
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

      // Se a conversa atualizada é a selecionada, recarregar mensagens
      // Usar ref para evitar closure stale
      if (selectedConversationIdRef.current === updatedConversation.id) {
        void loadMessages(updatedConversation.id, { silent: true });
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
      return;
    }
    if (!pendingConversationRestoreRef.current) {
      setSelectedConversationId(null);
    }
    setMessages([]);
    // Carregar conversas de todas as instâncias habilitadas
    // Nota: Não usamos polling automático pois os webhooks atualizam em tempo real
    loadConversations(Array.from(enabledInstanceIds));
  }, [enabledInstanceIds, loadConversations]);

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
    setPopoverOpen(false);
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
        className={`w-full min-w-0 max-w-full box-border text-left my-1 rounded-lg px-3 py-2.5 border border-transparent transition-colors ${
          isActive
            ? 'bg-primary/10 shadow-none ring-1 ring-primary/20 dark:bg-primary/15 dark:ring-primary/30'
            : 'bg-background/50 hover:bg-muted/70 hover:border-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'
        }`}
      >
      <div className="flex items-start gap-3">
          <Avatar 
            className={`h-10 w-10 ${hasProfile ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
            onClick={hasProfile ? handleAvatarClick : undefined}
          >
            {identity.avatarUrl ? (
              <AvatarImage
                src={identity.avatarUrl}
                alt={identity.displayName || 'Contato'}
              />
            ) : (
              <AvatarFallback className="bg-primary/10 text-primary font-semibold uppercase">
              {identity.initials}
              </AvatarFallback>
            )}
        </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div
                className={`truncate font-medium ${isActive ? 'text-foreground' : 'text-foreground/90'} ${hasProfile ? 'cursor-pointer transition-opacity hover:opacity-80' : ''}`}
                onClick={hasProfile ? handleNameClick : undefined}
              >
                {identity.displayName}
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {formatRelativeDate(conversation.lastMessageAt || conversation.updated_at)}
            </span>
          </div>
          {showPhoneRow && (
            <p className="text-xs text-muted-foreground truncate">{identity.phoneLine}</p>
          )}
          <p className="text-xs text-muted-foreground truncate">
              {conversation.lastMessagePreview || 'Sem mensagens recentes'}
          </p>
          <div className="flex items-center gap-2 mt-1">
              {conversation.client_id && (
                <Badge variant="default" className="text-[10px]">
                  Cliente
                </Badge>
              )}
              {!conversation.client_id && conversation.leadId && (
                <Badge variant="secondary" className="text-[10px]">
                  Lead
                </Badge>
              )}
              {conversation.status && (
                <Badge
                  variant="outline"
                  className={`text-[10px] ${statusBadgeClass(conversation.status)}`}
                >
                  {conversation.status}
              </Badge>
            )}
              {unread > 0 && (
                <Badge className="text-[10px] bg-primary text-primary-foreground px-2">
                  {unread} novas
              </Badge>
            )}
              {conversation.assigned_team_id && !conversation.assignee_display && conversation.assigned_team_name ? (
                <span
                  className="inline-flex max-w-[140px] items-center gap-1 rounded-md border border-sky-300/80 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-900 dark:border-sky-700/60 dark:bg-sky-950/40 dark:text-sky-100"
                  title={`Fila da equipe: ${conversation.assigned_team_name}`}
                >
                  <Users className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
                  <span className="truncate">{conversation.assigned_team_name}</span>
                </span>
              ) : null}
              {conversation.attendance_status === 'in_service' && conversation.assignee_display ? (
                <span
                  className="inline-flex max-w-[160px] items-center gap-1 rounded-md border border-violet-300/80 bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-900 dark:border-violet-700/60 dark:bg-violet-950/40 dark:text-violet-100"
                  title={conversation.assignee_display}
                >
                  <Headphones className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
                  <span className="truncate font-medium">{shortOperatorName(conversation.assignee_display)}</span>
                </span>
              ) : attendanceStatusLabel(conversation.attendance_status) ? (
                <Badge
                  variant="outline"
                  className="max-w-[200px] truncate border-violet-300/80 bg-violet-500/10 text-[10px] text-violet-900 dark:border-violet-700/60 dark:bg-violet-950/40 dark:text-violet-100"
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
    <div className="flex flex-col h-screen max-h-screen -m-6">
      {/* Barra superior: conexão (perfil WhatsApp) + filtro (tipo / inbox) */}
      <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-border/50 bg-gradient-to-b from-muted/30 to-background">
        <div className="flex items-center gap-3 flex-wrap">
          {instances.length > 0 && (
            <div className="flex flex-shrink-0 items-center gap-2">
              <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto min-h-[52px] py-2 pl-2.5 pr-2 rounded-xl border-2 border-primary/15 bg-card/80 shadow-sm hover:border-primary/35 hover:shadow-md transition-all inline-flex items-center gap-1.5 w-fit max-w-[min(100%,380px)]"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {activeInstance ? (
                        <>
                          <div className="relative shrink-0">
                            <Avatar className="h-10 w-10 rounded-xl ring-2 ring-background shadow-sm">
                              {instanceConnectionUi.avatarUrl ? (
                                <AvatarImage
                                  src={instanceConnectionUi.avatarUrl}
                                  alt=""
                                  className="object-cover"
                                />
                              ) : (
                                <AvatarFallback className="rounded-xl bg-emerald-600/12 text-emerald-800 text-sm font-semibold uppercase dark:bg-emerald-950/40 dark:text-emerald-200">
                                  {(instanceConnectionUi.displayName || '?').slice(0, 2)}
                                </AvatarFallback>
                              )}
                            </Avatar>
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${
                                activeInstance.status === 'connected'
                                  ? 'bg-emerald-500'
                                  : activeInstance.status === 'connecting'
                                    ? 'bg-amber-500'
                                    : 'bg-muted-foreground/50'
                              }`}
                              aria-hidden
                            />
                          </div>
                          <div className="min-w-0 text-left">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-sm font-semibold leading-snug truncate">
                                {instanceConnectionUi.displayName}
                              </span>
                              {enabledInstanceIds.size > 1 && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] px-1.5 py-0 h-4 shrink-0"
                                >
                                  +{enabledInstanceIds.size - 1}
                                </Badge>
                              )}
                            </div>
                            {instanceConnectionUi.phoneDisplay ? (
                              <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5 whitespace-nowrap">
                                {instanceConnectionUi.phoneDisplay}
                              </p>
                            ) : (
                              <p className="text-[11px] text-muted-foreground mt-0.5">
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
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground opacity-80" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="start">
                  <div className="p-2">
                    <div className="border-b border-border px-2 py-1.5 text-sm font-semibold text-muted-foreground">
                      Conexões WhatsApp
            </div>
                    <div className="max-h-[300px] overflow-y-auto">
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
                            className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 cursor-pointer transition-colors"
                            onClick={() => {
                              handleToggleInstance(instance.id);
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
                                handleToggleInstance(instance.id);
                                if (!isEnabled) {
                                  setSelectedInstanceId(instance.id);
                                }
                              }}
                            />
                            <div className="relative h-9 w-9 shrink-0">
                              <Avatar className="h-9 w-9 rounded-lg ring-1 ring-border">
                                {rowUi.avatarUrl ? (
                                  <AvatarImage
                                    src={rowUi.avatarUrl}
                                    alt=""
                                    className="object-cover"
                                  />
                                ) : (
                                  <AvatarFallback className="rounded-lg bg-emerald-600/12 text-emerald-800 text-xs font-semibold uppercase dark:bg-emerald-950/40 dark:text-emerald-200">
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
                              <div className="text-sm font-semibold leading-snug truncate">
                                {rowUi.displayName}
                              </div>
                              <div className="text-xs text-muted-foreground tabular-nums truncate">
                                {rowUi.phoneDisplay || statusLine}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-1 border-t border-border">
                      <div
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={handleAddConnection}
                      >
                        <div className="h-4 w-4 rounded border-2 border-dashed border-muted-foreground/50 flex items-center justify-center">
                          <Plus className="h-3 w-3 text-muted-foreground" />
            </div>
                        <span className="text-sm text-muted-foreground">Adicionar conexão</span>
          </div>
              </div>
                  </div>
                </PopoverContent>
              </Popover>

              <Popover open={filtersPopoverOpen} onOpenChange={setFiltersPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant={filtersPopoverOpen ? 'secondary' : 'outline'}
                    size="icon"
                    className="h-10 w-10 shrink-0 rounded-xl border-2 border-primary/15 shadow-sm hover:border-primary/35"
                    aria-label="Filtros: tipo de conversa e inbox"
                    aria-expanded={filtersPopoverOpen}
                  >
                    <ListFilter className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[min(100vw-2rem,20rem)] p-0" align="start">
                  <div className="p-3 space-y-4">
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                        Tipo de conversa
                      </p>
                      <Tabs
                        value={activeTab}
                        onValueChange={(value) =>
                          setActiveTab(value as 'all' | 'unread' | 'leads' | 'clients')
                        }
                        className="w-full"
                      >
                        <TabsList className="h-auto w-full flex flex-wrap gap-1 justify-start bg-muted/50 p-1">
                          <TabsTrigger value="all" className="text-xs px-2.5 py-1.5 h-8">
                            Todas
                          </TabsTrigger>
                          <TabsTrigger value="unread" className="text-xs px-2.5 py-1.5 h-8 gap-1">
                            Não lidas
                            {attendanceCounts.unread > 0 && (
                              <Badge
                                variant="destructive"
                                className="text-[10px] px-1.5 py-0 h-4 min-w-[1.25rem] justify-center"
                              >
                                {attendanceCounts.unread > 99 ? '99+' : attendanceCounts.unread}
                              </Badge>
                            )}
                          </TabsTrigger>
                          <TabsTrigger value="leads" className="text-xs px-2.5 py-1.5 h-8">
                            Leads
                          </TabsTrigger>
                          <TabsTrigger value="clients" className="text-xs px-2.5 py-1.5 h-8">
                            Clientes
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </div>
                    {user?.tenant_id ? (
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
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
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>
      </div>

      {enabledInstanceIds.size > 0 ? (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Renderizar conteúdo do chat - apenas uma vez, reutilizado para todas as abas */}
          <div className="flex-1 flex flex-col min-h-0 px-6 pb-6 overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 min-h-0">
                <Card className="md:col-span-1 flex flex-col min-h-0 border-border/80 shadow-sm">
                  <CardHeader className="flex-shrink-0 space-y-3 border-b border-border bg-muted/20 px-3 py-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        placeholder="Buscar por nome ou telefone..."
                        className="pl-9 h-9 bg-background"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                        Atendimento
                      </p>
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
                    </div>
                  </CardHeader>
                  <CardContent className="p-0 flex-1 min-h-0 overflow-hidden">
                    <ScrollArea className="h-full [&>div>div[data-radix-scroll-area-viewport]]:!block [&_[data-radix-scroll-area-scrollbar]]:w-1.5 [&_[data-radix-scroll-area-thumb]]:bg-border/50">
                      {loadingConversations ? (
                        <div className="p-4 text-center text-muted-foreground flex items-center justify-center gap-2">
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            Carregando conversas...
                          </div>
                      ) : conversationsToShow.length === 0 ? (
                        <div className="p-4 text-center text-muted-foreground">
                          Nenhuma conversa encontrada
                        </div>
                      ) : (
                        <div className="px-1.5 pb-2 min-w-0">{conversationsToShow.map(renderConversationItem)}</div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>

                <Card className="md:col-span-2 flex flex-col min-h-0 border-border/80 shadow-sm">
                  {selectedConversation ? (
                    <>
                      {viewMode === 'invoice-create' ? (
                        <CardContent className="p-4 flex-1 min-h-0 overflow-auto">
                          <div className="mb-3">
                            <Button variant="ghost" size="sm" onClick={handleBackFromInvoiceCreate}>
                              Voltar para conversa
                            </Button>
                          </div>
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
                        <CardContent className="p-4 flex-1 min-h-0 overflow-auto">
                          <div className="mb-3">
                            <Button variant="ghost" size="sm" onClick={handleBackFromProposalCreate}>
                              Voltar para conversa
                            </Button>
                          </div>
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
                            initialProposalModelId={proposalKanbanModelId}
                            initialTemplateProposalId={proposalKanbanLegacyDraftId}
                            onBack={handleBackFromProposalCreate}
                            onCreated={(created, mode) => {
                              void handleProposalCreatedInChat(created, mode);
                            }}
                          />
                        </CardContent>
                      ) : viewMode === 'contract-create' ? (
                        <CardContent className="p-4 flex-1 min-h-0 overflow-auto">
                          <div className="mb-3">
                            <Button variant="ghost" size="sm" onClick={handleBackFromContractCreate}>
                              Voltar para conversa
                            </Button>
                          </div>
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
                      ) : (
                        <>
                      <CardHeader className="flex-shrink-0 space-y-3 border-b border-border bg-muted/15 px-4 py-3">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <Avatar 
                              className={`h-11 w-11 shrink-0 ${(currentClient || currentLead) ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
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
                              className={`${(currentClient || currentLead) ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                              onClick={() => {
                                if (currentClient && selectedConversation) {
                                  goToClientProfileFromChat(currentClient.id, selectedConversation);
                                } else if (currentLead) {
                                  toast.info('Visualização de perfil de lead em desenvolvimento');
                                }
                              }}
                            >
                              <div className="flex items-center gap-2">
                              <h3 className="font-semibold">
                                {selectedIdentity?.displayName ?? '—'}
                              </h3>
                                {selectedConversation.client_id && (
                                  <Badge variant="default" className="text-xs">
                                    Cliente
                                  </Badge>
                                )}
                                {!selectedConversation.client_id && selectedConversation.leadId && (
                                  <Badge className="border-blue-300/80 bg-blue-500/10 text-xs text-blue-900 hover:bg-blue-500/15 dark:border-blue-800/60 dark:bg-blue-950/45 dark:text-blue-200 dark:hover:bg-blue-950/55">
                                    Lead
                                  </Badge>
                                )}
                                {!selectedConversation.client_id &&
                                  !selectedConversation.leadId &&
                                  selectedConversation.link_state === 'review_required' && (
                                    <Badge className="border-amber-300/80 bg-amber-500/10 text-xs text-amber-950 hover:bg-amber-500/15 dark:border-amber-800/60 dark:bg-amber-950/45 dark:text-amber-100 dark:hover:bg-amber-950/55">
                                      Revisar vínculo
                                    </Badge>
                                  )}
                                {!selectedConversation.client_id &&
                                  !selectedConversation.leadId &&
                                  (!selectedConversation.link_state ||
                                    selectedConversation.link_state === 'unlinked') && (
                                    <Badge variant="outline" className="text-xs bg-muted text-muted-foreground">
                                      Sem vínculo
                                    </Badge>
                                  )}
                              </div>
                              {selectedIdentity?.waSubtitle && (
                                <p className="text-xs text-muted-foreground/90 truncate max-w-[280px]">
                                  WhatsApp: {selectedIdentity.waSubtitle}
                                </p>
                              )}
                              {selectedIdentity?.phoneLine &&
                                selectedIdentity.displayName.trim() !== selectedIdentity.phoneLine.trim() && (
                              <p className="text-xs text-muted-foreground">
                                  {selectedIdentity.phoneLine}
                              </p>
                              )}
                              <div className="mt-2 flex flex-wrap items-center gap-2">
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
                          <div className="flex flex-wrap gap-2 items-center shrink-0 justify-end">
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
                                            className="h-8 gap-1"
                                            onClick={() => void handleCloseAttendance()}
                                          >
                                            <XCircle className="h-3.5 w-3.5" />
                                            Encerrar
                                          </Button>
                                        ) : (
                                          <Button
                                            variant="secondary"
                                            size="sm"
                                            className="h-8 gap-1"
                                            disabled={attendingConversation}
                                            onClick={() => void handleAttendConversation()}
                                          >
                                            <UserCheck className="h-3.5 w-3.5" />
                                            Atender
                                          </Button>
                                        )}
                                      </>
                                    )}
                                    {canTransferAttendance && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 gap-1"
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
                              className="h-8 w-8"
                              title="Sincronizar mensagens e identidade do contato"
                            >
                              <RefreshCw className={`h-4 w-4 ${syncingMessages ? 'animate-spin' : ''}`} />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreVertical className="h-4 w-4" />
                            </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {selectedConversation.client_id ? (
                                  <>
                                    <DropdownMenuItem onClick={handleCreateInvoice}>
                                      <Receipt className="mr-2 h-4 w-4" />
                                      Criar fatura
                                    </DropdownMenuItem>
                                    {canCreateContractsInChat && (
                                      <DropdownMenuItem onClick={handleCreateContract}>
                                        <FileSignature className="mr-2 h-4 w-4" />
                                        Criar contrato
                                      </DropdownMenuItem>
                                    )}
                                    {canCreateProposalsInChat && (
                                      <DropdownMenuItem onClick={handleCreateProposal}>
                                        <FileText className="mr-2 h-4 w-4" />
                                        Criar proposta
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem onClick={handleCreateTask}>
                                      <CheckSquare className="mr-2 h-4 w-4" />
                                      Criar tarefa
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={handleOpenTicket}>
                                      <Ticket className="mr-2 h-4 w-4" />
                                      Abrir ticket
                                    </DropdownMenuItem>
                                  </>
                                ) : selectedConversation.leadId ? (
                                  <>
                                    <DropdownMenuItem onClick={handleConvertToClient} disabled={loadingLead || !currentLead}>
                                      <UserPlus className="mr-2 h-4 w-4" />
                                      Converter para cliente
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    {canCreateContractsInChat && (
                                      <DropdownMenuItem onClick={handleCreateContract}>
                                        <FileSignature className="mr-2 h-4 w-4" />
                                        Criar contrato
                                      </DropdownMenuItem>
                                    )}
                                    {canCreateProposalsInChat && (
                                      <DropdownMenuItem onClick={handleCreateProposal}>
                                        <FileText className="mr-2 h-4 w-4" />
                                        Criar proposta
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem onClick={handleCreateTask}>
                                      <CheckSquare className="mr-2 h-4 w-4" />
                                      Criar tarefa
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={handleOpenTicket}>
                                      <Ticket className="mr-2 h-4 w-4" />
                                      Abrir ticket
                                    </DropdownMenuItem>
                                  </>
                                ) : (
                                  <>
                                    <DropdownMenuItem onClick={openLinkDialog}>
                                      <Users className="mr-2 h-4 w-4" />
                                      {selectedConversation.link_state === 'review_required'
                                        ? 'Escolher vínculo'
                                        : 'Vincular conversa'}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={handleAddLead} disabled={loadingLead}>
                                      <UserPlus className="mr-2 h-4 w-4" />
                                      Adicionar lead
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {(selectedConversation.client_id || selectedConversation.leadId) && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={() => setUnlinkConfirmOpen(true)}
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Remover vínculo com CRM
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="p-0 flex-1 flex flex-col min-h-0">
                        <ScrollArea className="flex-1 min-h-0 [&_[data-radix-scroll-area-scrollbar]]:w-1.5 [&_[data-radix-scroll-area-thumb]]:bg-border/50">
                          <div className="p-4">
                            {loadingMessages ? (
                              <div className="text-center text-muted-foreground flex items-center justify-center gap-2 py-8">
                            <RefreshCw className="h-4 w-4 animate-spin" />
                                Carregando mensagens...
                          </div>
                            ) : messages.length === 0 ? (
                              <div className="text-center text-muted-foreground text-sm py-8">
                                Nenhuma mensagem disponível para esta conversa
                        </div>
                      ) : (
                              <div className="space-y-3 pb-6 max-w-3xl mx-auto w-full">
                            {messages.map((message) => (
                              <div 
                                    key={message.id}
                                    className={`flex ${message.direction === 'outgoing' ? 'justify-end' : 'justify-start'}`}
                              >
                                <div 
                                      className={`max-w-[min(82%,28rem)] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
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
                          className="flex shrink-0 gap-2 border-t border-border bg-muted/20 p-3 backdrop-blur-sm dark:bg-muted/10"
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
                                  title="Ações rápidas"
                                  aria-label="Ações rápidas"
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent side="top" align="start" className="w-56">
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
                            <Input
                              placeholder="Mensagem ou legenda da imagem..."
                              value={newMessage}
                              onChange={(event) => setNewMessage(event.target.value)}
                              className="min-h-10 flex-1 border-border bg-background shadow-sm focus-visible:ring-primary/25"
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
