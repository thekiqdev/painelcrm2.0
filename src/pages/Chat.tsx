import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
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
  ExternalLink,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
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
import { InvoiceForm } from '@/components/finance/InvoiceForm';
import { chatService, ChatConversation, ChatInstance, ChatMessage } from '@/services/chat';
import { useAuth } from '@/contexts/AuthContext';
import { io, Socket } from 'socket.io-client';
import { apiClient } from '@/integrations/api/client';
import { financeService } from '@/services/finance';
import { proposalsService } from '@/services/proposals';
import { tasksService } from '@/services/tasks';
import { ticketsService } from '@/services/tickets';
import { contractsService } from '@/services/contracts';
import { clientsService } from '@/services/clients';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';

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
  const now = Date.now();
  const diff = now - date.getTime();

  if (diff < 60_000) return 'Agora mesmo';
  if (diff < 3_600_000) {
    const minutes = Math.floor(diff / 60_000);
    return `${minutes} min atrás`;
  }
  if (diff < 86_400_000) {
    return `Hoje ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

const statusBadgeClass = (status?: string | null) => {
  if (!status) return 'bg-gray-100 text-gray-700 border-gray-200';
  if (status === 'connected' || status === 'open') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (status === 'connecting') return 'bg-amber-100 text-amber-800 border-amber-200';
  if (status === 'disconnected' || status === 'closed') return 'bg-rose-100 text-rose-800 border-rose-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
};

const Chat = () => {
  const { user, session } = useAuth();
  const navigate = useNavigate();

  const [instances, setInstances] = useState<ChatInstance[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [enabledInstanceIds, setEnabledInstanceIds] = useState<Set<string>>(new Set());
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [newInstanceName, setNewInstanceName] = useState('');
  const [activeTab, setActiveTab] = useState<'unread' | 'read' | 'leads' | 'clients'>('unread');

  const [loadingInstances, setLoadingInstances] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [syncingConversations, setSyncingConversations] = useState(false);
  const [syncingMessages, setSyncingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [creatingInstance, setCreatingInstance] = useState(false);
  const [currentLead, setCurrentLead] = useState<any | null>(null);
  const [currentClient, setCurrentClient] = useState<any | null>(null);
  const [loadingLead, setLoadingLead] = useState(false);
  const [loadingClient, setLoadingClient] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  // Refs para evitar closure stale nos handlers do Socket.IO
  const selectedConversationIdRef = useRef<string | null>(null);
  const enabledInstanceIdsRef = useRef<Set<string>>(new Set());

  // Estados para dialogs
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [contractDialogOpen, setContractDialogOpen] = useState(false);
  const [proposalDialogOpen, setProposalDialogOpen] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [ticketDialogOpen, setTicketDialogOpen] = useState(false);
  
  // Estados para formulários
  const [clients, setClients] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
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
    setLoadingConversations(true);
    try {
      const ids = Array.isArray(instanceIds) ? instanceIds : [instanceIds];
      const allConversations: ChatConversation[] = [];
      
      // Carregar conversas de todas as instâncias habilitadas
      for (const instanceId of ids) {
        try {
          const data = await chatService.getConversations({ instanceId });
          allConversations.push(...data);
        } catch (error) {
          console.error(`Erro ao carregar conversas da instância ${instanceId}:`, error);
        }
      }
      
      // Remover duplicatas baseado no external_chat_id e ordenar por última mensagem
      const uniqueConversations = Array.from(
        new Map(allConversations.map((conv) => [conv.external_chat_id, conv])).values()
      ).sort((a, b) => {
        const dateA = a.lastMessageAt || a.updated_at;
        const dateB = b.lastMessageAt || b.updated_at;
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });
      
      setConversations(uniqueConversations);
    } catch (error) {
      console.error('Erro ao carregar conversas:', error);
      toast.error('Erro ao carregar conversas', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    setLoadingMessages(true);
    try {
      const data = await chatService.getConversationMessages(conversationId);
      setMessages(data);
    } catch (error) {
      console.error('Erro ao carregar mensagens:', error);
      toast.error('Erro ao carregar mensagens', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  // Atualizar refs quando valores mudarem
  useEffect(() => {
    selectedConversationIdRef.current = selectedConversationId;
  }, [selectedConversationId]);

  useEffect(() => {
    enabledInstanceIdsRef.current = enabledInstanceIds;
  }, [enabledInstanceIds]);

  // Carregar mensagens quando uma conversa é selecionada
  // Nota: Não usamos polling automático pois os webhooks atualizam em tempo real
  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
          return;
        }
        
    loadMessages(selectedConversationId);
  }, [selectedConversationId, loadMessages]);

  useEffect(() => {
    loadInstances();
    loadClients();
    loadTicketCategories();
  }, [loadInstances]);

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
      console.log('[Chat] Conversation updated via WebSocket (raw):', {
        id: raw?.id,
        lastMessagePreview: raw?.last_message_preview,
        lastMessageAt: raw?.last_message_at,
        updatedAt: raw?.updated_at,
        fullData: raw,
      });

      // Normalizar payload do backend usando a mesma lógica do chatService
      const metadata = raw.metadata || {};
      const avatarUrl =
        raw.image ||
        raw.image_preview ||
        raw.imagePreview ||
        metadata.image ||
        metadata.image_preview ||
        metadata.imagePreview ||
        null;

      const updatedConversation: ChatConversation = {
        id: raw.id,
        user_id: raw.user_id,
        instance_id: raw.instance_id,
        instance_name: raw.instance_name,
        client_id: raw.client_id ?? null,
        leadId: raw.lead_id ?? null,
        external_chat_id: raw.external_chat_id,
        contactName: raw.contact_name ?? null,
        profileName: raw.profile_name ?? null,
        phoneNumber: raw.phone_number ?? null,
        avatarUrl,
        status: raw.status ?? null,
        lastMessagePreview: raw.last_message_preview ?? null,
        lastMessageAt: raw.last_message_at ?? null,
        unreadCount: typeof raw.unread_count === 'number' ? raw.unread_count : 0,
        metadata: metadata ?? null,
        updated_at: raw.updated_at,
      };
      
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
        loadMessages(updatedConversation.id);
      }
    });

    // Escutar novas mensagens
    socket.on('new_message', (data: { message: any; conversationId: string }) => {
      console.log('[Chat] New message via WebSocket (raw):', data.message);
      
      // Normalizar mensagem recebida (formato semelhante ao usado no chatService)
      const normalizedMessage: ChatMessage = {
        id: data.message.id,
        conversation_id: data.message.conversation_id || data.conversationId,
        direction: data.message.direction === 'outgoing' ? 'outgoing' : 'incoming',
        external_message_id: data.message.external_message_id ?? null,
        body: data.message.body ?? null,
        status: data.message.status ?? null,
        sentAt: data.message.sent_at ?? data.message.created_at ?? null,
        metadata: data.message.metadata ?? null,
        created_at: data.message.created_at,
      };
      
      // Usar ref para evitar closure stale
      const currentSelectedId = selectedConversationIdRef.current;
      
      // Se a mensagem é da conversa selecionada, adicionar à lista
      if (currentSelectedId === data.conversationId) {
        setMessages((prev) => {
          // Verificar se a mensagem já existe
          if (prev.some(m => m.id === normalizedMessage.id || m.external_message_id === normalizedMessage.external_message_id)) {
            return prev;
          }
          return [...prev, normalizedMessage];
        });
      }

      // Atualizar preview da conversa na lista
      setConversations((prev) => {
        const index = prev.findIndex(c => c.id === data.conversationId);
        if (index >= 0) {
          const updated = [...prev];
          const conv = updated[index];
          updated[index] = {
            ...conv,
            lastMessagePreview: normalizedMessage.body,
            lastMessageAt: normalizedMessage.sentAt || conv.lastMessageAt || conv.updated_at || null,
            unreadCount: currentSelectedId === data.conversationId 
              ? conv.unreadCount 
              : (conv.unreadCount || 0) + 1,
          };
          // Mover para o topo
          updated.unshift(updated.splice(index, 1)[0]);
          return updated;
        }
        return prev;
      });
    });

    return () => {
      // Limpar socket quando token mudar ou componente desmontar
      if (socketRef.current) {
        console.log('[Chat] WebSocket: Cleaning up socket');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [session?.token, loadMessages]); // Reconectar se token ou loadMessages mudar

  const loadClients = useCallback(async () => {
    try {
      const data = await clientsService.getClients();
      setClients(data);
    } catch (error) {
      console.error('Erro ao carregar clientes:', error);
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

  // Ref para rastrear IDs das instâncias para detectar mudanças
  const previousInstancesRef = useRef<string>('');

  useEffect(() => {
    const instancesIds = instances.map(i => i.id).join(',');
    
    // Se não há instâncias, limpar tudo
    if (instances.length === 0) {
      setSelectedInstanceId(null);
      setEnabledInstanceIds(new Set());
      setConversations([]);
      setSelectedConversationId(null);
      setMessages([]);
      previousInstancesRef.current = '';
          return;
        }
        
    // Se as instâncias mudaram, reconfigurar apenas se necessário
    if (instancesIds !== previousInstancesRef.current) {
      previousInstancesRef.current = instancesIds;
      
      // Verificar se precisa habilitar uma instância
      setEnabledInstanceIds((prev) => {
        if (prev.size === 0) {
          const connected = instances.find((instance) => instance.status === 'connected');
          const firstInstance = connected || instances[0];
          if (firstInstance) {
            // Usar setTimeout para evitar atualização durante render
            setTimeout(() => {
              setSelectedInstanceId(firstInstance.id);
            }, 0);
            return new Set([firstInstance.id]);
          }
        }
        return prev;
      });
    }
  }, [instances]);

  // Separar a lógica de validação de selectedInstanceId em outro useEffect
  useEffect(() => {
    if (enabledInstanceIds.size > 0) {
      const enabledArray = Array.from(enabledInstanceIds);
      setSelectedInstanceId((currentSelected) => {
        if (!currentSelected || !enabledInstanceIds.has(currentSelected)) {
          return enabledArray[0] || null;
        }
        return currentSelected;
      });
    }
  }, [enabledInstanceIds]);

  useEffect(() => {
    if (enabledInstanceIds.size === 0) {
      setConversations([]);
      return;
    }
    setSelectedConversationId(null);
    setMessages([]);
    // Carregar conversas de todas as instâncias habilitadas
    // Nota: Não usamos polling automático pois os webhooks atualizam em tempo real
    loadConversations(Array.from(enabledInstanceIds));
  }, [enabledInstanceIds, loadConversations]);

  useEffect(() => {
    if (
      selectedConversationId &&
      !conversations.some((conversation) => conversation.id === selectedConversationId)
    ) {
      setSelectedConversationId(null);
      setMessages([]);
    }
  }, [conversations, selectedConversationId]);

  // Scroll automático para o final quando mensagens são carregadas ou nova mensagem é enviada
  useEffect(() => {
    if (messages.length > 0 && !loadingMessages) {
      // Pequeno delay para garantir que o DOM foi atualizado
      setTimeout(() => {
        if (messagesEndRef.current) {
          // Encontrar o viewport do ScrollArea e fazer scroll
          const viewport = messagesEndRef.current.closest('[data-radix-scroll-area-viewport]') as HTMLElement;
          if (viewport) {
            viewport.scrollTop = viewport.scrollHeight;
            } else {
            // Fallback para scrollIntoView
            messagesEndRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
          }
        }
      }, 100);
    }
  }, [messages, selectedConversationId, loadingMessages]);

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

  const readConversations = useMemo(
    () =>
      filteredConversations.filter(
        (conversation) => (conversation.unreadCount ?? 0) === 0,
      ),
    [filteredConversations],
  );

  // Determinar quais conversas mostrar baseado na aba ativa
  const conversationsToShow = useMemo(() => {
    switch (activeTab) {
      case 'unread':
        return unreadConversations;
      case 'read':
        return readConversations;
      case 'leads':
        // Não aplicar filtro - mostrar todas
        return filteredConversations;
      case 'clients':
        // Não aplicar filtro - mostrar todas
        return filteredConversations;
      default:
        return filteredConversations;
    }
  }, [activeTab, unreadConversations, readConversations, filteredConversations]);
  const selectedConversation = conversations.find(
    (conversation) => conversation.id === selectedConversationId,
  );
  const activeInstance =
    instances.find((instance) => instance.id === selectedInstanceId) ||
    instances.find((instance) => instance.status === 'connected') ||
    null;
  const connectionStatus = activeInstance?.status || 'disconnected';

  const handleSelectConversation = async (conversationId: string) => {
    setSelectedConversationId(conversationId);
    await loadMessages(conversationId);

    const conversation = conversations.find((item) => item.id === conversationId);
    if (conversation && (conversation.unreadCount ?? 0) > 0) {
      try {
        await chatService.markConversationRead(conversationId);
        if (enabledInstanceIds.size > 0) {
          loadConversations(Array.from(enabledInstanceIds));
        }
      } catch (error) {
        console.error('Erro ao marcar conversa como lida:', error);
      }
    }

    // Buscar perfil (cliente ou lead) vinculado à conversa
    await loadConversationProfile(conversationId);
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

  const handleSendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedConversationId || !newMessage.trim()) {
      return;
    }

    try {
      setSendingMessage(true);
      await chatService.sendMessage(selectedConversationId, newMessage.trim());
      setNewMessage('');
      await loadMessages(selectedConversationId);
      if (enabledInstanceIds.size > 0) {
        loadConversations(Array.from(enabledInstanceIds));
      }
      // Removido toast de sucesso para evitar notificação a cada envio
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      toast.error('Não foi possível enviar a mensagem', {
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
      const summary = await chatService.syncConversations(selectedInstanceId, { limit: 200 }) as { total?: number; upserted?: number };
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

  const handleSyncMessages = async () => {
    if (!selectedConversationId) return;
    try {
      setSyncingMessages(true);
      await chatService.syncConversationMessages(selectedConversationId, { limit: 100 });
      await loadMessages(selectedConversationId);
      toast.success('Mensagens atualizadas com sucesso!');
    } catch (error) {
      console.error('Erro ao sincronizar mensagens:', error);
      toast.error('Não foi possível sincronizar as mensagens', {
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

      // Atualizar o perfil da conversa após criar lead
      if (selectedConversationId) {
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

      // Marcar lead como convertido
      await apiClient.patch(`/api/leads/${currentLead.id}`, { status: 'Convertido' });

      // Atualizar o perfil da conversa após converter lead para cliente
      if (selectedConversationId) {
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

  const handleSendProposal = () => {
    setProposalDialogOpen(true);
  };

  const handleSaveProposal = async (formData: FormData) => {
    try {
      const title = formData.get('title') as string;
      const description = formData.get('description') as string;
      const amount = parseFloat(formData.get('amount') as string);

      await proposalsService.createProposal({
        title,
        description: description || null,
        amount,
        status: 'draft',
        client_id: currentClient?.id || currentLead?.id || null,
        items: [],
      });

      toast.success('Proposta criada com sucesso!');
      setProposalDialogOpen(false);
    } catch (error) {
      console.error('Erro ao criar proposta:', error);
      toast.error('Não foi possível criar a proposta', {
        description: error instanceof Error ? error.message : undefined,
      });
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

      await tasksService.createTask({
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

      await ticketsService.createTicket({
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
    } catch (error) {
      console.error('Erro ao criar ticket:', error);
      toast.error('Não foi possível criar o ticket', {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const handleCreateInvoice = () => {
    if (!currentClient) return;
    setInvoiceDialogOpen(true);
  };

  const handleSaveInvoice = async (formData: FormData) => {
    try {
      const clientName = formData.get('clientName') as string;
      const invoiceNumber = formData.get('invoiceNumber') as string;
      const issueDate = formData.get('issueDate') as string;
      const dueDate = formData.get('dueDate') as string;
      const status = formData.get('status') as "draft" | "pending" | "paid" | "overdue";
      const items = JSON.parse(formData.get('items') as string);
      const total = parseFloat(formData.get('total') as string);
      const projectId = formData.get('projectId') as string;

      await financeService.createInvoice({
        client_id: currentClient?.id || null,
        project_id: projectId || null,
        invoice_number: invoiceNumber,
        issue_date: issueDate.split('T')[0],
        due_date: dueDate.split('T')[0],
        status,
        items: items.map((item: any) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
        })),
        total,
        notes: null,
      });

      toast.success('Fatura criada com sucesso!');
      setInvoiceDialogOpen(false);
    } catch (error) {
      console.error('Erro ao criar fatura:', error);
      toast.error('Não foi possível criar a fatura', {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const handleCreateContract = () => {
    if (!currentClient) return;
    setContractDialogOpen(true);
  };

  const handleSaveContract = async (formData: FormData) => {
    try {
      const title = formData.get('title') as string;
      const content = formData.get('content') as string;
      const startDate = formData.get('startDate') as string;
      const endDate = formData.get('endDate') as string;
      const totalValue = formData.get('totalValue') as string;

      await contractsService.createContract({
        title,
        client_id: currentClient?.id || '',
        content_html: content,
        start_date: startDate || null,
        end_date: endDate || null,
        total_value: totalValue ? parseFloat(totalValue) : undefined,
        currency: 'BRL',
        auto_renew: false,
        renewal_period: 12,
        signature_settings: {
          require_otp: false,
          require_terms: false,
          invitation_message: 'Você foi convidado para assinar um contrato.',
        },
      });

      toast.success('Contrato criado com sucesso!');
      setContractDialogOpen(false);
    } catch (error) {
      console.error('Erro ao criar contrato:', error);
      toast.error('Não foi possível criar o contrato', {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const handleCreateInstance = async () => {
    if (!newInstanceName.trim()) return;
    try {
      setCreatingInstance(true);
      const instance = await chatService.createInstance({
        name: newInstanceName.trim(),
        metadata: { createdFrom: 'painelcrm' },
      });
      toast.success('Instância criada. Gere o QR Code para conectar.');
      setNewInstanceName('');
      await loadInstances();
      setSelectedInstanceId(instance.id);
    } catch (error) {
      console.error('Erro ao criar instância:', error);
      toast.error('Não foi possível criar a instância', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setCreatingInstance(false);
    }
  };

  const handleNavigateToSettings = () => {
    navigate('/settings?tab=whatsapp');
  };

  const handleToggleInstance = (instanceId: string) => {
    setEnabledInstanceIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(instanceId)) {
        newSet.delete(instanceId);
        // Se a conexão desabilitada era a selecionada, seleciona outra
        if (selectedInstanceId === instanceId && newSet.size > 0) {
          setSelectedInstanceId(Array.from(newSet)[0]);
        }
      } else {
        newSet.add(instanceId);
        // Se não há conexão selecionada, seleciona esta
        if (!selectedInstanceId) {
          setSelectedInstanceId(instanceId);
        }
      }
      return newSet;
    });
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
    const identifier = conversation.contactName || conversation.profileName || conversation.phoneNumber || conversation.external_chat_id;
    const hasProfile = !!(conversation.client_id || conversation.leadId);

    const handleAvatarClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (conversation.client_id) {
        navigate(`/clients/${conversation.client_id}`);
      } else if (conversation.leadId) {
        toast.info('Visualização de perfil de lead em desenvolvimento');
      }
    };

    const handleNameClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (conversation.client_id) {
        navigate(`/clients/${conversation.client_id}`);
      } else if (conversation.leadId) {
        toast.info('Visualização de perfil de lead em desenvolvimento');
      }
    };

    return (
      <button
      key={conversation.id}
        type="button"
        onClick={() => handleSelectConversation(conversation.id)}
        className={`w-full text-left px-4 py-3 border-b transition-colors ${
          isActive ? 'bg-muted' : 'hover:bg-muted/60'
        }`}
    >
      <div className="flex items-start gap-3">
          <Avatar 
            className={`h-10 w-10 ${hasProfile ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
            onClick={hasProfile ? handleAvatarClick : undefined}
          >
            {conversation.avatarUrl ? (
              <AvatarImage
                src={conversation.avatarUrl}
                alt={identifier || 'Contato WhatsApp'}
              />
            ) : (
              <AvatarFallback className="bg-primary/10 text-primary font-semibold uppercase">
                {(identifier || '?').charAt(0)}
              </AvatarFallback>
            )}
        </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div 
                className={`font-medium truncate ${hasProfile ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                onClick={hasProfile ? handleNameClick : undefined}
              >
                {identifier}
                {hasProfile && (
                  <ExternalLink className="inline-block h-3 w-3 ml-1 text-muted-foreground" />
                )}
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {formatRelativeDate(conversation.lastMessageAt || conversation.updated_at)}
            </span>
          </div>
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
          </div>
        </div>
        </div>
      </button>
  );
  };

  return (
    <div className="flex flex-col h-screen max-h-screen -m-6">
      {/* Header Único - 10vh: Conexão e Filtros na mesma linha */}
      <div className="flex-shrink-0 h-[10vh] min-h-[80px] max-h-[10vh] px-6 pt-6 pb-4 overflow-hidden">
        <div className="flex items-center gap-4 h-full">
          {/* Card da Instância - Compacto (mesma altura dos filtros) */}
          {instances.length > 0 && (
            <div className="flex-shrink-0">
              <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                <PopoverTrigger asChild>
              <Button 
                    variant="outline"
                    className="h-9 px-3 border-2 hover:border-primary/50 transition-colors justify-between gap-2 min-w-[200px]"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {activeInstance ? (
                        <>
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            activeInstance.status === 'connected' ? 'bg-emerald-500'
                            : activeInstance.status === 'connecting' ? 'bg-amber-500'
                            : 'bg-gray-400'
                          }`} />
                          <span className="text-sm font-medium truncate">{activeInstance.name}</span>
                          {enabledInstanceIds.size > 1 && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 ml-1">
                              +{enabledInstanceIds.size - 1}
                            </Badge>
                          )}
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground">Selecione uma instância</span>
                      )}
                    </div>
                    <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="start">
                  <div className="p-2">
                    <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground border-b">
                      Conexões WhatsApp
            </div>
                    <div className="max-h-[300px] overflow-y-auto">
                      {instances.map((instance) => {
                        const isEnabled = enabledInstanceIds.has(instance.id);
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
                              onCheckedChange={() => {
                                handleToggleInstance(instance.id);
                                if (!isEnabled) {
                                  setSelectedInstanceId(instance.id);
                                }
                              }}
                            />
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                instance.status === 'connected' ? 'bg-emerald-500'
                                : instance.status === 'connecting' ? 'bg-amber-500'
                                : 'bg-gray-400'
                              }`} />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{instance.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {instance.status === 'connected' ? 'Conectado' 
                                    : instance.status === 'connecting' ? 'Conectando'
                                    : 'Desconectado'}
              </div>
              </div>
            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="border-t mt-1">
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
            </div>
          )}

          {/* Filtros (Tabs) */}
          {enabledInstanceIds.size > 0 && (
            <div className="flex-1 flex items-center">
              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'unread' | 'read' | 'leads' | 'clients')} className="w-full">
                <TabsList className="h-9">
                  <TabsTrigger value="unread" className="text-sm">
                    Não lidos
                    {unreadConversations.length > 0 && (
                      <Badge variant="destructive" className="ml-1.5 text-[10px] px-1.5 py-0 h-4">
                        {unreadConversations.length}
                  </Badge>
                )}
              </TabsTrigger>
                  <TabsTrigger value="read" className="text-sm">Lidos</TabsTrigger>
                  <TabsTrigger value="leads" className="text-sm">Leads</TabsTrigger>
                  <TabsTrigger value="clients" className="text-sm">Clientes</TabsTrigger>
            </TabsList>
              </Tabs>
            </div>
          )}
        </div>
      </div>

      {enabledInstanceIds.size > 0 ? (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden" style={{ height: 'calc(100vh - 10vh)' }}>
          {/* Renderizar conteúdo do chat - apenas uma vez, reutilizado para todas as abas */}
          <div className="flex-1 flex flex-col min-h-0 px-6 pb-6 overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 min-h-0">
                <Card className="md:col-span-1 flex flex-col min-h-0">
                  <CardHeader className="px-4 py-3 border-b flex-shrink-0">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        placeholder="Buscar conversas..."
                        className="pl-9 h-9"
                      />
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
                        <div>{conversationsToShow.map(renderConversationItem)}</div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>

                <Card className="md:col-span-2 flex flex-col min-h-0">
                  {selectedConversation ? (
                    <>
                      <CardHeader className="px-4 py-3 border-b space-y-2 flex-shrink-0">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-3">
                            <Avatar 
                              className={`h-10 w-10 ${(currentClient || currentLead) ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                              onClick={() => {
                                if (currentClient) {
                                  navigate(`/clients/${currentClient.id}`);
                                } else if (currentLead) {
                                  toast.info('Visualização de perfil de lead em desenvolvimento');
                                }
                              }}
                            >
                              {selectedConversation.avatarUrl ? (
                                <AvatarImage
                                  src={selectedConversation.avatarUrl}
                                  alt={
                                    selectedConversation.contactName ||
                                    selectedConversation.profileName ||
                                    selectedConversation.phoneNumber ||
                                    selectedConversation.external_chat_id
                                  }
                                />
                              ) : (
                                <AvatarFallback className="bg-primary/10 text-primary font-semibold uppercase">
                                  {(selectedConversation.contactName ||
                                    selectedConversation.profileName ||
                                    selectedConversation.phoneNumber ||
                                    selectedConversation.external_chat_id
                                  ).charAt(0)}
                                </AvatarFallback>
                              )}
                            </Avatar>
                            <div 
                              className={`${(currentClient || currentLead) ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                              onClick={() => {
                                if (currentClient) {
                                  navigate(`/clients/${currentClient.id}`);
                                } else if (currentLead) {
                                  toast.info('Visualização de perfil de lead em desenvolvimento');
                                }
                              }}
                            >
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold">
                                  {selectedConversation.contactName ||
                                    selectedConversation.profileName ||
                                    selectedConversation.phoneNumber ||
                                    selectedConversation.external_chat_id}
                                </h3>
                                {selectedConversation.client_id && (
                                  <Badge variant="default" className="text-xs">
                                    Cliente
                                  </Badge>
                                )}
                                {!selectedConversation.client_id && selectedConversation.leadId && (
                                  <Badge variant="secondary" className="text-xs">
                                    Lead
                                  </Badge>
                                )}
                              </div>
                              {selectedConversation.phoneNumber && (
                              <p className="text-xs text-muted-foreground">
                                  {selectedConversation.phoneNumber}
                              </p>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 items-center">
                            {(currentClient || currentLead) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  if (currentClient) {
                                    navigate(`/clients/${currentClient.id}`);
                                  } else if (currentLead) {
                                    // Se houver rota para leads, usar aqui
                                    toast.info('Visualização de perfil de lead em desenvolvimento');
                                  }
                                }}
                                className="h-8 w-8"
                                title={currentClient ? 'Ver perfil do cliente' : 'Ver perfil do lead'}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={handleSyncMessages}
                              disabled={syncingMessages}
                              className="h-8 w-8"
                              title="Sincronizar mensagens"
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
                                {currentClient ? (
                                  <>
                                    <DropdownMenuItem onClick={handleCreateInvoice}>
                                      <Receipt className="mr-2 h-4 w-4" />
                                      Criar fatura
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={handleCreateContract}>
                                      <FileSignature className="mr-2 h-4 w-4" />
                                      Criar contrato
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={handleSendProposal}>
                                      <FileText className="mr-2 h-4 w-4" />
                                      Enviar proposta
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={handleCreateTask}>
                                      <CheckSquare className="mr-2 h-4 w-4" />
                                      Criar tarefa
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={handleOpenTicket}>
                                      <Ticket className="mr-2 h-4 w-4" />
                                      Abrir ticket
                                    </DropdownMenuItem>
                                  </>
                                ) : currentLead ? (
                                  <>
                                    <DropdownMenuItem onClick={handleConvertToClient} disabled={loadingLead}>
                                      <UserPlus className="mr-2 h-4 w-4" />
                                      Converter para cliente
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={handleSendProposal}>
                                      <FileText className="mr-2 h-4 w-4" />
                                      Enviar proposta
                                    </DropdownMenuItem>
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
                                  <DropdownMenuItem onClick={handleAddLead} disabled={loadingLead}>
                                    <UserPlus className="mr-2 h-4 w-4" />
                                    Adicionar lead
                                  </DropdownMenuItem>
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
                              <div className="space-y-4 pb-4">
                            {messages.map((message) => (
                              <div 
                                    key={message.id}
                                    className={`flex ${message.direction === 'outgoing' ? 'justify-end' : 'justify-start'}`}
                              >
                                <div 
                                      className={`max-w-[75%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                                        message.direction === 'outgoing'
                                      ? 'bg-primary text-primary-foreground' 
                                      : 'bg-muted'
                                  }`}
                                >
                                      <p className="break-words">{message.body || '(mensagem sem texto)'}</p>
                                      <span
                                        className={`text-[10px] mt-1 block ${
                                          message.direction === 'outgoing'
                                            ? 'text-primary-foreground/80'
                                      : 'text-muted-foreground'
                                        }`}
                                      >
                                        {formatHour(message.sentAt)}
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
                        <form onSubmit={handleSendMessage} className="border-t p-3 flex gap-2 flex-shrink-0">
                            <Input 
                            placeholder="Digite uma mensagem..."
                              value={newMessage}
                            onChange={(event) => setNewMessage(event.target.value)}
                            disabled={sendingMessage}
                            />
                            <Button 
                              type="submit" 
                              size="icon"
                            disabled={sendingMessage || !newMessage.trim()}
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          </form>
                      </CardContent>
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
          <CardContent className="py-10 text-center text-muted-foreground">
            Configure sua primeira instância para começar a usar o chat.
                  </CardContent>
                </Card>
      )}

      {/* Dialogs para ações rápidas */}
      {/* Dialog de Fatura */}
      <InvoiceForm
        open={invoiceDialogOpen}
        onOpenChange={setInvoiceDialogOpen}
        onSave={handleSaveInvoice}
        availableProjects={projects}
      />

      {/* Dialog de Contrato */}
      <Dialog open={contractDialogOpen} onOpenChange={setContractDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Criar Contrato</DialogTitle>
            <DialogDescription>
              Crie um novo contrato para o cliente {currentClient?.name || currentLead?.name}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            handleSaveContract(formData);
          }}>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="contractTitle">Título do Contrato</Label>
                <Input id="contractTitle" name="title" placeholder="Ex: Contrato de Prestação de Serviços" required />
                                </div>
              <div className="space-y-2">
                <Label htmlFor="contractContent">Conteúdo</Label>
                <Textarea id="contractContent" name="content" placeholder="Conteúdo do contrato..." className="min-h-[200px]" />
                            </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contractStartDate">Data de Início</Label>
                  <Input id="contractStartDate" type="date" name="startDate" />
                          </div>
                <div className="space-y-2">
                  <Label htmlFor="contractEndDate">Data de Término</Label>
                  <Input id="contractEndDate" type="date" name="endDate" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="contractValue">Valor Total</Label>
                <Input id="contractValue" name="totalValue" type="number" step="0.01" placeholder="0.00" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setContractDialogOpen(false)}>
                Cancelar
                            </Button>
              <Button type="submit">Criar Contrato</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog de Proposta */}
      <Dialog open={proposalDialogOpen} onOpenChange={setProposalDialogOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Criar Proposta</DialogTitle>
            <DialogDescription>
              Crie uma nova proposta para {currentClient?.name || currentLead?.name || 'o cliente'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            handleSaveProposal(formData);
          }}>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="proposalTitle">Título</Label>
                <Input id="proposalTitle" name="title" placeholder="Ex: Proposta de Serviços" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="proposalDescription">Descrição</Label>
                <Textarea id="proposalDescription" name="description" placeholder="Descrição da proposta..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="proposalAmount">Valor</Label>
                <Input id="proposalAmount" name="amount" type="number" step="0.01" placeholder="0.00" required />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setProposalDialogOpen(false)}>
                Cancelar
                            </Button>
              <Button type="submit">Criar Proposta</Button>
            </DialogFooter>
          </form>
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
