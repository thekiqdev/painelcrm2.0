import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { ClientSidebar } from "@/components/clients/ClientSidebar";
import { clientsService, type ClientTimelineEvent } from "@/services/clients";
import { tasksService, Task, ChecklistItem } from "@/services/tasks";
import { contractsService } from "@/services/contracts";
import { Contract } from "@/types/contracts";
import { chatService, ChatMessage } from "@/services/chat";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit2, ArrowLeft, Mail, Phone, Building, Calendar, User, MoreVertical, RefreshCw, Trash2, FileText, Clock, CheckSquare, Send } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/AuthContext";
import { io, Socket } from "socket.io-client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { StickyNote, StickyNoteData } from "@/components/clients/StickyNote";
import { cn } from "@/lib/utils";
import { formatCpfCnpjDisplay } from "@/utils/cpfCnpj";
import { resolveProfileAvatarUrl } from "@/utils/chatIdentityDisplay";
import {
  getClientProfileReturnContext,
  navigateBackFromClientProfile,
} from "@/utils/clientProfileNavigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useForm } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const taskSchema = z.object({
  title: z.string().min(3, "Título deve ter pelo menos 3 caracteres"),
  description: z.string().optional(),
  due_date: z.date().optional(),
  time: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  status: z.enum(["pending", "completed"]).default("pending"),
  assignee: z.string().optional(),
  deal: z.string().optional(),
});

const priorityLabels: Record<"low" | "medium" | "high", string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
};

const priorityVariants: Record<"low" | "medium" | "high", "secondary" | "default" | "destructive"> = {
  low: "secondary",
  medium: "default",
  high: "destructive",
};

const statusLabels: Record<"pending" | "completed", string> = {
  pending: "Pendente",
  completed: "Concluída",
};

const timelineEventLabelMap: Record<string, string> = {
  chat_match_client_success: "Conversa vinculada automaticamente ao cliente",
  chat_link_manual: "Vínculo da conversa definido manualmente",
  chat_link_auto_effective: "Vínculo automático do chat efetivado",
  chat_link_migrated_lead_to_client: "Lead convertido em cliente",
  chat_invoice_created: "Fatura criada a partir do chat",
  chat_invoice_sent: "Fatura enviada pelo WhatsApp",
  invoice_paid: "Fatura paga",
};

