import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import { ClientSidebar } from "@/components/clients/ClientSidebar";
import { clientsService, type ClientTimelineEvent } from "@/services/clients";
import { tasksService, Task, ChecklistItem } from "@/services/tasks";
import { contractsService } from "@/services/contracts";
import { Contract } from "@/types/contracts";
import { getContractDocumentHtml } from "@/utils/contractDocument";
import { chatService, ChatMessage, normalizeChatMessage } from "@/services/chat";
import {
  ensureChatInstances,
  filterConnectedChatInstances,
} from "@/features/chat-core/runtime";
import { customerInvoicesService, type CustomerInvoice } from "@/services/customerInvoices";
import { crmSubscriptionsService, type CrmSubscriptionListItem } from "@/services/crmSubscriptions";
import {
  ClientProfileFinanceHubSection,
  ClientProfileInvoicesSection,
  ClientProfileSubscriptionsSection,
  computeClientBillingSummary,
} from "@/components/clients/ClientProfileBillingPanels";
import { ChatBubbleContent } from "@/components/chat/ChatBubbleContent";
import { MessageStatusIndicator } from "@/components/chat/MessageStatusIndicator";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus,
  Edit2,
  Mail,
  Phone,
  Building,
  Calendar,
  User,
  MoreVertical,
  RefreshCw,
  Trash2,
  FileText,
  Clock,
  CheckSquare,
  Send,
  MessageSquare,
  MessageCircle,
  PieChart,
  CalendarSync,
  CalendarDays,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/AuthContext";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { io, Socket } from "socket.io-client";
import { SOCKET_IO_CLIENT_TRANSPORTS } from "@/lib/socketIoClientOptions";
import {
  acquireSharedChatSocket,
  chatRealtimeBridge,
  shouldUseSingleChatSocket,
} from "@/features/chat-core/realtime/bridge";
import { recordDedicatedChatSocketOpen } from "@/features/chat-core/realtime/dedicatedSocketTelemetry";
import { scheduleInvalidateFloatingChatAggregates } from "@/features/floating-chat/floatingChatQueries";
import { format, parseISO, startOfDay, endOfDay, addMonths } from "date-fns";
import { ClientUpcomingAppointments } from "@/components/clients/ClientUpcomingAppointments";
import { ClientAppointmentsHistory } from "@/components/clients/ClientAppointmentsHistory";
import { ClientProfileDriveFilesTab } from "@/components/clients/ClientProfileDriveFilesTab";
import { ClientProfileTicketsTab } from "@/components/clients/ClientProfileTicketsTab";
import { formatDateOnlyPtBr } from "@/utils/formatCalendarDate";
import { ptBR } from "date-fns/locale";
import { StickyNote, StickyNoteData } from "@/components/clients/StickyNote";
import { cn } from "@/lib/utils";
import { formatCpfCnpjDisplay } from "@/utils/cpfCnpj";
import { resolveProfileAvatarUrl } from "@/utils/chatIdentityDisplay";
import {
  getClientProfileReturnContext,
  navigateBackFromClientProfile,
} from "@/utils/clientProfileNavigation";
import { useIsMobile } from "@/hooks/use-mobile";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { useFloatingChat } from "@/features/floating-chat";
import { useChatOutboundQueue } from "@/hooks/useChatOutboundQueue";
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
import { canDeleteContractStatus } from "@/utils/contractStatusUi";
import { proposalsService, type Proposal } from "@/services/proposals";
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

const clientEditSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  company: z.string().optional(),
  email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  phone: z.string().optional(),
  cpf_cnpj: z.string().optional(),
  status: z.string().optional(),
  source: z.string().optional(),
});

