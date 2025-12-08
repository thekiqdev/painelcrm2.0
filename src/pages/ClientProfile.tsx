import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { ClientSidebar } from "@/components/clients/ClientSidebar";
import { clientsService } from "@/services/clients";
import { tasksService, Task, ChecklistItem } from "@/services/tasks";
import { contractsService } from "@/services/contracts";
import { Contract } from "@/types/contracts";
import { chatService, ChatConversation, ChatMessage } from "@/services/chat";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit2, ArrowLeft, Mail, Phone, Building, Calendar, User, MoreVertical, RefreshCw, Trash2, FileText, Clock, CheckSquare, MessageSquare, Send } from "lucide-react";
import { format } from "date-fns";
import { StickyNote, StickyNoteData } from "@/components/clients/StickyNote";
import { cn } from "@/lib/utils";
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

const ClientProfile = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
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
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [isTaskDetailOpen, setIsTaskDetailOpen] = useState(false);
  const [isEditingTask, setIsEditingTask] = useState(false);
  const [newChecklistItem, setNewChecklistItem] = useState("");
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
    if (activeTab === "messages" && client?.id) {
      loadClientConversations();
    }
  }, [activeTab, client?.id]);

  useEffect(() => {
    if (selectedConversationId) {
      loadConversationMessages(selectedConversationId);
    }
  }, [selectedConversationId]);

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

  const loadClientConversations = async () => {
    if (!client?.id) return;
    
    try {
      setLoadingConversations(true);
      const convs = await chatService.getConversations({ clientId: client.id });
      setConversations(convs || []);
    } catch (error) {
      console.error("Erro ao carregar conversas:", error);
      toast.error("Erro ao carregar conversas do WhatsApp");
      setConversations([]);
    } finally {
      setLoadingConversations(false);
    }
  };

  const loadConversationMessages = async (conversationId: string) => {
    try {
      setLoadingMessages(true);
      const msgs = await chatService.getConversationMessages(conversationId);
      setMessages(msgs || []);
    } catch (error) {
      console.error("Erro ao carregar mensagens:", error);
      toast.error("Erro ao carregar mensagens");
      setMessages([]);
    } finally {
      setLoadingMessages(false);
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
          <Button onClick={() => navigate("/clients")}>Voltar para Clientes</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full">
      {/* Sidebar do Cliente */}
      <div className="w-64 border-r bg-background shrink-0">
        <ClientSidebar clientId={client.id} clientName={client.name} />
      </div>

      {/* Conteúdo Principal */}
      <div className="flex-1 overflow-y-auto bg-background">
        <div className="max-w-7xl mx-auto p-6">
          {/* Header */}
          <div className="mb-8 pb-6 border-b">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <h1 className="text-3xl font-bold tracking-tight">{client.name}</h1>
                  <Badge variant="secondary" className="text-xs">Cliente</Badge>
                </div>
                {client.company && (
                  <p className="text-muted-foreground flex items-center gap-2 text-sm">
                    <Building className="h-4 w-4" />
                    {client.company}
                  </p>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate("/clients")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
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

          {/* Aba Mensagens - Conversas do WhatsApp */}
          {activeTab === "messages" && (
            <Card className="flex flex-col h-[calc(100vh-200px)]">
              <CardHeader>
                <CardTitle>Mensagens do WhatsApp</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex gap-4 min-h-0 p-4">
                {/* Lista de conversas */}
                <div className="w-80 border-r pr-4 flex flex-col">
                  <div className="mb-4">
                    <h3 className="font-semibold text-sm mb-2">Conversas</h3>
                    {loadingConversations ? (
                      <div className="text-center text-muted-foreground text-sm py-4">
                        <RefreshCw className="h-4 w-4 animate-spin inline-block mr-2" />
                        Carregando...
                      </div>
                    ) : conversations.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Nenhuma conversa encontrada
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-[calc(100vh-350px)] overflow-y-auto">
                        {conversations.map((conv) => (
                          <div
                            key={conv.id}
                            onClick={() => setSelectedConversationId(conv.id)}
                            className={`p-3 rounded-lg cursor-pointer border transition-colors ${
                              selectedConversationId === conv.id
                                ? 'bg-primary/10 border-primary'
                                : 'hover:bg-muted'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                                {(conv.contactName || conv.phoneNumber || '?').charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">
                                  {conv.contactName || conv.profileName || conv.phoneNumber || 'Sem nome'}
                                </p>
                                {conv.lastMessagePreview && (
                                  <p className="text-xs text-muted-foreground truncate">
                                    {conv.lastMessagePreview}
                                  </p>
                                )}
                                {conv.lastMessageAt && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {formatRelativeDate(conv.lastMessageAt)}
                                  </p>
                                )}
                              </div>
                              {conv.unreadCount > 0 && (
                                <Badge variant="default" className="text-xs">
                                  {conv.unreadCount}
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Área de mensagens */}
                <div className="flex-1 flex flex-col min-w-0">
                  {selectedConversationId ? (
                    <>
                      {loadingMessages ? (
                        <div className="flex-1 flex items-center justify-center">
                          <div className="text-center text-muted-foreground">
                            <RefreshCw className="h-4 w-4 animate-spin inline-block mr-2" />
                            Carregando mensagens...
                          </div>
                        </div>
                      ) : messages.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center">
                          <p className="text-muted-foreground text-sm">
                            Nenhuma mensagem disponível
                          </p>
                        </div>
                      ) : (
                        <div className="flex-1 overflow-y-auto space-y-4 p-4">
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
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="text-center text-muted-foreground">
                        <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p className="font-medium">Selecione uma conversa</p>
                        <p className="text-sm mt-2">
                          Escolha uma conversa na lista ao lado para ver as mensagens
                        </p>
                      </div>
                    </div>
                  )}
                </div>
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