const ClientProfile = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const profileReturn = useMemo(() => getClientProfileReturnContext(location), [location]);
  const handleProfileBack = useCallback(() => {
    navigateBackFromClientProfile(navigate, location);
  }, [navigate, location]);
  const [client, setClient] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notes, setNotes] = useState<StickyNoteData[]>([]);
  const [clientTasks, setClientTasks] = useState<Task[]>([]);
  const [clientGroups, setClientGroups] = useState<any[]>([]);
  const [isAddTaskDialogOpen, setIsAddTaskDialogOpen] = useState(false);
  const [newClientGroup, setNewClientGroup] = useState("");
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [isLoadingContracts, setIsLoadingContracts] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isTaskDetailOpen, setIsTaskDetailOpen] = useState(false);
  const [isEditingTask, setIsEditingTask] = useState(false);
  const [newChecklistItem, setNewChecklistItem] = useState("");
  const [clientMessages, setClientMessages] = useState<ChatMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [timelineEvents, setTimelineEvents] = useState<ClientTimelineEvent[]>([]);
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(false);
  const [whatsappAvatarUrl, setWhatsappAvatarUrl] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const { session } = useAuth();
  const taskDetailForm = useForm<z.infer<typeof taskSchema>>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: "",
      description: "",
      status: "pending",
      priority: "medium",
      assignee: "",
      deal: "",
      due_date: undefined,
      time: "",
    },
  });


  const taskForm = useForm<z.infer<typeof taskSchema>>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: "",
      description: "",
      status: "pending",
      priority: "medium",
      assignee: "",
      deal: "",
      time: "",
    },
  });

  // Determinar qual aba mostrar baseado na rota
  const getActiveTab = () => {
    if (location.pathname.includes("/details")) return "details";
    if (location.pathname.includes("/tasks")) return "tasks";
    if (location.pathname.includes("/notes")) return "notes";
    if (location.pathname.includes("/opportunities")) return "opportunities";
    if (location.pathname.includes("/messages")) return "messages";
    if (location.pathname.includes("/calendar")) return "calendar";
    if (location.pathname.includes("/finance")) return "finance";
    if (location.pathname.includes("/timeline")) return "timeline";
    if (location.pathname.includes("/contracts")) return "contracts";
    if (location.pathname.includes("/settings")) return "settings";
    return "overview";
  };

  const activeTab = getActiveTab();

  useEffect(() => {
    if (id) {
      loadClientData();
    }
  }, [id]);

  useEffect(() => {
    if (client?.id) {
      loadClientTasks(client.id);
    }
  }, [client?.id]);

  useEffect(() => {
    if (selectedTask) {
      taskDetailForm.reset({
        title: selectedTask.title || "",
        description: selectedTask.description || "",
        status: selectedTask.status,
        priority: selectedTask.priority || "medium",
        assignee: selectedTask.assignee || "",
        deal: selectedTask.deal || "",
        due_date: selectedTask.date ? new Date(selectedTask.date) : undefined,
        time: selectedTask.time || "",
      });
      setNewChecklistItem("");
      setIsEditingTask(false);
    }
  }, [selectedTask, taskDetailForm]);

  useEffect(() => {
    if (activeTab === "contracts" && id) {
      loadContracts();
    }
  }, [activeTab, id]);

  useEffect(() => {
    if (activeTab === "messages" && id) {
      loadClientMessages();
    }
  }, [activeTab, id]);

  useEffect(() => {
    if (activeTab === "timeline" && id) {
      void loadClientTimeline(id);
    }
  }, [activeTab, id]);

  useEffect(() => {
    if (client?.id) {
      setWhatsappAvatarUrl(client.whatsapp_avatar_url ?? null);
    }
  }, [client?.id, client?.whatsapp_avatar_url]);

  useEffect(() => {
    if (!client?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await chatService.getCrmWhatsappIdentity({ clientId: client.id });
        if (!cancelled) {
          setWhatsappAvatarUrl((prev) => r.avatarUrl ?? prev ?? client.whatsapp_avatar_url ?? null);
        }
      } catch {
        if (!cancelled) setWhatsappAvatarUrl(client.whatsapp_avatar_url ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client?.id]);

  const loadClientData = async () => {
    if (!id) return;
    
    try {
      setIsLoading(true);
      const clientData = await clientsService.getClientById(id);
      if (!clientData) {
        toast.error("Cliente não encontrado");
        navigate("/clients");
        return;
      }
      setClient(clientData);

      // Carregar notas
      try {
        if (clientData.notes) {
          const parsedNotes = typeof clientData.notes === 'string' 
            ? JSON.parse(clientData.notes) 
            : clientData.notes;
          setNotes(Array.isArray(parsedNotes) ? parsedNotes : []);
        } else {
          setNotes([]);
        }
      } catch (e) {
        if (typeof clientData.notes === 'string' && clientData.notes.trim()) {
          setNotes([{
            id: `note-${Date.now()}`,
            content: clientData.notes,
            color: 'bg-yellow-200',
          }]);
        } else {
          setNotes([]);
        }
      }

      await loadClientTasks(clientData.id);

      // Carregar grupos
      const groups = await clientsService.getClientGroups();
      setClientGroups(groups || []);
      setNewClientGroup(clientData.group_id || "");

    } catch (error: any) {
      console.error("Erro ao carregar cliente:", error);
      toast.error("Erro ao carregar dados do cliente");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddNote = () => {
    const newNote: StickyNoteData = {
      id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      content: "",
      color: 'bg-yellow-200',
      created_at: new Date().toISOString(),
    };
    setNotes([...notes, newNote]);
    setTimeout(() => saveNotes([...notes, newNote]), 100);
  };

  const handleUpdateNote = async (noteId: string, content: string) => {
    const updatedNotes = notes.map(note => 
      note.id === noteId 
        ? { ...note, content, updated_at: new Date().toISOString() }
        : note
    );
    setNotes(updatedNotes);
    await saveNotes(updatedNotes);
  };

  const handleDeleteNote = async (noteId: string) => {
    const updatedNotes = notes.filter(note => note.id !== noteId);
    setNotes(updatedNotes);
    await saveNotes(updatedNotes);
  };

  const handleColorChange = async (noteId: string, color: string) => {
    const updatedNotes = notes.map(note => 
      note.id === noteId ? { ...note, color } : note
    );
    setNotes(updatedNotes);
    await saveNotes(updatedNotes);
  };

  const saveNotes = async (notesToSave: StickyNoteData[]) => {
    if (!client) return;
    
    try {
      const notesJson = JSON.stringify(notesToSave);
      await clientsService.updateClient(client.id, { notes: notesJson });
      setClient({ ...client, notes: notesJson });
      toast.success("Notas salvas com sucesso!");
    } catch (error: any) {
      console.error("Erro ao salvar notas:", error);
      toast.error(`Erro ao salvar notas: ${error.message}`);
    }
  };

  const loadClientTasks = async (clientId: string) => {
    try {
      const tasks = await tasksService.getTasks({ clientId });
      setClientTasks(tasks || []);
    } catch (error) {
      console.error("Erro ao carregar tarefas:", error);
      setClientTasks([]);
    }
  };

  const loadClientTimeline = async (clientId: string) => {
    try {
      setIsLoadingTimeline(true);
      const events = await clientsService.getClientTimeline(clientId, { limit: 100 });
      setTimelineEvents(events);
    } catch (error) {
      console.error("Erro ao carregar timeline:", error);
      setTimelineEvents([]);
    } finally {
      setIsLoadingTimeline(false);
    }
  };

  const handleAddTask = async (values: z.infer<typeof taskSchema>) => {
    if (!client) return;
    
    try {
      const formattedDueDate = values.due_date ? format(values.due_date, "yyyy-MM-dd") : undefined;
      
      const newTask = await tasksService.createTask({
        title: values.title,
        description: values.description || undefined,
        date: formattedDueDate || null,
        time: values.time || undefined,
        status: values.status,
        priority: values.priority,
        assignee: values.assignee || undefined,
        deal: values.deal || undefined,
        clientId: client.id,
        client: client.name,
        checklist: [],
      });

      setClientTasks((prev) => [...prev, newTask]);
      
      toast.success("Tarefa adicionada com sucesso!");
      setIsAddTaskDialogOpen(false);
      taskForm.reset({
        title: "",
        description: "",
        due_date: undefined,
        time: "",
        priority: "medium",
        status: "pending",
        assignee: "",
        deal: "",
      });
    } catch (error: any) {
      console.error("Erro ao adicionar tarefa:", error);
      toast.error(`Erro ao adicionar tarefa: ${error.message}`);
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, newStatus: "pending" | "completed") => {
    try {
      const updatedTask = await tasksService.updateTask(taskId, { status: newStatus });
      setClientTasks(clientTasks.map(task => 
        task.id === taskId ? updatedTask : task
      ));
      if (selectedTask?.id === updatedTask.id) {
        setSelectedTask(updatedTask);
      }
      toast.success("Status da tarefa atualizado!");
    } catch (error: any) {
      console.error("Erro ao atualizar tarefa:", error);
      toast.error("Erro ao atualizar tarefa");
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await tasksService.deleteTask(taskId);
      setClientTasks(clientTasks.filter(task => task.id !== taskId));
      if (selectedTask?.id === taskId) {
        setSelectedTask(null);
        setIsTaskDetailOpen(false);
      }
      toast.success("Tarefa excluída com sucesso!");
    } catch (error: any) {
      console.error("Erro ao excluir tarefa:", error);
      toast.error("Erro ao excluir tarefa");
    }
  };

  const openTaskDetail = (task: Task) => {
    setSelectedTask(task);
    setIsTaskDetailOpen(true);
  };

  const closeTaskDetail = () => {
    setIsTaskDetailOpen(false);
    setSelectedTask(null);
    setNewChecklistItem("");
    setIsEditingTask(false);
  };

  const updateChecklist = async (updatedChecklist: ChecklistItem[]) => {
    if (!selectedTask) return;
    const updatedTask = await tasksService.updateTask(selectedTask.id, { checklist: updatedChecklist });
    setSelectedTask(updatedTask);
    setClientTasks(prev => prev.map(task => (task.id === updatedTask.id ? updatedTask : task)));
  };

  const handleSaveTaskEdits = async (values: z.infer<typeof taskSchema>) => {
    if (!selectedTask) return;
    try {
      const formattedDueDate = values.due_date ? format(values.due_date, "yyyy-MM-dd") : undefined;
      const updatedTask = await tasksService.updateTask(selectedTask.id, {
        title: values.title,
        description: values.description || undefined,
        date: formattedDueDate || null,
        time: values.time || null,
        priority: values.priority,
        status: values.status,
        assignee: values.assignee || null,
        deal: values.deal || null,
      });
      setSelectedTask(updatedTask);
      setClientTasks(prev => prev.map(task => (task.id === updatedTask.id ? updatedTask : task)));
      setIsEditingTask(false);
      toast.success("Tarefa atualizada com sucesso!");
    } catch (error: any) {
      console.error("Erro ao atualizar tarefa:", error);
      toast.error("Erro ao salvar alterações da tarefa");
    }
  };

  const handleToggleChecklistItem = async (itemId: string) => {
    if (!selectedTask || !selectedTask.checklist) return;
    const updatedChecklist = selectedTask.checklist.map(item =>
      item.id === itemId ? { ...item, completed: !item.completed } : item
    );
    await updateChecklist(updatedChecklist);
  };

  const handleRemoveChecklistItem = async (itemId: string) => {
    if (!selectedTask || !selectedTask.checklist) return;
    const updatedChecklist = selectedTask.checklist.filter(item => item.id !== itemId);
    await updateChecklist(updatedChecklist);
  };

  const handleAddChecklistItem = async () => {
    if (!selectedTask || !newChecklistItem.trim()) return;
    const newItem: ChecklistItem = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
      text: newChecklistItem.trim(),
      completed: false,
    };
    const updatedChecklist = [...(selectedTask.checklist || []), newItem];
    await updateChecklist(updatedChecklist);
    setNewChecklistItem("");
  };

  const handleUpdateGroup = async () => {
    if (!client) return;
    
    try {
      await clientsService.updateClient(client.id, { group_id: newClientGroup || undefined });
      setClient({ ...client, group_id: newClientGroup });
      toast.success("Grupo atualizado com sucesso!");
    } catch (error: any) {
      console.error("Erro ao atualizar grupo:", error);
      toast.error(`Erro ao atualizar grupo: ${error.message}`);
    }
  };

  const loadContracts = async () => {
    if (!id) return;
    
    try {
      setIsLoadingContracts(true);
      const contractsData = await contractsService.getContracts({ clientId: id });
      setContracts(contractsData || []);
    } catch (error: any) {
      console.error("Erro ao carregar contratos:", error);
      toast.error("Erro ao carregar contratos");
    } finally {
      setIsLoadingContracts(false);
    }
  };

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

  const loadClientMessages = useCallback(async () => {
    if (!id) return;
    
    try {
      setIsLoadingMessages(true);
      const result = await chatService.getClientMessages(id);
      setClientMessages(result.messages || []);
      setConversationId(result.conversationId);
    } catch (error: any) {
      console.error("Erro ao carregar mensagens:", error);
      toast.error("Erro ao carregar mensagens do WhatsApp");
    } finally {
      setIsLoadingMessages(false);
    }
  }, [id]);

  const handleSendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!conversationId || !newMessage.trim()) {
      if (!conversationId) {
        toast.error("Nenhuma conversa encontrada para este cliente");
      }
      return;
    }

    try {
      setSendingMessage(true);
      await chatService.sendMessage(conversationId, newMessage.trim());
      setNewMessage('');
      await loadClientMessages();
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      toast.error('Não foi possível enviar a mensagem', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSendingMessage(false);
    }
  };

  // Scroll para o final das mensagens
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [clientMessages]);

  // WebSocket para atualização em tempo real de mensagens
  useEffect(() => {
    if (!session?.token || !conversationId) {
      return;
    }

    if (socketRef.current?.connected) {
      return;
    }

    const isDev = import.meta.env.DEV;
    const socketUrl = isDev
      ? (import.meta.env.VITE_API_URL || 'http://localhost:3001')
      : window.location.origin;

    const socket = io(socketUrl, {
      auth: {
        token: session.token,
      },
      transports: ['websocket'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[ClientProfile] WebSocket connected');
    });

    socket.on('disconnect', () => {
      console.log('[ClientProfile] WebSocket disconnected');
    });

    socket.on('new_message', (data: any) => {
      // Normalizar dados recebidos (snake_case para camelCase)
      const normalizedData = {
        id: data.id || data.message_id,
        conversationId: data.conversation_id || data.conversationId,
        direction: data.direction,
        body: data.body || data.text,
        sentAt: data.sent_at || data.sentAt || data.created_at || data.createdAt,
        status: data.status,
        metadata: data.metadata,
      };

      // Verificar se a mensagem pertence à conversa atual
      if (normalizedData.conversationId === conversationId) {
        setClientMessages((prev) => {
          // Evitar duplicatas
          if (prev.some((m) => m.id === normalizedData.id)) {
            return prev;
          }
          return [...prev, normalizedData as ChatMessage].sort((a, b) => {
            const dateA = a.sentAt ? new Date(a.sentAt).getTime() : 0;
            const dateB = b.sentAt ? new Date(b.sentAt).getTime() : 0;
            return dateA - dateB;
          });
        });
      }
    });

    socket.on('conversation_updated', (data: any) => {
      // Se a conversa atual foi atualizada, recarregar mensagens
      const normalizedData = {
        id: data.id || data.conversation_id || data.conversationId,
      };
      if (normalizedData.id === conversationId) {
        loadClientMessages();
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [session?.token, conversationId, loadClientMessages]);

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'default';
      case 'DRAFT':
        return 'outline';
      case 'PENDING_SIGNATURE':
        return 'secondary';
      case 'PARTIALLY_SIGNED':
        return 'secondary';
      case 'INACTIVE':
        return 'outline';
      case 'EXPIRED':
        return 'destructive';
      case 'CANCELLED':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      'DRAFT': 'Rascunho',
      'PENDING_SIGNATURE': 'Aguardando Assinatura',
      'PARTIALLY_SIGNED': 'Parcialmente Assinado',
      'ACTIVE': 'Ativo',
      'INACTIVE': 'Inativo',
      'EXPIRED': 'Expirado',
      'CANCELLED': 'Cancelado',
    };
    return labels[status] || status;
  };

  const handleRenewContract = async (contractId: string) => {
    try {
      const contract = contracts.find(c => c.id === contractId);
      if (!contract) return;

      // Criar novo contrato baseado no atual
      const newContract = await contractsService.createContract({
        title: `${contract.title} (Renovação)`,
        client_id: contract.client_id || undefined,
        status: 'DRAFT',
        start_date: contract.end_date ? new Date(new Date(contract.end_date).getTime() + 86400000).toISOString().split('T')[0] : undefined,
        end_date: contract.renewal_period && contract.end_date 
          ? new Date(new Date(contract.end_date).getTime() + contract.renewal_period * 86400000).toISOString().split('T')[0]
          : undefined,
        total_value: contract.total_value || undefined,
        currency: contract.currency || 'BRL',
        auto_renew: contract.auto_renew,
        renewal_period: contract.renewal_period || undefined,
      });

      toast.success("Contrato renovado com sucesso!");
      await loadContracts();
    } catch (error: any) {
      console.error("Erro ao renovar contrato:", error);
      toast.error(`Erro ao renovar contrato: ${error.message}`);
    }
  };

  const handleDeleteContract = async (contractId: string) => {
    if (!confirm("Tem certeza que deseja excluir este contrato?")) return;

    try {
      await contractsService.deleteContract(contractId);
      toast.success("Contrato excluído com sucesso!");
      await loadContracts();
    } catch (error: any) {
      console.error("Erro ao excluir contrato:", error);
      toast.error(`Erro ao excluir contrato: ${error.message}`);
    }
  };

  const formatCurrency = (value: number | null, currency: string = 'BRL') => {
    if (!value) return "—";
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: currency,
    }).format(value);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-crm-primary"></div>
          <p className="mt-4 text-muted-foreground">Carregando cliente...</p>
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Cliente não encontrado</p>
          <Button onClick={handleProfileBack}>
            {profileReturn.fromChat ? "Voltar ao chat" : "Voltar para Clientes"}
          </Button>
        </div>
      </div>
    );
  }

  const profileAvatar = resolveProfileAvatarUrl(
    client,
    whatsappAvatarUrl ?? client.whatsapp_avatar_url ?? null
  );

  return (
    <div className="flex h-full w-full">
      {/* Sidebar do Cliente */}
      <div className="w-64 border-r bg-background shrink-0">
        <ClientSidebar
          clientId={client.id}
          clientName={client.name}
          avatarSrc={profileAvatar.src}
          avatarInitials={profileAvatar.initials}
          phone={client.phone}
          backFromChat={profileReturn.fromChat}
        />
      </div>

      {/* Conteúdo Principal */}
      <div className="flex-1 overflow-y-auto bg-background">
        <div className="max-w-7xl mx-auto p-6">
          {/* Header */}
          <div className="mb-8 pb-6 border-b">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-start gap-4 mb-3">
                  <Avatar className="h-14 w-14 shrink-0">
                    {profileAvatar.src ? (
                      <AvatarImage src={profileAvatar.src} alt={client.name} />
                    ) : null}
                    <AvatarFallback>{profileAvatar.initials}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                      <h1 className="text-3xl font-bold tracking-tight">{client.name}</h1>
                      <Badge variant="secondary" className="text-xs">Cliente</Badge>
                    </div>
                    {client.company && (
                      <p className="text-muted-foreground flex items-center gap-2 text-sm mt-1">
                        <Building className="h-4 w-4 shrink-0" />
                        {client.company}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleProfileBack}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                {profileReturn.fromChat ? "Voltar ao chat" : "Voltar"}
              </Button>
            </div>
          </div>

          {/* Conteúdo baseado na aba ativa */}
          {activeTab === "overview" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Informações de Contato</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {client.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{client.email}</span>
                    </div>
                  )}
                  {client.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{client.phone}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">CPF/CNPJ</span>
                    <span className="text-sm">{formatCpfCnpjDisplay(client.cpf_cnpj) === "—" ? "Não informado" : formatCpfCnpjDisplay(client.cpf_cnpj)}</span>
                  </div>
                  {client.status && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Status</Label>
                      <Badge variant="outline" className="mt-1">{client.status}</Badge>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Estatísticas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Tarefas</Label>
                    <p className="text-2xl font-bold mt-1">{clientTasks.length}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Notas</Label>
                    <p className="text-2xl font-bold mt-1">{notes.length}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Grupo</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Select 
                    value={newClientGroup || "none"} 
                    onValueChange={(value) => setNewClientGroup(value === "none" ? "" : value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um grupo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem grupo</SelectItem>
                      {clientGroups.map(group => (
                        <SelectItem key={group.id} value={group.id}>
                          {group.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button 
                    size="sm" 
                    className="w-full"
                    onClick={handleUpdateGroup}
                  >
                    Atualizar Grupo
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "details" && (
            <Card>
              <CardHeader>
                <CardTitle>Detalhes do Cliente</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Nome</Label>
                    <p className="text-sm mt-1">{client.name}</p>
                  </div>
                  <div>
                    <Label>Empresa</Label>
                    <p className="text-sm mt-1">{client.company || "Não informado"}</p>
                  </div>
                  <div>
                    <Label>E-mail</Label>
                    <p className="text-sm mt-1">{client.email || "Não informado"}</p>
                  </div>
                  <div>
                    <Label>Telefone</Label>
                    <p className="text-sm mt-1">{client.phone || "Não informado"}</p>
                  </div>
                  <div>
                    <Label>CPF ou CNPJ</Label>
                    <p className="text-sm mt-1">{formatCpfCnpjDisplay(client.cpf_cnpj) === "—" ? "Não informado" : formatCpfCnpjDisplay(client.cpf_cnpj)}</p>
                  </div>
                  <div>
                    <Label>Status</Label>
                    <p className="text-sm mt-1">{client.status || "Ativo"}</p>
                  </div>
                  <div>
                    <Label>Origem</Label>
                    <p className="text-sm mt-1">{client.source || "Não informado"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "tasks" && (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Tarefas</CardTitle>
                  <Button onClick={() => setIsAddTaskDialogOpen(true)} size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Nova Tarefa
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {clientTasks && clientTasks.length > 0 ? (
                    clientTasks.map(task => (
                      <Card
                        key={task.id}
                        className="p-4 cursor-pointer"
                        onClick={(event) => {
                          const target = event.target as HTMLElement;
                          if (target.closest("button") || target.closest("select") || target.closest("input")) {
                            return;
                          }
                          openTaskDetail(task);
                        }}
                      >
                        <div className="flex flex-col gap-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <h4 className="font-semibold">{task.title}</h4>
                              {task.description && (
                                <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={priorityVariants[task.priority || "medium"]}>
                                Prioridade {priorityLabels[task.priority || "medium"]}
                              </Badge>
                              <Select
                                value={task.status}
                                onValueChange={(value: "pending" | "completed") => handleUpdateTaskStatus(task.id, value)}
                              >
                                <SelectTrigger className="h-8 w-[140px]" onClick={(e) => e.stopPropagation()}>
                                  <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pending">Pendente</SelectItem>
                                  <SelectItem value="completed">Concluída</SelectItem>
                                </SelectContent>
                              </Select>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteTask(task.id);
                                }}
                              >
                                Remover
                              </Button>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                            {task.date && (
                              <span className="flex items-center gap-1">
                                <CalendarIcon className="h-3 w-3" />
                                {format(new Date(task.date), "dd/MM/yyyy")}
                              </span>
                            )}
                            {task.time && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {task.time}
                              </span>
                            )}
                            {task.assignee && (
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {task.assignee}
                              </span>
                            )}
                            {task.deal && (
                              <span className="flex items-center gap-1">
                                <FileText className="h-3 w-3" />
                                Negócio: {task.deal}
                              </span>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhuma tarefa cadastrada</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
 
          {/* Dialog de detalhes da tarefa */}
      <Dialog open={isTaskDetailOpen} onOpenChange={(open) => (open ? null : closeTaskDetail())}>
            {selectedTask && (
          <DialogContent className="w-[95vw] max-w-[520px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedTask.status === "completed"}
                      onCheckedChange={() =>
                        handleUpdateTaskStatus(
                          selectedTask.id,
                          selectedTask.status === "completed" ? "pending" : "completed"
                        )
                      }
                    />
                    {selectedTask.title}
                  </DialogTitle>
                  <DialogDescription className="flex flex-wrap gap-2 mt-2">
                    <Badge variant="outline">Cliente: {client.name}</Badge>
                    <Badge variant={priorityVariants[selectedTask.priority || "medium"]}>
                      {priorityLabels[selectedTask.priority || "medium"]} Prioridade
                    </Badge>
                    <Badge variant={selectedTask.status === "completed" ? "outline" : "default"}>
                      {statusLabels[selectedTask.status]}
                    </Badge>
                  </DialogDescription>
                </DialogHeader>
                {isEditingTask ? (
                  <Form {...taskDetailForm}>
                    <form onSubmit={taskDetailForm.handleSubmit(handleSaveTaskEdits)} className="space-y-4">
                      <FormField
                        control={taskDetailForm.control}
                        name="title"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Título</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Digite o título da tarefa" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={taskDetailForm.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Descrição</FormLabel>
                            <FormControl>
                              <Textarea {...field} placeholder="Descreva os detalhes da tarefa" value={field.value || ""} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField
                          control={taskDetailForm.control}
                          name="due_date"
                          render={({ field }) => (
                            <FormItem className="flex flex-col">
                              <FormLabel>Data de vencimento</FormLabel>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <FormControl>
                                    <Button variant={"outline"} className="w-full pl-3 text-left font-normal flex justify-between items-center">
                                      {field.value ? format(field.value, "dd/MM/yyyy") : <span>Selecionar data</span>}
                                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                    </Button>
                                  </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <CalendarComponent mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                                </PopoverContent>
                              </Popover>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={taskDetailForm.control}
                          name="time"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Horário</FormLabel>
                              <FormControl>
                                <Input type="time" {...field} value={field.value || ""} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField
                          control={taskDetailForm.control}
                          name="priority"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Prioridade</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Selecione a prioridade" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="high">Alta</SelectItem>
                                  <SelectItem value="medium">Média</SelectItem>
                                  <SelectItem value="low">Baixa</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={taskDetailForm.control}
                          name="status"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Status</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Selecione o status" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="pending">Pendente</SelectItem>
                                  <SelectItem value="completed">Concluída</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={taskDetailForm.control}
                        name="assignee"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Responsável</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Nome do responsável" value={field.value || ""} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={taskDetailForm.control}
                        name="deal"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Negócio</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Nome do negócio (opcional)" value={field.value || ""} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </form>
                  </Form>
                ) : (
                  <div className="space-y-4">
                    {selectedTask.description && (
                      <div>
                        <Label className="text-xs uppercase text-muted-foreground">Descrição</Label>
                        <p className="mt-1 text-sm text-muted-foreground">{selectedTask.description}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                      {selectedTask.date && (
                        <div className="flex items-center gap-2">
                          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                          <span>{format(new Date(selectedTask.date), "dd/MM/yyyy")}</span>
                        </div>
                      )}
                      {selectedTask.time && (
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span>{selectedTask.time}</span>
                        </div>
                      )}
                      {selectedTask.assignee && (
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span>{selectedTask.assignee}</span>
                        </div>
                      )}
                      {selectedTask.deal && (
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span>Negócio: {selectedTask.deal}</span>
                        </div>
                      )}
                    </div>
                    <div>
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        <CheckSquare className="h-4 w-4 text-muted-foreground" />
                        <h4 className="text-sm font-semibold">Lista de Verificação</h4>
                      </div>
                      {selectedTask.checklist && selectedTask.checklist.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {
                            selectedTask.checklist.filter(item => item.completed).length
                          }/{selectedTask.checklist.length} itens concluídos
                        </span>
                      )}
                    </div>
                    {selectedTask.checklist && selectedTask.checklist.length > 0 ? (
                      <div className="space-y-2 mb-3">
                        {selectedTask.checklist.map(item => (
                          <div key={item.id} className="flex items-center gap-3 rounded-md border p-2 bg-muted/50">
                            <Checkbox
                              checked={item.completed}
                              onCheckedChange={() => handleToggleChecklistItem(item.id)}
                            />
                            <span className={cn("flex-1 text-sm", { "line-through text-muted-foreground": item.completed })}>
                              {item.text}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => handleRemoveChecklistItem(item.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground mb-3">Nenhum item na lista de verificação.</p>
                    )}
                    <div className="flex gap-2">
                      <Input
                        placeholder="Adicionar item à lista"
                        value={newChecklistItem}
                        onChange={(e) => setNewChecklistItem(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddChecklistItem();
                          }
                        }}
                      />
                      <Button onClick={handleAddChecklistItem} disabled={!newChecklistItem.trim()}>
                        Adicionar
                      </Button>
                    </div>
                  </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => setIsEditingTask(true)}
                      >
                        Editar tarefa
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() =>
                          handleUpdateTaskStatus(
                            selectedTask.id,
                            selectedTask.status === "completed" ? "pending" : "completed"
                          )
                        }
                      >
                        {selectedTask.status === "completed" ? "Marcar como pendente" : "Marcar como concluída"}
                      </Button>
                      <Button
                        variant="destructive"
                        className="flex-1"
                        onClick={() => handleDeleteTask(selectedTask.id)}
                      >
                        Excluir tarefa
                      </Button>
                    </div>
                  </div>
                )}
                <DialogFooter>
                  {isEditingTask ? (
                    <>
                      <Button variant="outline" onClick={() => setIsEditingTask(false)}>
                        Cancelar
                      </Button>
                      <Button onClick={taskDetailForm.handleSubmit(handleSaveTaskEdits)}>
                        Salvar alterações
                      </Button>
                    </>
                  ) : (
                    <Button onClick={closeTaskDetail} variant="outline">
                      Fechar
                    </Button>
                  )}
                </DialogFooter>
              </DialogContent>
            )}
          </Dialog>

          {activeTab === "notes" && (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Notas Autoadesivas</CardTitle>
                  <Button onClick={handleAddNote} size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Nova Nota
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="relative min-h-[400px] p-4 bg-gray-50 rounded-lg">
                  {notes.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {notes.map(note => (
                        <StickyNote
                          key={note.id}
                          note={note}
                          onUpdate={handleUpdateNote}
                          onDelete={handleDeleteNote}
                          onColorChange={handleColorChange}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-[300px] text-center">
                      <p className="text-muted-foreground mb-4">
                        Nenhuma nota cadastrada
                      </p>
                      <Button onClick={handleAddNote} variant="outline">
                        <Plus className="mr-2 h-4 w-4" />
                        Criar Primeira Nota
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Aba de Contratos */}
          {activeTab === "contracts" && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Contratos</CardTitle>
                  <Button onClick={() => navigate(`/contracts/new?clientId=${id}`)} size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Novo Contrato
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {isLoadingContracts ? (
                  <div className="py-10 text-center">
                    <p className="text-muted-foreground">Carregando contratos...</p>
                  </div>
                ) : contracts.length === 0 ? (
                  <div className="py-10 text-center">
                    <p className="text-muted-foreground mb-4">Nenhum contrato encontrado</p>
                    <Button onClick={() => navigate(`/contracts/new?clientId=${id}`)} variant="outline">
                      <Plus className="mr-2 h-4 w-4" />
                      Criar Primeiro Contrato
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Número</TableHead>
                        <TableHead>Título</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Data Início</TableHead>
                        <TableHead>Data Fim</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contracts.map((contract) => (
                        <TableRow key={contract.id}>
                          <TableCell className="font-mono text-sm">
                            {contract.contract_number}
                          </TableCell>
                          <TableCell className="font-medium">
                            {contract.title}
                          </TableCell>
                          <TableCell>
                            <Badge variant={getStatusBadgeVariant(contract.status)}>
                              {getStatusLabel(contract.status)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {contract.start_date 
                              ? format(new Date(contract.start_date), "dd/MM/yyyy")
                              : "—"}
                          </TableCell>
                          <TableCell>
                            {contract.end_date 
                              ? format(new Date(contract.end_date), "dd/MM/yyyy")
                              : "—"}
                          </TableCell>
                          <TableCell>
                            {formatCurrency(contract.total_value, contract.currency)}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Ações</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => navigate(`/contracts/${contract.id}`, { state: { fromClientProfile: true } })}>
                                  <FileText className="h-4 w-4 mr-2" />
                                  Visualizar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => navigate(`/contracts/${contract.id}/edit`, { state: { fromClientProfile: true } })}>
                                  <Edit2 className="h-4 w-4 mr-2" />
                                  Editar
                                </DropdownMenuItem>
                                {contract.status === 'ACTIVE' && contract.auto_renew && (
                                  <DropdownMenuItem onClick={() => handleRenewContract(contract.id)}>
                                    <RefreshCw className="h-4 w-4 mr-2" />
                                    Renovar
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  onClick={() => handleDeleteContract(contract.id)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Excluir
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}

          {/* Aba de Mensagens */}
          {activeTab === "messages" && (
            <Card className="flex flex-col h-[calc(100vh-200px)]">
              <CardHeader className="flex-shrink-0">
                <CardTitle>Mensagens do WhatsApp</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col min-h-0 p-0">
                {isLoadingMessages ? (
                  <div className="text-center text-muted-foreground flex items-center justify-center gap-2 py-8">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Carregando mensagens...
                  </div>
                ) : (
                  <>
                    <ScrollArea className="flex-1 min-h-0 [&_[data-radix-scroll-area-scrollbar]]:w-1.5 [&_[data-radix-scroll-area-thumb]]:bg-border/50">
                      <div className="p-4">
                        {clientMessages.length === 0 ? (
                          <div className="text-center text-muted-foreground text-sm py-8">
                            Nenhuma mensagem do WhatsApp encontrada para este cliente
                          </div>
                        ) : (
                          <div className="space-y-4 pb-4">
                            {clientMessages.map((message) => (
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
                                    {message.sentAt ? (
                                      <>
                                        {formatRelativeDate(message.sentAt)} • {formatHour(message.sentAt)}
                                      </>
                                    ) : 'Data não disponível'}
                                  </span>
                                </div>
                              </div>
                            ))}
                            <div ref={messagesEndRef} />
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                    {conversationId && (
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
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === "timeline" && (
            <Card>
              <CardHeader>
                <CardTitle>Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingTimeline ? (
                  <p className="text-sm text-muted-foreground">Carregando timeline...</p>
                ) : timelineEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum evento encontrado.</p>
                ) : (
                  <div className="space-y-3">
                    {timelineEvents.map((event) => (
                      <div key={event.id} className="rounded-md border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium">
                            {timelineEventLabelMap[event.event_name] || event.event_name}
                          </p>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(event.created_at), "dd/MM/yyyy HH:mm")}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline">{event.source}</Badge>
                          {event.reference_type && event.reference_id && (
                            <span>
                              Ref: {event.reference_type} ({event.reference_id.slice(0, 8)})
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Outras abas - placeholder */}
          {(activeTab === "opportunities" || activeTab === "calendar" || 
            activeTab === "finance" || activeTab === "settings") && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {activeTab === "opportunities" && "Oportunidades"}
                  {activeTab === "calendar" && "Agenda"}
                  {activeTab === "finance" && "Financeiro"}
                  {activeTab === "settings" && "Configurações"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-center py-8">
                  Esta funcionalidade será implementada em breve.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Dialog para adicionar tarefa */}
      <Dialog open={isAddTaskDialogOpen} onOpenChange={setIsAddTaskDialogOpen}>
        <DialogContent className="w-[90vw] max-w-[460px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Tarefa</DialogTitle>
            <DialogDescription>
              Adicione uma nova tarefa para este cliente
            </DialogDescription>
          </DialogHeader>
          <Form {...taskForm}>
            <form onSubmit={taskForm.handleSubmit(handleAddTask)} className="space-y-4">
              <FormField
                control={taskForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Título</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Digite o título da tarefa" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={taskForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Descreva os detalhes da tarefa" value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={taskForm.control}
                name="due_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Data de vencimento</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant={"outline"} className="w-full pl-3 text-left font-normal flex justify-between items-center">
                            {field.value ? format(field.value, "dd/MM/yyyy") : <span>Selecionar data</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={taskForm.control}
                name="time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Horário</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={taskForm.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Prioridade</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione a prioridade" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="high">Alta</SelectItem>
                          <SelectItem value="medium">Média</SelectItem>
                          <SelectItem value="low">Baixa</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={taskForm.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="pending">Pendente</SelectItem>
                          <SelectItem value="completed">Concluída</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={taskForm.control}
                name="assignee"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Responsável</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Nome do responsável" value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={taskForm.control}
                name="deal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Negócio</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Nome do negócio (opcional)" value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="text-sm text-muted-foreground">
                Esta tarefa será vinculada ao cliente <span className="font-medium">{client.name}</span>.
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsAddTaskDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">Salvar Tarefa</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientProfile;