/** Espelha a normalização do backend (`normalizeLeadPhoneToWhatsappDigits`) para aviso de UX. */
function normalizePhoneToWhatsappDigits(raw: string | null | undefined): string | null {
  let digits = String(raw ?? "").replace(/\D/g, "");
  while (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("5555") && digits.length > 13) {
    digits = digits.slice(2);
  }
  if (!digits.startsWith("55") && (digits.length === 10 || digits.length === 11)) {
    digits = `55${digits}`;
  }
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

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

const PROPOSAL_STATUS_LABELS: Record<Proposal["status"], string> = {
  draft: "Rascunho",
  sent: "Enviada",
  accepted: "Aceita",
  rejected: "Recusada",
  expired: "Expirada",
  invoiced: "Faturada",
};

const PROPOSAL_STATUS_CLASS: Record<Proposal["status"], string> = {
  draft: "bg-gray-100 text-gray-800",
  sent: "bg-amber-100 text-amber-800",
  accepted: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  expired: "bg-red-100 text-red-800",
  invoiced: "bg-blue-100 text-blue-800",
};

function clientProfileProposalCode(id: string): string {
  return `PROP-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function formatProposalCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

const timelineEventLabelMap: Record<string, string> = {
  chat_match_client_success: "Conversa vinculada automaticamente ao cliente",
  chat_link_manual: "Vínculo da conversa definido manualmente",
  chat_link_auto_effective: "Vínculo automático do chat efetivado",
  chat_link_migrated_lead_to_client: "Lead convertido em cliente",
  chat_invoice_created: "Fatura criada a partir do chat",
  chat_invoice_sent: "Fatura enviada pelo WhatsApp",
  chat_proposal_created: "Proposta criada a partir do chat",
  chat_proposal_draft_saved: "Rascunho de proposta salvo a partir do chat",
  chat_contract_draft_saved: "Rascunho de contrato salvo a partir do chat",
  chat_contract_sent_for_signature: "Contrato enviado para assinatura a partir do chat",
  invoice_paid: "Fatura paga",
  mercado_pago_checkout_created: "Cobrança Mercado Pago (checkout) criada",
  mercado_pago_webhook_received: "Notificação Mercado Pago recebida",
  agenda_appointment_created: "Compromisso criado na agenda",
  agenda_appointment_updated: "Compromisso atualizado na agenda",
  agenda_appointment_cancelled: "Compromisso cancelado",
  agenda_appointment_rescheduled: "Compromisso reagendado",
  agenda_attendance_confirmed: "Presença confirmada",
  agenda_attendance_not_confirmed: "Cliente não confirmou presença",
  agenda_attendance_no_show: "Cliente não compareceu",
  agenda_confirmation_requested: "Solicitação de confirmação enviada",
  agenda_public_confirmation_confirmed: "Cliente confirmou presença por link público",
  agenda_public_confirmation_needs_reschedule: "Cliente pediu remarcação",
  agenda_public_confirmation_declined: "Cliente informou ausência por link público",
  agenda_public_rescheduled: "Cliente remarcou o compromisso",
  agenda_appointment_completed: "Compromisso concluído",
  agenda_appointment_follow_up_created: "Próximo follow-up agendado",
};

const ClientProfile = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const profileReturn = useMemo(() => getClientProfileReturnContext(location), [location]);
  const handleProfileBack = useCallback(() => {
    navigateBackFromClientProfile(navigate, location);
  }, [navigate, location]);
  const { openChatForClient } = useFloatingChat();
  const [client, setClient] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notes, setNotes] = useState<StickyNoteData[]>([]);
  const [clientTasks, setClientTasks] = useState<Task[]>([]);
  const [clientGroups, setClientGroups] = useState<any[]>([]);
  const [isAddTaskDialogOpen, setIsAddTaskDialogOpen] = useState(false);
  const [newClientGroup, setNewClientGroup] = useState("");
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [isLoadingContracts, setIsLoadingContracts] = useState(false);
  const [clientInvoices, setClientInvoices] = useState<CustomerInvoice[]>([]);
  const [clientSubscriptions, setClientSubscriptions] = useState<CrmSubscriptionListItem[]>([]);
  const [billingDataLoading, setBillingDataLoading] = useState(false);
  const [isEditingClientDetails, setIsEditingClientDetails] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isTaskDetailOpen, setIsTaskDetailOpen] = useState(false);
  const [isEditingTask, setIsEditingTask] = useState(false);
  const [newChecklistItem, setNewChecklistItem] = useState("");
  const [clientMessages, setClientMessages] = useState<ChatMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [timelineEvents, setTimelineEvents] = useState<ClientTimelineEvent[]>([]);
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(false);
  const [whatsappAvatarUrl, setWhatsappAvatarUrl] = useState<string | null>(null);
  const [clientProposals, setClientProposals] = useState<Proposal[]>([]);
  const [clientProposalsLoading, setClientProposalsLoading] = useState(false);
  const [clientProposalsError, setClientProposalsError] = useState<string | null>(null);
  const [clientProposalsReloadKey, setClientProposalsReloadKey] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const pendingOutgoingOptimisticQueueRef = useRef<string[]>([]);
  const newMessageRef = useRef("");
  const isSubmittingCurrentMessageRef = useRef(false);
  const [isSendingClientChat, setIsSendingClientChat] = useState(false);
  const [preparedInstanceId, setPreparedInstanceId] = useState("");
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const { canDeleteRecord, canView, canCreate, canEdit, canChatReply } = useModulePermissions();
  const isMobile = useIsMobile();
  const hasTicketsModule = useFeatureFlag("tickets");

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
  const clientForm = useForm<z.infer<typeof clientEditSchema>>({
    resolver: zodResolver(clientEditSchema),
    defaultValues: {
      name: "",
      company: "",
      email: "",
      phone: "",
      cpf_cnpj: "",
      status: "",
      source: "",
    },
  });

  // Determinar qual aba mostrar baseado na rota
  const getActiveTab = () => {
    if (location.pathname.includes("/tasks")) return "tasks";
    if (location.pathname.includes("/tickets")) return "tickets";
    if (location.pathname.includes("/files")) return "files";
    if (location.pathname.includes("/notes")) return "notes";
    if (location.pathname.includes("/opportunities")) return "opportunities";
    if (location.pathname.includes("/messages")) return "messages";
    if (location.pathname.includes("/calendar")) return "calendar";
    if (location.pathname.includes("/invoices")) return "invoices";
    if (location.pathname.includes("/subscriptions")) return "subscriptions";
    if (location.pathname.includes("/finance")) return "finance";
    if (location.pathname.includes("/timeline")) return "timeline";
    if (location.pathname.includes("/contracts")) return "contracts";
    if (location.pathname.includes("/settings")) return "settings";
    return "overview";
  };

  const activeTab = getActiveTab();
  const canViewBilling = canView("billing");
  const canCreateBilling = canCreate("billing");
  const canEditBilling = canEdit("billing");

  const billingSummary = useMemo(() => computeClientBillingSummary(clientInvoices), [clientInvoices]);

  const activeSubscriptionsCount = useMemo(
    () => clientSubscriptions.filter((s) => s.status === "active").length,
    [clientSubscriptions],
  );

  const clientProposalStats = useMemo(() => {
    const pending = clientProposals.filter((p) => p.status === "draft" || p.status === "sent").length;
    const acceptedRows = clientProposals.filter((p) => p.status === "accepted" || p.status === "invoiced");
    const acceptedCount = acceptedRows.length;
    const acceptedTotal = acceptedRows.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const totalCount = clientProposals.length;
    return { pending, acceptedCount, acceptedTotal, totalCount };
  }, [clientProposals]);

  const clientWhatsappDigits = useMemo(
    () => normalizePhoneToWhatsappDigits(client?.phone),
    [client?.phone],
  );
  const hasClientPhoneField = Boolean(client?.phone?.trim());

  useEffect(() => {
    if (activeTab !== "opportunities" || !id || !canView("proposals")) {
      return;
    }
    let cancelled = false;
    setClientProposalsLoading(true);
    setClientProposalsError(null);
    void proposalsService
      .getProposals({ client_id: id })
      .then((rows) => {
        if (!cancelled) {
          setClientProposals(rows);
          setClientProposalsError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "Erro ao carregar propostas";
          setClientProposalsError(msg);
          setClientProposals([]);
          toast.error(msg);
        }
      })
      .finally(() => {
        if (!cancelled) setClientProposalsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, id, canView, clientProposalsReloadKey]);

  /** Rota legada `/clients/:id/details` — unificada na visão geral. */
  useEffect(() => {
    if (!id) return;
    if (!location.pathname.includes("/details")) return;
    navigate(
      { pathname: `/clients/${id}`, search: location.search, hash: location.hash, state: location.state },
      { replace: true }
    );
  }, [id, location.pathname, location.search, location.hash, location.state, navigate]);

  /** Mobile: conversa WhatsApp sai das abas — `/messages` redireciona para a visão geral. */
  useEffect(() => {
    if (!isMobile || !id) return;
    if (!/\/messages\/?$/.test(location.pathname)) return;
    navigate(
      { pathname: `/clients/${id}`, search: location.search, hash: location.hash, state: location.state },
      { replace: true },
    );
  }, [isMobile, id, location.pathname, location.search, location.hash, location.state, navigate]);

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
    if (id) {
      void loadContracts();
    }
  }, [id]);

  const loadClientBillingData = useCallback(async () => {
    if (!id || !canViewBilling) {
      setClientInvoices([]);
      setClientSubscriptions([]);
      return;
    }
    setBillingDataLoading(true);
    try {
      const [inv, allSubs] = await Promise.all([
        customerInvoicesService.list({ client_id: id, limit: 200 }),
        crmSubscriptionsService.list(),
      ]);
      const subs = (allSubs || []).filter((s) => s.client_id === id);
      setClientInvoices(inv);
      setClientSubscriptions(subs);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Erro ao carregar dados financeiros do cliente");
      setClientInvoices([]);
      setClientSubscriptions([]);
    } finally {
      setBillingDataLoading(false);
    }
  }, [id, canViewBilling]);

  useEffect(() => {
    void loadClientBillingData();
  }, [loadClientBillingData]);

  useEffect(() => {
    if (activeTab === "messages" && id && canView("chat")) {
      void loadClientMessages();
    }
  }, [activeTab, id, canView]);

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

  useEffect(() => {
    if (!client) return;
    clientForm.reset({
      name: client.name || "",
      company: client.company || "",
      email: client.email || "",
      phone: client.phone || "",
      cpf_cnpj: client.cpf_cnpj || "",
      status: client.status || "Ativo",
      source: client.source || "",
    });
  }, [client, clientForm]);

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

  const handleSaveClientDetails = async (values: z.infer<typeof clientEditSchema>) => {
    if (!client?.id) return;
    try {
      const payload = {
        name: values.name.trim(),
        company: values.company?.trim() || undefined,
        email: values.email?.trim() || undefined,
        phone: values.phone?.trim() || undefined,
        cpf_cnpj: values.cpf_cnpj?.replace(/\D/g, "").trim() || null,
        status: values.status?.trim() || undefined,
        source: values.source?.trim() || undefined,
      };
      const updated = await clientsService.updateClient(client.id, payload);
      setClient((prev: any) => ({ ...prev, ...updated }));
      setIsEditingClientDetails(false);
      toast.success("Cadastro do cliente atualizado com sucesso!");
    } catch (error: any) {
      console.error("Erro ao atualizar cadastro do cliente:", error);
      toast.error(`Erro ao salvar cliente: ${error.message}`);
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

  const isConnectedChatInstance = useCallback(
    (instance: { status?: string; metadata?: Record<string, unknown> | null }) => {
      const status = String(instance.status || "").toLowerCase();
      const enabled = instance.metadata?.enabled_in_chat !== false;
      return enabled && (status === "connected" || status === "open");
    },
    [],
  );

  const { data: connectedChatInstances = [] } = useQuery({
    queryKey: ["client-profile", "chat-connected-instances"],
    queryFn: async () => {
      const rows = await ensureChatInstances({ reason: "bootstrap" });
      return rows.filter(isConnectedChatInstance);
    },
    enabled: Boolean(client?.id && canView("chat")),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (connectedChatInstances.length > 0 && !preparedInstanceId) {
      setPreparedInstanceId(connectedChatInstances[0].id);
    }
  }, [connectedChatInstances, preparedInstanceId]);

  const changePreparedChatInstance = useCallback(
    async (nextInstanceId: string) => {
      if (!nextInstanceId) return;
      setPreparedInstanceId(nextInstanceId);
      if (!conversationId || clientMessages.length > 0) return;
      try {
        await chatService.patchPreparedConversationInstance(conversationId, nextInstanceId);
        scheduleInvalidateFloatingChatAggregates(queryClient);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Não foi possível alterar a instância");
      }
    },
    [conversationId, clientMessages.length, queryClient],
  );

  const applyClientMessages = useCallback((updater: (prev: ChatMessage[]) => ChatMessage[]) => {
    setClientMessages((prev) => {
      const next = updater(prev);
      return [...next].sort((a, b) => {
        const dateA = a.sentAt ? new Date(a.sentAt).getTime() : 0;
        const dateB = b.sentAt ? new Date(b.sentAt).getTime() : 0;
        return dateA - dateB;
      });
    });
  }, []);

  const afterOutboundItemDone = useCallback(() => {
    void loadClientMessages();
  }, [loadClientMessages]);

  const { enqueueText, retryFailed } = useChatOutboundQueue({
    conversationId,
    applyMessages: applyClientMessages,
    pendingWsFifoRef: pendingOutgoingOptimisticQueueRef,
    afterItemDone: afterOutboundItemDone,
  });

  useEffect(() => {
    newMessageRef.current = newMessage;
  }, [newMessage]);

  const handleSendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmittingCurrentMessageRef.current || isSendingClientChat) return;
    const text = newMessageRef.current.trim();
    if (!text) return;
    if (!canChatReply()) {
      toast.error("Sem permissão para enviar mensagens.");
      return;
    }

    isSubmittingCurrentMessageRef.current = true;
    setIsSendingClientChat(true);
    try {
      let cid = conversationId;
      if (!cid) {
        if (!id) return;
        if (!client?.phone?.trim()) {
          toast.error("Cadastre um telefone WhatsApp no cliente.");
          return;
        }
        if (connectedChatInstances.length === 0) {
          toast.error("Conecte uma instância WhatsApp para iniciar conversas.");
          return;
        }
        const inst = preparedInstanceId || connectedChatInstances[0]?.id;
        if (!inst) {
          toast.error("Selecione uma instância WhatsApp.");
          return;
        }
        const res = await chatService.resolveConversationForClient({
          client_id: id,
          instance_id: inst,
        });
        cid = res.conversation.id;
        setConversationId(cid);
        scheduleInvalidateFloatingChatAggregates(queryClient);
      }

      newMessageRef.current = "";
      setNewMessage("");
      enqueueText(text, null, cid);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Não foi possível iniciar a conversa.");
    } finally {
      queueMicrotask(() => {
        isSubmittingCurrentMessageRef.current = false;
        setIsSendingClientChat(false);
      });
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

    const useSingle = shouldUseSingleChatSocket();
    let socket: Socket;
    let ownsDedicated = false;
    let unregisterConsumer: (() => void) | undefined;

    if (useSingle) {
      const shared = acquireSharedChatSocket(session.token);
      if (!shared) return;
      socket = shared;
      socketRef.current = socket;
      unregisterConsumer = chatRealtimeBridge.registerConsumer("ClientProfile");
    } else {
      if (socketRef.current?.connected) {
        return;
      }

      const isDev = import.meta.env.DEV;
      const socketUrl = isDev
        ? (import.meta.env.VITE_API_URL || "http://localhost:3001")
        : window.location.origin;

      socket = io(socketUrl, {
        auth: {
          token: session.token,
        },
        transports: [...SOCKET_IO_CLIENT_TRANSPORTS],
        path: "/socket.io/",
      });
      ownsDedicated = true;
      recordDedicatedChatSocketOpen("ClientProfile");
      socketRef.current = socket;
    }

    const onConnect = () => {
      console.log("[ClientProfile] WebSocket connected");
    };

    const onDisconnect = () => {
      console.log("[ClientProfile] WebSocket disconnected");
    };

    const onNewMessage = (data: { message?: any; conversationId?: string }) => {
      const msg = data.message;
      const convId = data.conversationId;
      if (!msg || !convId) return;

      const normalizedData = normalizeChatMessage({
        ...msg,
        conversation_id: msg.conversation_id || convId,
      });

      if (convId === conversationId) {
        setClientMessages((prev) => {
          const queue = pendingOutgoingOptimisticQueueRef.current;
          let base = prev;
          if (normalizedData.direction === "outgoing") {
            const meta = normalizedData.metadata as Record<string, unknown> | null | undefined;
            const cid =
              normalizedData.client_message_id ??
              (meta && typeof meta.client_message_id === "string" ? meta.client_message_id : null);
            if (typeof cid === "string" && cid.length > 0) {
              const opt = prev.find(
                (m) =>
                  m.direction === "outgoing" &&
                  typeof m.id === "string" &&
                  m.id.startsWith("optimistic-") &&
                  (m.client_message_id === cid ||
                    (m.metadata &&
                      typeof m.metadata === "object" &&
                      (m.metadata as Record<string, unknown>).client_message_id === cid)),
              );
              if (opt) {
                pendingOutgoingOptimisticQueueRef.current = queue.filter((id) => id !== opt.id);
                base = prev.filter((m) => m.id !== opt.id);
              }
            } else if (queue.length > 0) {
              const pendingId = queue[0];
              pendingOutgoingOptimisticQueueRef.current = queue.slice(1);
              base = prev.filter((m) => m.id !== pendingId);
            }
          }
          if (normalizedData.id && base.some((m) => m.id === normalizedData.id)) {
            return base;
          }
          const ext = normalizedData.external_message_id;
          if (ext && base.some((m) => m.external_message_id === ext)) {
            return base;
          }
          return [...base, normalizedData].sort((a, b) => {
            const dateA = a.sentAt ? new Date(a.sentAt).getTime() : 0;
            const dateB = b.sentAt ? new Date(b.sentAt).getTime() : 0;
            return dateA - dateB;
          });
        });
      }
    };

    const onMessageUpdatedWithClientId = (data: { message?: any; conversationId?: string }) => {
      const msg = data.message;
      const convId = data.conversationId;
      if (!msg || !convId || convId !== conversationId) return;

      const normalizedData = normalizeChatMessage({
        ...msg,
        conversation_id: msg.conversation_id || convId,
      });

      setClientMessages((prev) => {
        const idx = prev.findIndex(
          (m) =>
            (normalizedData.id && m.id === normalizedData.id) ||
            (!!normalizedData.external_message_id &&
              m.external_message_id === normalizedData.external_message_id) ||
            (!!normalizedData.client_message_id &&
              m.client_message_id === normalizedData.client_message_id),
        );
        if (idx < 0) return prev;
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          ...normalizedData,
        };
        return next;
      });
    };

    const onConversationUpdated = (data: any) => {
      const normalizedData = {
        id: data.id || data.conversation_id || data.conversationId,
      };
      if (normalizedData.id === conversationId) {
        loadClientMessages();
      }
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("new_message", onNewMessage);
    socket.on("message_updated", onMessageUpdatedWithClientId);
    socket.on("conversation_updated", onConversationUpdated);

    return () => {
      unregisterConsumer?.();
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("new_message", onNewMessage);
      socket.off("message_updated", onMessageUpdatedWithClientId);
      socket.off("conversation_updated", onConversationUpdated);
      if (ownsDedicated) {
        socket.disconnect();
      }
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
        content_html: getContractDocumentHtml(contract) || undefined,
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

  const canDeleteContractInUi = (contract: Contract): boolean => {
    const currentUserId = (session as { user?: { id?: string } } | null)?.user?.id;
    return (
      canDeleteContractStatus(contract.status) &&
      canDeleteRecord("contracts", contract.responsible_id || contract.user_id, currentUserId ?? null)
    );
  };

  const formatCurrency = (value: number | null | undefined, currency: string = 'BRL') => {
    if (value == null || Number.isNaN(value)) return "—";
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
    <div
      className={cn(
        "flex w-full min-h-0 flex-col bg-background lg:flex-row",
        /* Desktop: altura fixa útil ≈ viewport − header (4rem) − padding do main (3rem) */
        "min-h-0 lg:min-h-[calc(100dvh-4rem-3rem)] lg:max-h-[calc(100dvh-4rem-3rem)]",
        activeTab === "messages" && "lg:overflow-hidden"
      )}
    >
      {/* Sidebar do Cliente */}
      <aside className="flex w-full shrink-0 flex-col border-b border-border/80 bg-background lg:w-[min(17.5rem,34vw)] lg:max-w-[20rem] lg:border-b-0 lg:border-r">
        <ClientSidebar
          clientId={client.id}
          clientName={client.name}
          avatarSrc={profileAvatar.src}
          avatarInitials={profileAvatar.initials}
          phone={client.phone}
          clientStatus={client.status}
          clientCompany={client.company}
          backFromChat={profileReturn.fromChat}
          showBilling={canViewBilling}
        />
      </aside>

      {/* Conteúdo Principal */}
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col bg-background",
          activeTab === "messages"
            ? "overflow-hidden p-2 sm:p-3 lg:pl-3 lg:pr-4 lg:pt-2 lg:pb-3"
            : "overflow-y-auto px-3 py-2 sm:px-4 sm:py-3"
        )}
      >
        <div
          className={cn(
            "w-full min-h-0 flex-1 flex flex-col",
            activeTab !== "messages" && "mx-auto max-w-7xl"
          )}
        >
          {/* Conteúdo baseado na aba ativa */}
          {activeTab === "overview" && (
            <div className="mb-6 space-y-4 max-md:space-y-3 md:space-y-6">
              <Card className="max-md:shadow-sm">
                <CardHeader className="pb-2 pt-3 max-md:py-2.5 md:flex md:flex-row md:items-center md:justify-between md:pb-3 md:pt-4">
                  <CardTitle className="text-sm font-semibold md:text-base">
                    <span className="md:hidden">Visão geral</span>
                    <span className="hidden md:inline">Resumo</span>
                  </CardTitle>
                  {canView("agenda") && client.id && canCreate("agenda") ? (
                    <Button className="mt-2 w-full sm:w-auto md:mt-0" size="sm" asChild>
                      <Link
                        to={`/agenda?${new URLSearchParams({ client_id: client.id, new: "1" }).toString()}`}
                      >
                        <CalendarDays className="mr-2 h-4 w-4" />
                        Agendar compromisso
                      </Link>
                    </Button>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-3 max-md:space-y-2.5 md:space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      className="md:hidden"
                      onClick={() => void openChatForClient(client.id)}
                    >
                      <MessageSquare className="mr-2 h-4 w-4" />
                      Conversa WhatsApp
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      className="hidden md:inline-flex"
                      onClick={() =>
                        navigate({
                          pathname: `/clients/${client.id}/messages`,
                          search: location.search,
                          state: location.state,
                        })
                      }
                    >
                      <MessageSquare className="mr-2 h-4 w-4" />
                      Ir para conversa
                    </Button>
                    {canViewBilling ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            navigate({
                              pathname: `/clients/${client.id}/invoices`,
                              search: location.search,
                              state: location.state,
                            })
                          }
                        >
                          <FileText className="mr-2 h-4 w-4" />
                          Faturas
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            navigate({
                              pathname: `/clients/${client.id}/subscriptions`,
                              search: location.search,
                              state: location.state,
                            })
                          }
                        >
                          <CalendarSync className="mr-2 h-4 w-4" />
                          Assinaturas
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            navigate({
                              pathname: `/clients/${client.id}/finance`,
                              search: location.search,
                              state: location.state,
                            })
                          }
                        >
                          <PieChart className="mr-2 h-4 w-4" />
                          Financeiro
                        </Button>
                      </>
                    ) : null}
                    {canCreate("proposals") ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          navigate({
                            pathname: `/clients/${client.id}/opportunities`,
                            search: location.search,
                            state: location.state,
                          })
                        }
                      >
                        Propostas
                      </Button>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-6">
                    <Card className="max-md:border-border/70 max-md:shadow-none">
                      <CardContent className="py-2.5 pt-3 pb-2 md:pt-5 md:pb-4">
                        <Label className="text-[10px] text-muted-foreground md:text-xs">Contratos</Label>
                        <p className="mt-0.5 text-lg font-bold tabular-nums md:mt-1 md:text-2xl">{contracts.length}</p>
                      </CardContent>
                    </Card>
                    <Card className="max-md:border-border/70 max-md:shadow-none">
                      <CardContent className="py-2.5 pt-3 pb-2 md:pt-5 md:pb-4">
                        <Label className="text-[10px] text-muted-foreground md:text-xs">Faturas</Label>
                        <p className="mt-0.5 text-lg font-bold tabular-nums md:mt-1 md:text-2xl">
                          {billingDataLoading ? "…" : clientInvoices.length}
                        </p>
                      </CardContent>
                    </Card>
                    {canViewBilling ? (
                      <>
                        <Card className="max-md:border-border/70 max-md:shadow-none">
                          <CardContent className="py-2.5 pt-3 pb-2 md:pt-5 md:pb-4">
                            <Label className="text-[10px] text-muted-foreground md:text-xs">Assinaturas</Label>
                            <p className="mt-0.5 text-lg font-bold tabular-nums md:mt-1 md:text-2xl">
                              {billingDataLoading ? "…" : clientSubscriptions.length}
                            </p>
                      </CardContent>
                    </Card>
                        <Card className="max-md:border-border/70 max-md:shadow-none">
                          <CardContent className="py-2.5 pt-3 pb-2 md:pt-5 md:pb-4">
                            <Label className="text-[10px] text-muted-foreground md:text-xs">Em aberto</Label>
                            <p className="mt-0.5 text-base font-bold tabular-nums text-amber-700 dark:text-amber-400 md:mt-1 md:text-lg">
                              {billingDataLoading ? "…" : formatCurrency(billingSummary.openCents / 100)}
                            </p>
                          </CardContent>
                        </Card>
                      </>
                    ) : null}
                    <Card className="max-md:border-border/70 max-md:shadow-none">
                      <CardContent className="py-2.5 pt-3 pb-2 md:pt-5 md:pb-4">
                        <Label className="text-[10px] text-muted-foreground md:text-xs">Tarefas</Label>
                        <p className="mt-0.5 text-lg font-bold tabular-nums md:mt-1 md:text-2xl">{clientTasks.length}</p>
                      </CardContent>
                    </Card>
                    <Card className="max-md:border-border/70 max-md:shadow-none">
                      <CardContent className="py-2.5 pt-3 pb-2 md:pt-5 md:pb-4">
                        <Label className="text-[10px] text-muted-foreground md:text-xs">Notas</Label>
                        <p className="mt-0.5 text-lg font-bold tabular-nums md:mt-1 md:text-2xl">{notes.length}</p>
                      </CardContent>
                    </Card>
                  </div>
                  {canView("agenda") && client.id ? (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
                      <ClientUpcomingAppointments
                        clientId={client.id}
                        enabled
                        canCreateAgenda={canCreate("agenda")}
                      />
                      <ClientAppointmentsHistory clientId={client.id} enabled />
                    </div>
                  ) : null}
                  {client?.updated_at ? (
                    <p className="text-xs text-muted-foreground">
                      Última atualização no CRM:{" "}
                      {formatDateOnlyPtBr(String(client.updated_at).slice(0, 10))}
                    </p>
                  ) : null}
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
                    <div className="space-y-1.5 rounded-md border p-3 md:space-y-2 md:p-4">
                      <h3 className="text-xs font-semibold md:text-sm">Informações de contato</h3>
                      <div className="space-y-1.5 text-xs md:space-y-2 md:text-sm">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <span>{client.email || "Não informado"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span>{client.phone || "Não informado"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Building className="h-4 w-4 text-muted-foreground" />
                          <span>{client.company || "Não informado"}</span>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2 rounded-md border p-3 md:space-y-3 md:p-4">
                      <h3 className="text-xs font-semibold md:text-sm">Grupo e status</h3>
                      <div className="space-y-2 md:space-y-3">
                        <div>
                          <Label className="text-xs text-muted-foreground">Status</Label>
                          <Badge variant="outline" className="mt-1 ml-2">
                            {client.status || "Ativo"}
                          </Badge>
                        </div>
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
                        <Button size="sm" className="w-full" onClick={handleUpdateGroup}>
                          Atualizar Grupo
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="max-md:border-dashed max-md:bg-muted/25 max-md:shadow-none md:bg-card">
                <CardHeader className="max-md:py-3 md:py-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="max-md:text-sm max-md:font-semibold">Cadastro Completo do Cliente</CardTitle>
                    {isEditingClientDetails ? (
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={() => setIsEditingClientDetails(false)}>
                          Cancelar
                        </Button>
                        <Button type="button" onClick={clientForm.handleSubmit(handleSaveClientDetails)}>
                          Salvar alterações
                        </Button>
                      </div>
                    ) : (
                      <Button variant="outline" onClick={() => setIsEditingClientDetails(true)}>
                        <Edit2 className="mr-2 h-4 w-4" />
                        Editar na tela
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {isEditingClientDetails ? (
                    <Form {...clientForm}>
                      <form className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <FormField control={clientForm.control} name="name" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Nome</FormLabel>
                              <FormControl><Input {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <FormField control={clientForm.control} name="company" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Empresa</FormLabel>
                              <FormControl><Input {...field} value={field.value || ""} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <FormField control={clientForm.control} name="email" render={({ field }) => (
                            <FormItem>
                              <FormLabel>E-mail</FormLabel>
                              <FormControl><Input type="email" {...field} value={field.value || ""} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <FormField control={clientForm.control} name="phone" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Telefone</FormLabel>
                              <FormControl><Input {...field} value={field.value || ""} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <FormField control={clientForm.control} name="cpf_cnpj" render={({ field }) => (
                            <FormItem>
                              <FormLabel>CPF ou CNPJ</FormLabel>
                              <FormControl><Input {...field} value={field.value || ""} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <FormField control={clientForm.control} name="status" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Status</FormLabel>
                              <FormControl><Input {...field} value={field.value || ""} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <FormField control={clientForm.control} name="source" render={({ field }) => (
                            <FormItem className="md:col-span-2">
                              <FormLabel>Origem</FormLabel>
                              <FormControl><Input {...field} value={field.value || ""} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                        </div>
                      </form>
                    </Form>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div><Label>Nome</Label><p className="text-sm mt-1">{client.name}</p></div>
                        <div><Label>Empresa</Label><p className="text-sm mt-1">{client.company || "Não informado"}</p></div>
                        <div><Label>E-mail</Label><p className="text-sm mt-1">{client.email || "Não informado"}</p></div>
                        <div><Label>Telefone</Label><p className="text-sm mt-1">{client.phone || "Não informado"}</p></div>
                        <div><Label>CPF ou CNPJ</Label><p className="text-sm mt-1">{formatCpfCnpjDisplay(client.cpf_cnpj) === "—" ? "Não informado" : formatCpfCnpjDisplay(client.cpf_cnpj)}</p></div>
                        <div><Label>Status</Label><p className="text-sm mt-1">{client.status || "Ativo"}</p></div>
                        <div className="md:col-span-2"><Label>Origem</Label><p className="text-sm mt-1">{client.source || "Não informado"}</p></div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
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

          {activeTab === "tickets" && hasTicketsModule && canView("tickets") && id ? (
            <ClientProfileTicketsTab clientId={id} />
          ) : null}

          {activeTab === "tickets" && (!hasTicketsModule || !canView("tickets")) ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {!hasTicketsModule
                  ? "O módulo de chamados não está disponível no plano atual."
                  : "Sem permissão para ver chamados deste cliente."}
              </CardContent>
            </Card>
          ) : null}

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
                <div className="relative min-h-[400px] rounded-lg border border-border/60 bg-muted/40 p-4 dark:bg-muted/25">
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
                                {canDeleteContractInUi(contract) ? (
                                  <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  onClick={() => handleDeleteContract(contract.id)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Excluir
                                </DropdownMenuItem>
                                  </>
                                ) : null}
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

          {/* Aba Conversa / WhatsApp */}
          {activeTab === "messages" && (
            <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border border-border/80 bg-card shadow-sm lg:rounded-xl">
              <CardHeader className="flex shrink-0 flex-row items-center justify-between space-y-0 border-b border-border/60 px-4 py-2.5">
                <div className="space-y-0.5">
                  <CardTitle className="text-sm font-semibold leading-tight tracking-tight">Conversa</CardTitle>
                  <p className="text-[11px] text-muted-foreground">WhatsApp vinculado ao cliente</p>
                </div>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col p-0">
                {!canView("chat") ? (
                  <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Sem permissão para ver o módulo de Chat.
                  </div>
                ) : !hasClientPhoneField ? (
                  <div className="space-y-3 px-4 py-10 text-center">
                    <MessageCircle className="mx-auto h-10 w-10 text-muted-foreground/60" />
                    <p className="text-sm font-medium text-foreground">Este cliente ainda não possui WhatsApp cadastrado.</p>
                    <p className="text-xs text-muted-foreground">Adicione um telefone no cadastro para iniciar conversas.</p>
                    {canEdit("clients") ? (
                      <Button type="button" variant="outline" size="sm" onClick={() => setIsEditingClientDetails(true)}>
                        Editar cliente
                      </Button>
                    ) : null}
                  </div>
                ) : !clientWhatsappDigits ? (
                  <div className="space-y-3 px-4 py-10 text-center">
                    <Phone className="mx-auto h-10 w-10 text-muted-foreground/60" />
                    <p className="text-sm font-medium text-foreground">Telefone não válido para WhatsApp</p>
                    <p className="text-xs text-muted-foreground">
                      Corrija o número no cadastro (DDI + DDD + número, sem caracteres inválidos).
                    </p>
                    {canEdit("clients") ? (
                      <Button type="button" variant="outline" size="sm" onClick={() => setIsEditingClientDetails(true)}>
                        Editar telefone
                      </Button>
                    ) : null}
                  </div>
                ) : connectedChatInstances.length === 0 ? (
                  <div className="space-y-3 px-4 py-10 text-center">
                    <MessageSquare className="mx-auto h-10 w-10 text-muted-foreground/60" />
                    <p className="text-sm font-medium text-foreground">Conecte uma instância WhatsApp</p>
                    <p className="text-xs text-muted-foreground">É necessário haver pelo menos uma instância conectada para enviar mensagens.</p>
                    <Button type="button" variant="outline" size="sm" asChild>
                      <Link to="/superadmin/conexoes/uazapi">Abrir conexões WhatsApp</Link>
                    </Button>
                  </div>
                ) : isLoadingMessages ? (
                  <div className="flex flex-1 items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Carregando mensagens...
                  </div>
                ) : (
                  <>
                    {connectedChatInstances.length > 1 && clientMessages.length === 0 ? (
                      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2 text-xs text-muted-foreground sm:px-4">
                        <span className="shrink-0">Enviar por:</span>
                        <Select
                          value={preparedInstanceId || connectedChatInstances[0]?.id}
                          onValueChange={(v) => void changePreparedChatInstance(v)}
                        >
                          <SelectTrigger className="h-9 max-w-full flex-1 text-xs">
                            <SelectValue placeholder="Instância" />
                          </SelectTrigger>
                          <SelectContent>
                            {connectedChatInstances.map((instance) => (
                              <SelectItem key={instance.id} value={instance.id}>
                                {instance.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                    <ScrollArea className="min-h-0 flex-1 [&_[data-radix-scroll-area-scrollbar]]:w-1.5 [&_[data-radix-scroll-area-thumb]]:bg-border/50">
                      <div className="px-3 py-3 sm:px-4">
                        {clientMessages.length === 0 ? (
                          <div className="flex flex-col items-center py-12 text-center">
                            <MessageCircle className="mb-3 h-12 w-12 text-muted-foreground/55" />
                            <p className="text-sm font-semibold text-foreground">Nenhuma conversa ainda</p>
                            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                              Digite uma mensagem abaixo para iniciar o atendimento pelo WhatsApp.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-3 pb-2">
                            {clientMessages.map((message) => (
                              <div
                                key={message.id}
                                className={`flex ${message.direction === "outgoing" ? "justify-end" : "justify-start"}`}
                              >
                                <div
                                  className={`max-w-[min(85%,28rem)] rounded-lg px-3 py-2 text-sm shadow-sm ${
                                    message.direction === "outgoing"
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-muted"
                                  }`}
                                >
                                  <ChatBubbleContent message={message} />
                                  <span
                                    className={`mt-1 flex items-center gap-1 text-[10px] ${
                                      message.direction === "outgoing"
                                        ? "text-primary-foreground/80"
                                        : "text-muted-foreground"
                                    }`}
                                  >
                                    <span>
                                      {message.sentAt ? (
                                        <>
                                          {formatRelativeDate(message.sentAt)} • {formatHour(message.sentAt)}
                                        </>
                                      ) : (
                                        "Data não disponível"
                                      )}
                                    </span>
                                    {message.direction === "outgoing" ? (
                                      <>
                                        <MessageStatusIndicator status={message.status} className="h-3 w-3" />
                                        {message.status === "failed" ? (
                                          <button
                                            type="button"
                                            className="ml-1 text-[10px] font-semibold underline underline-offset-2"
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
                            ))}
                            <div ref={messagesEndRef} />
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                    <form
                      onSubmit={(e) => void handleSendMessage(e)}
                      className="flex shrink-0 gap-2 border-t border-border/80 bg-muted/20 px-3 py-2.5 backdrop-blur-sm sm:px-4"
                    >
                      <Input
                        placeholder={
                          canChatReply()
                            ? "Digite uma mensagem…"
                            : "Sem permissão para enviar mensagens"
                        }
                        value={newMessage}
                        onChange={(event) => {
                          const v = event.target.value;
                          newMessageRef.current = v;
                          setNewMessage(v);
                        }}
                        className="min-h-10 bg-background"
                        disabled={!canChatReply()}
                      />
                      <Button
                        type="submit"
                        size="icon"
                        className="shrink-0"
                        disabled={!canChatReply() || !newMessage.trim() || isSendingClientChat}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </form>
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

          {activeTab === "opportunities" && (
            <Card>
              <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between space-y-0">
                <CardTitle>Propostas</CardTitle>
                {canView("proposals") && canCreate("proposals") && id ? (
                  <Button size="sm" asChild>
                    <Link to={`/proposals/new?clientId=${encodeURIComponent(id)}&from=client`}>
                      <Plus className="mr-2 h-4 w-4" />
                      Nova proposta
                    </Link>
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-6">
                {!canView("proposals") ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Sem permissão para visualizar propostas.
                  </p>
                ) : clientProposalsLoading ? (
                  <div className="flex justify-center py-12">
                    <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : clientProposalsError ? (
                  <Alert variant="destructive" className="border-destructive/60">
                    <AlertTitle>Não foi possível carregar as propostas</AlertTitle>
                    <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-sm">{clientProposalsError}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0 border-destructive/40 bg-background"
                        onClick={() => setClientProposalsReloadKey((k) => k + 1)}
                      >
                        Tentar novamente
                      </Button>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                      <div className="rounded-lg border bg-muted/30 px-3 py-2">
                        <p className="text-xs text-muted-foreground">Pendentes</p>
                        <p className="text-lg font-semibold tabular-nums">{clientProposalStats.pending}</p>
                        <p className="text-[10px] text-muted-foreground">Rascunho ou enviada</p>
                      </div>
                      <div className="rounded-lg border bg-muted/30 px-3 py-2">
                        <p className="text-xs text-muted-foreground">Aceitas / faturadas</p>
                        <p className="text-lg font-semibold tabular-nums">{clientProposalStats.acceptedCount}</p>
                        <p className="text-[10px] text-muted-foreground">Aceita ou faturada</p>
                      </div>
                      <div className="rounded-lg border bg-muted/30 px-3 py-2 col-span-2 lg:col-span-1">
                        <p className="text-xs text-muted-foreground">Valor (aceitas + faturadas)</p>
                        <p className="text-lg font-semibold tabular-nums">
                          {formatProposalCurrency(clientProposalStats.acceptedTotal)}
                        </p>
                      </div>
                      <div className="rounded-lg border bg-muted/30 px-3 py-2 col-span-2 lg:col-span-1">
                        <p className="text-xs text-muted-foreground">Total de propostas</p>
                        <p className="text-lg font-semibold tabular-nums">{clientProposalStats.totalCount}</p>
                      </div>
                    </div>
                    {clientProposals.length === 0 ? (
                      <div className="rounded-md border border-dashed py-10 text-center">
                        <p className="text-sm text-muted-foreground mb-4">
                          Nenhuma proposta cadastrada para este cliente.
                        </p>
                        {canCreate("proposals") && id ? (
                          <Button variant="outline" asChild>
                            <Link to={`/proposals/new?clientId=${encodeURIComponent(id)}&from=client`}>
                              <Plus className="mr-2 h-4 w-4" />
                              Nova proposta
                            </Link>
                          </Button>
                        ) : null}
                      </div>
                    ) : (
                      <div className="rounded-md border overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="whitespace-nowrap">Código</TableHead>
                              <TableHead>Título</TableHead>
                              <TableHead className="whitespace-nowrap">Status</TableHead>
                              <TableHead className="whitespace-nowrap hidden sm:table-cell">Validade</TableHead>
                              <TableHead className="text-right whitespace-nowrap">Valor</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {clientProposals.map((p) => (
                              <TableRow
                                key={p.id}
                                className="cursor-pointer hover:bg-muted/50"
                                onClick={() => navigate(`/proposals/${p.id}`)}
                              >
                                <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                                  {clientProfileProposalCode(p.id)}
                                </TableCell>
                                <TableCell className="font-medium max-w-[200px] truncate">{p.title}</TableCell>
                                <TableCell>
                                  <span
                                    className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${PROPOSAL_STATUS_CLASS[p.status]}`}
                                  >
                                    {PROPOSAL_STATUS_LABELS[p.status]}
                                  </span>
                                </TableCell>
                                <TableCell className="hidden sm:table-cell text-sm text-muted-foreground whitespace-nowrap">
                                  {p.valid_until ? formatDateOnlyPtBr(p.valid_until) : "—"}
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-sm font-medium">
                                  {formatProposalCurrency(Number(p.amount) || 0)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === "invoices" && canViewBilling && id ? (
            <ClientProfileInvoicesSection
              clientId={id}
              invoices={clientInvoices}
              loading={billingDataLoading}
              location={location}
              navigate={navigate}
              conversationId={conversationId}
              canCreateBilling={canCreateBilling}
              canEditBilling={canEditBilling}
              onReload={() => void loadClientBillingData()}
            />
          ) : null}

          {activeTab === "invoices" && !canViewBilling ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Sem permissão para ver faturas deste cliente.
              </CardContent>
            </Card>
          ) : null}

          {activeTab === "subscriptions" && canViewBilling && id ? (
            <ClientProfileSubscriptionsSection
              subscriptions={clientSubscriptions}
              loading={billingDataLoading}
              onReload={() => void loadClientBillingData()}
            />
          ) : null}

          {activeTab === "subscriptions" && !canViewBilling ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Sem permissão para ver assinaturas.
              </CardContent>
            </Card>
          ) : null}

          {activeTab === "finance" && canViewBilling && id ? (
            <ClientProfileFinanceHubSection
              clientId={id}
              clientName={client.name}
              invoices={clientInvoices}
              loading={billingDataLoading}
              location={location}
              navigate={navigate}
              canCreateBilling={canCreateBilling}
              activeSubscriptionsCount={activeSubscriptionsCount}
              onReload={() => void loadClientBillingData()}
            />
          ) : null}

          {activeTab === "finance" && !canViewBilling ? (
            <Card>
              <CardHeader>
                <CardTitle>Financeiro</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 py-6 text-center text-sm text-muted-foreground">
                <p>Sem permissão para o módulo de faturação.</p>
                <Button asChild variant="secondary">
                  <Link to="/finance">Abrir financeiro da organização</Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {activeTab === "files" && client.id ? (
            <ClientProfileDriveFilesTab
              clientId={client.id}
              clientDisplayName={client.name || "Cliente"}
              canUpload={canEdit("clients")}
            />
          ) : null}

          {activeTab === "calendar" && canView("agenda") && client.id ? (
            <div className="space-y-4">
              <Card>
                <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>Agenda e compromissos</CardTitle>
                    <CardDescription>Compromissos deste cliente no módulo Agenda do Painel</CardDescription>
        </div>
                  {canCreate("agenda") ? (
                    <Button size="sm" className="shrink-0" asChild>
                      <Link
                        to={`/agenda?${new URLSearchParams({ client_id: client.id, new: "1" }).toString()}`}
                      >
                        <CalendarDays className="mr-2 h-4 w-4" />
                        Agendar compromisso
                      </Link>
                    </Button>
                  ) : null}
                </CardHeader>
              </Card>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
                <ClientUpcomingAppointments
                  clientId={client.id}
                  enabled
                  canCreateAgenda={canCreate("agenda")}
                />
                <ClientAppointmentsHistory clientId={client.id} enabled />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/agenda?client_id=${encodeURIComponent(client.id)}`}>Ver agenda completa</Link>
                </Button>
              </div>
            </div>
          ) : null}

          {activeTab === "calendar" && !canView("agenda") ? (
            <Card>
              <CardHeader>
                <CardTitle>Agenda</CardTitle>
                <CardDescription>Compromissos e eventos do cliente</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 py-6 text-center text-sm text-muted-foreground">
                <p>Sem permissão para ver a Agenda. Peça a um administrador acesso ao módulo.</p>
                <Button asChild variant="secondary">
                  <Link to="/tasks">Abrir tarefas</Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {activeTab === "settings" && (
            <Card>
              <CardHeader>
                <CardTitle>Configurações</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 py-6 text-center text-sm text-muted-foreground">
                <p>Preferências da organização, integrações e utilizadores.</p>
                <Button asChild variant="secondary">
                  <Link to="/settings">Abrir configurações</Link>
                </Button>
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

