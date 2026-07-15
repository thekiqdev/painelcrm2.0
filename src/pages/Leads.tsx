
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getClientUrl, isValidEntityId } from "@/lib/entityNavigation";
import { pickConvertedClientId } from "@/lib/entity/resolveEntityIdentity";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Trash2,
  Layers,
  UserPlus,
  Phone,
  Target,
  XCircle,
  CheckCircle2,
  KanbanSquare,
  List,
  type LucideIcon,
} from "lucide-react";
import { apiClient } from "@/integrations/api/client";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";
import { z } from "zod";

// Import our refactored components
import LeadHeader from "@/components/leads/LeadHeader";
import LeadListTable from "@/components/leads/LeadListTable";
import LeadMobileCardList from "@/components/leads/LeadMobileCardList";
import LeadKanbanBoard, { type LeadKanbanLead } from "@/components/leads/LeadKanbanBoard";
import LeadAddDialog from "@/components/leads/LeadAddDialog";
import LeadEditDialog from "@/components/leads/LeadEditDialog";
import LeadDetailsDialog from "@/components/leads/LeadDetailsDialog";
import LeadConvertDialog from "@/components/leads/LeadConvertDialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import ProposalCreateForm, {
  type ProposalCreateSuccessPayload,
} from "@/components/proposals/ProposalCreateForm";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  COMMERCIAL_LIST_CONTAINER_CARD,
  COMMERCIAL_SUMMARY_ACTIVE_RING,
  COMMERCIAL_SUMMARY_CARD_CLASS,
  COMMERCIAL_SUMMARY_GRID_6,
  COMMERCIAL_TABLE_DESKTOP_WRAP,
} from "@/lib/commercialListUi";
import { CommercialListingPageShell } from "@/components/listing/CommercialListingPageShell";
import { ScrollArea } from "@/components/ui/scroll-area";
import { prepareLeadsFromCsv, type LeadCsvProfile } from "@/utils/importLeadsCsv";
import { useFloatingChatOptional } from "@/features/floating-chat";
import { scheduleInvalidateFloatingChatAggregates } from "@/features/floating-chat/floatingChatQueries";
import { chatService, type ChatInstance } from "@/services/chat";
import { ensureChatInstances } from "@/features/chat-core/runtime";

// Schemas for form validation
const leadFormSchema = z.object({
  name: z.string().min(2, { message: "Nome é obrigatório" }),
  company: z.string().optional(),
  email: z.string().email({ message: "E-mail inválido" }).optional().or(z.literal("")),
  phone: z.string().optional(),
  status: z.string(),
  source: z.string(),
});

const taskFormSchema = z.object({
  title: z.string().min(3, { message: "Título é obrigatório" }),
  description: z.string().optional(),
  due_date: z.date().optional().nullable(),
  status: z.string(),
});

type LeadFormValues = z.infer<typeof leadFormSchema>;
type TaskFormValues = z.infer<typeof taskFormSchema>;
type LeadViewMode = "list" | "kanban";

const LEAD_VIEW_MODE_STORAGE_KEY = "lead_view_mode";

const DEFAULT_LEAD_STATUSES = [
  { id: "1", name: "Novo", color: "#6E56CF" },
  { id: "2", name: "Em contato", color: "#F59E0B" },
  { id: "3", name: "Qualificado", color: "#10B981" },
  { id: "4", name: "Perdido", color: "#EF4444" },
];

const Leads = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const floatingChat = useFloatingChatOptional();
  const openLeadDeepLinkHandledRef = useRef<string | null>(null);

  const [leadStatuses, setLeadStatuses] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [sortField, setSortField] = useState("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [leadTasks, setLeadTasks] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("summary");
  const [activeStatusFilter, setActiveStatusFilter] = useState("all");
  const [isConvertDialogOpen, setIsConvertDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState<any>(null);
  const [isProposalSheetOpen, setIsProposalSheetOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [viewMode, setViewMode] = useState<LeadViewMode>(() => {
    if (typeof window === "undefined") return "list";
    return window.localStorage.getItem(LEAD_VIEW_MODE_STORAGE_KEY) === "kanban" ? "kanban" : "list";
  });
  const { user } = useAuth();
  const tenantId = user?.tenant_id ?? "";
  const userId = user?.id ?? "";
  const { canCreate } = useModulePermissions();
  const canCreateProposals = canCreate("proposals");
  const canImportLeads = canCreate("leads");

  const leadsCsvInputRef = useRef<HTMLInputElement>(null);
  const [leadsCsvImportRunning, setLeadsCsvImportRunning] = useState(false);
  const [leadsCsvImportDialogOpen, setLeadsCsvImportDialogOpen] = useState(false);
  const [leadsCsvImportSummary, setLeadsCsvImportSummary] = useState<{
    created: number;
    failed: { line: number; message: string }[];
    warnings: string[];
  } | null>(null);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeStatusFilter]);

  const setLeadViewMode = (mode: LeadViewMode) => {
    setViewMode(mode);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LEAD_VIEW_MODE_STORAGE_KEY, mode);
    }
  };

  // Statuses em cache
  const { data: statusesData } = useQuery({
    queryKey: ["leadStatuses", tenantId, userId],
    queryFn: async () => {
      const response = await apiClient.get("/api/lead-statuses");
      if (response.error) throw new Error(response.error);
      const data = response.data || [];
      return data?.length > 0 ? data : DEFAULT_LEAD_STATUSES;
    },
    enabled: !!tenantId && !!userId,
  });
  useEffect(() => {
    setLeadStatuses(statusesData ?? DEFAULT_LEAD_STATUSES);
  }, [statusesData]);

  // Leads em cache – ao voltar na página os dados aparecem na hora
  const { data: leadsData, isPending: leadsLoading } = useQuery({
    queryKey: ["leads", tenantId, userId, sortField, sortDirection, activeStatusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (activeStatusFilter === "convertidos") {
        params.set("onlyConverted", "true");
      }
      const qs = params.toString();
      const response = await apiClient.get(qs ? `/api/leads?${qs}` : "/api/leads");
      if (response.error) throw new Error(response.error);
      let data = response.data || [];
      data = [...data].sort((a: any, b: any) => {
        if (sortField === "updated_at") {
          const ta = new Date(a.updated_at || 0).getTime();
          const tb = new Date(b.updated_at || 0).getTime();
          return sortDirection === "asc" ? ta - tb : tb - ta;
        }
        const aVal = a[sortField] || "";
        const bVal = b[sortField] || "";
        if (sortDirection === "asc") return aVal > bVal ? 1 : -1;
        return aVal < bVal ? 1 : -1;
      });
      return data;
    },
    enabled: !!tenantId && !!userId,
  });
  const leads = leadsData ?? [];
  const fetchLeads = () =>
    queryClient.invalidateQueries({ queryKey: ["leads", tenantId, userId] });

  const openLeadIdParam = searchParams.get("openLeadId")?.trim() ?? "";

  useEffect(() => {
    if (!openLeadIdParam || !isValidEntityId(openLeadIdParam)) {
      openLeadDeepLinkHandledRef.current = null;
      return;
    }
    if (!tenantId || !userId) return;
    if (openLeadDeepLinkHandledRef.current === openLeadIdParam) return;

    const openLeadFromDeepLink = async () => {
      const fromList = leads.find((l: { id?: string }) => String(l.id) === openLeadIdParam);
      let leadToOpen = fromList;
      if (!leadToOpen) {
        if (leadsLoading) return;
        const response = await apiClient.get(`/api/leads/${openLeadIdParam}`);
        if (response.error || !response.data) {
          toast.error("Lead não encontrado");
          openLeadDeepLinkHandledRef.current = openLeadIdParam;
          return;
        }
        leadToOpen = response.data;
      }

      openLeadDeepLinkHandledRef.current = openLeadIdParam;

      const convertedClientId = pickConvertedClientId(leadToOpen);
      if (convertedClientId) {
        navigate(getClientUrl(convertedClientId), { replace: true });
        return;
      }

      try {
        const response = await apiClient.get(`/api/leads/${leadToOpen.id}`);
        const fullLead = !response.error && response.data ? response.data : leadToOpen;
        const convertedAfterFetch = pickConvertedClientId(fullLead);
        if (convertedAfterFetch) {
          navigate(getClientUrl(convertedAfterFetch), { replace: true });
          return;
        }
        setSelectedLead(fullLead);
      } catch {
        setSelectedLead(leadToOpen);
      }
      setIsViewDialogOpen(true);
      setActiveTab("summary");
      await fetchLeadTasks(leadToOpen.id);
    };

    void openLeadFromDeepLink();
  }, [openLeadIdParam, leads, leadsLoading, tenantId, userId]);

  const isConnectedChatInstance = (instance: ChatInstance): boolean => {
    const status = String(instance.status || "").toLowerCase();
    const enabled = instance.metadata?.enabled_in_chat !== false;
    return enabled && Boolean(instance.can_operate ?? true) && (status === "connected" || status === "open");
  };

  // Fetch tasks for a selected lead
  const fetchLeadTasks = async (leadId: string) => {
    if (!user) return;
    
    try {
      const response = await apiClient.get(`/api/lead-tasks/leads/${leadId}/tasks`);
      if (response.error) throw new Error(response.error);
      setLeadTasks(response.data || []);
    } catch (error: any) {
      console.error("Erro ao buscar tarefas:", error.message);
      toast.error("Não foi possível carregar as tarefas");
    }
  };

  // Handle sorting of leads
  const handleSort = (field: string) => {
    if (field === sortField) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Filter leads by status and search term
  const getFilteredLeads = () => {
    return leads.filter((lead) => {
      const st = (lead.status || "").toLowerCase();
      let statusMatches = false;
      if (activeStatusFilter === "all") {
        statusMatches = true;
      } else if (activeStatusFilter === "convertidos") {
        statusMatches = st === "convertido";
      } else {
        statusMatches = st === activeStatusFilter;
      }

      const searchMatches = 
        lead.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (lead.company && lead.company.toLowerCase().includes(searchTerm.toLowerCase())) || 
        (lead.email && lead.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (lead.phone && lead.phone.includes(searchTerm));
        
      return statusMatches && searchMatches;
    });
  };

  // View lead details — alinhar ao perfil do cliente: carregar GET /api/leads/:id para whatsapp_avatar_url atualizado
  const handleViewLead = async (lead: any) => {
    try {
      const response = await apiClient.get(`/api/leads/${lead.id}`);
      if (!response.error && response.data) {
        setSelectedLead(response.data);
      } else {
        setSelectedLead(lead);
      }
    } catch {
      setSelectedLead(lead);
    }
    setIsViewDialogOpen(true);
    setActiveTab("summary");
    await fetchLeadTasks(lead.id);
  };

  const openLeadConversation = async (lead: LeadKanbanLead) => {
    try {
      const existing = await floatingChat?.openChatForLead(lead.id, { createIfMissing: true });
      if (existing) return;

      if (!lead.phone?.trim()) {
        toast.info("Este lead ainda não possui telefone para iniciar conversa.");
        return;
      }

      const instances = (await ensureChatInstances({ reason: "bootstrap" })).filter(isConnectedChatInstance);
      const firstInstance = instances[0];
      if (!firstInstance) {
        toast.info("Conecte uma instância WhatsApp para iniciar conversa com este lead.");
        return;
      }

      const prepared = await chatService.prepareLeadConversation({
        lead_id: lead.id,
        instance_id: firstInstance.id,
      });
      if (floatingChat) {
        floatingChat.openConversationInContext(prepared.conversation.id);
      } else {
        window.dispatchEvent(
          new CustomEvent("painelcrm:floating-chat-open", {
            detail: { conversationId: prepared.conversation.id, source: "lead_kanban_card" },
          }),
        );
      }
      void scheduleInvalidateFloatingChatAggregates(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["leads", tenantId, userId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível abrir a conversa do lead");
    }
  };

  // Edit lead
  const handleEditLead = (lead: any) => {
    setSelectedLead(lead);
    setIsEditDialogOpen(true);
  };

  // Save edited lead
  const handleSaveEdit = async (values: LeadFormValues) => {
    if (!selectedLead || !user) return;

    try {
      const leadData = {
        ...values,
        company: values.company || null,
        email: values.email || null,
        phone: values.phone || null,
      };

      const response = await apiClient.patch(`/api/leads/${selectedLead.id}`, leadData);
      if (response.error) throw new Error(response.error);

      toast.success("Lead atualizado com sucesso!");
      setIsEditDialogOpen(false);

      if (response.data) {
        if (isViewDialogOpen && selectedLead) {
          setSelectedLead(response.data);
        }
      }

      fetchLeads();
    } catch (error: any) {
      console.error("Erro ao atualizar lead:", error.message);
      toast.error("Não foi possível atualizar o lead");
    }
  };

  // Add new lead
  const handleAddLead = async (values: LeadFormValues) => {
    try {
      // Clean up the data - remove empty strings and convert to null/undefined
      const leadData: any = {
        name: values.name,
      };
      
      // Only include fields that have values
      if (values.company && values.company.trim()) {
        leadData.company = values.company.trim();
      }
      
      if (values.email && values.email.trim()) {
        leadData.email = values.email.trim();
      }
      
      if (values.phone && values.phone.trim()) {
        leadData.phone = values.phone.trim();
      }
      
      if (values.status && values.status.trim()) {
        leadData.status = values.status.trim();
      }
      
      // Source is required, use default if empty
      if (values.source && values.source.trim()) {
        leadData.source = values.source.trim();
      } else {
        leadData.source = "Outros"; // Default source
      }
      
      const response = await apiClient.post("/api/leads", leadData);
      if (response.error) throw new Error(response.error);

      toast.success("Lead adicionado com sucesso!");
      setIsAddDialogOpen(false);
      fetchLeads();
    } catch (error: any) {
      console.error("Erro ao adicionar lead:", error);
      const errorMessage = error.response?.data?.details 
        ? JSON.stringify(error.response.data.details)
        : error.message || "Não foi possível adicionar o lead";
      toast.error(`Erro ao adicionar lead: ${errorMessage}`);
    }
  };

  // Delete lead
  const confirmDeleteLead = (lead: any) => {
    setLeadToDelete(lead);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteLead = async () => {
    if (!leadToDelete) return;
    
    try {
      const response = await apiClient.delete(`/api/leads/${leadToDelete.id}`);
      if (response.error) throw new Error(response.error);

      queryClient.invalidateQueries({ queryKey: ["leads", tenantId, userId] });
      // If the deleted lead was selected, clear selection
      if (selectedLead && selectedLead.id === leadToDelete.id) {
        setSelectedLead(null);
        setIsViewDialogOpen(false);
      }
      
      setIsDeleteDialogOpen(false);
      setLeadToDelete(null);
      toast.success("Lead excluído com sucesso!");
    } catch (error: any) {
      console.error("Erro ao excluir lead:", error);
      toast.error(error.message || "Não foi possível excluir o lead");
    }
  };

  // Add task to lead
  const handleAddTask = async (values: TaskFormValues) => {
    if (!selectedLead || !user) return;
    
    try {
      const taskData: Record<string, unknown> = {
        lead_id: selectedLead.id,
        title: values.title.trim(),
        status: values.status || "pending",
      };

      const description = values.description?.trim();
      if (description) {
        taskData.description = description;
      }
      if (values.due_date) {
        taskData.due_date = values.due_date.toISOString();
      }
      
      const response = await apiClient.post("/api/lead-tasks", taskData);
      if (response.error) throw new Error(response.error);

      toast.success("Tarefa adicionada com sucesso!");
      await fetchLeadTasks(selectedLead.id);
      setActiveTab("tasks");
    } catch (error: any) {
      console.error("Erro ao adicionar tarefa:", error.message);
      toast.error(error?.message || "Não foi possível adicionar a tarefa");
    }
  };

  const handleSaveStickyNotesJson = async (notesJson: string) => {
    if (!selectedLead || !user) return;

    try {
      const response = await apiClient.patch(`/api/leads/${selectedLead.id}`, { notes: notesJson });
      if (response.error) throw new Error(response.error);

      toast.success("Notas salvas com sucesso!");
      const next = response.data ?? { ...selectedLead, notes: notesJson };
      setSelectedLead(next);
      fetchLeads();
    } catch (error: any) {
      console.error("Erro ao salvar notas:", error.message);
      toast.error("Não foi possível salvar as notas");
    }
  };

  // Convert lead to client
  const handleConvertToClient = async () => {
    if (!selectedLead || !user) return;

    try {
      // Create client from lead data using clients-helpers
      const { addClient, addClientTask } = await import("@/utils/clients-helpers");
      const clientResult = await addClient({
        name: selectedLead.name,
        company: selectedLead.company || undefined,
        email: selectedLead.email || undefined,
        phone: selectedLead.phone || undefined,
        notes: selectedLead.notes || undefined,
        status: "Ativo"
      });
      
      if (!clientResult.success || !clientResult.data) {
        throw new Error("Erro ao criar cliente");
      }

      const newClient = clientResult.data;

      // Transfer lead tasks to client
      if (leadTasks.length > 0 && newClient.id) {
        for (const task of leadTasks) {
          await addClientTask({
            client_id: newClient.id,
            title: task.title,
            description: task.description || undefined,
            due_date: task.due_date || undefined,
            status: task.status || "pending"
          });
        }
      }

      // Marcar convertido + migrar conversas para o cliente criado (foto WhatsApp no perfil)
      await apiClient.patch(`/api/leads/${selectedLead.id}`, {
        status: "Convertido",
        migrated_client_id: newClient.id,
      });

      toast.success("Lead convertido para cliente com sucesso!");
      setIsConvertDialogOpen(false);
      setIsViewDialogOpen(false);
      fetchLeads();
      void queryClient.invalidateQueries({ queryKey: ["clients", "list", tenantId, userId] });
    } catch (error: any) {
      console.error("Erro ao converter lead:", error.message);
      toast.error("Não foi possível converter o lead para cliente");
    }
  };

  // Update task status
  const updateTaskStatus = async (taskId: string, newStatus: string) => {
    if (!user) return;
    
    try {
      const response = await apiClient.patch(`/api/lead-tasks/${taskId}`, { status: newStatus });
      if (response.error) throw new Error(response.error);

      toast.success("Status atualizado com sucesso!");
      if (selectedLead) {
        fetchLeadTasks(selectedLead.id);
      }
    } catch (error: any) {
      console.error("Erro ao atualizar status:", error.message);
      toast.error("Não foi possível atualizar o status");
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!user) return;

    try {
      const response = await apiClient.delete(`/api/lead-tasks/${taskId}`);
      if (response.error) throw new Error(response.error);

      toast.success("Tarefa excluída com sucesso!");
      if (selectedLead) {
        fetchLeadTasks(selectedLead.id);
      }
    } catch (error: any) {
      console.error("Erro ao excluir tarefa:", error.message);
      toast.error("Não foi possível excluir a tarefa");
    }
  };

  // Get status color variant
  const getStatusVariant = (status: string) => {
    const foundStatus = leadStatuses.find(s => s.name === status);
    return foundStatus ? { color: foundStatus.color } : { color: "#6E56CF" };
  };


  const filteredLeads = getFilteredLeads();

  type MetricFilter = "all" | "novo" | "em contato" | "qualificado" | "perdido" | "convertidos";

  const funnelMetrics = useMemo(() => {
    const sc = (label: string) =>
      leads.filter((l: any) => (l.status || "").toLowerCase() === label.toLowerCase()).length;
    const rows: {
      key: string;
      label: string;
      hint: string;
      value: number;
      filter: MetricFilter;
      Icon: LucideIcon;
    }[] = [
      {
        key: "total",
        label: "Total",
        hint: "Todos os estágios nesta base",
        value: leads.length,
        filter: "all",
        Icon: Layers,
      },
      {
        key: "novo",
        label: "Novos",
        hint: "Primeiro contacto",
        value: sc("novo"),
        filter: "novo",
        Icon: UserPlus,
      },
      {
        key: "em",
        label: "Em contato",
        hint: "Qualificação em curso",
        value: sc("em contato"),
        filter: "em contato",
        Icon: Phone,
      },
      {
        key: "qual",
        label: "Qualificados",
        hint: "Prontos para avançar",
        value: sc("qualificado"),
        filter: "qualificado",
        Icon: Target,
      },
      {
        key: "perd",
        label: "Perdidos",
        hint: "Arquivados neste funil",
        value: sc("perdido"),
        filter: "perdido",
        Icon: XCircle,
      },
      {
        key: "conv",
        label: "Convertidos",
        hint: "Já viraram cliente",
        value: sc("convertido"),
        filter: "convertidos",
        Icon: CheckCircle2,
      },
    ];
    return rows;
  }, [leads]);

  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / itemsPerPage));
  const paginatedLeads = filteredLeads.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const openProposalForLead = (lead: any) => {
    setSelectedLead(lead);
    setIsProposalSheetOpen(true);
  };

  const handleLeadKanbanQuickAction = (lead: LeadKanbanLead, action: "conversation" | "task" | "agenda" | "proposal") => {
    if (action === "conversation") {
      void openLeadConversation(lead);
      return;
    }
    if (action === "task") {
      void handleViewLead(lead);
      setActiveTab("tasks");
      return;
    }
    if (action === "agenda") {
      const params = new URLSearchParams({
        new: "1",
        lead_id: lead.id,
        title: lead.name ? `Contato com ${lead.name}` : "Contato com lead",
      });
      navigate(`/agenda?${params.toString()}`);
      return;
    }
    openProposalForLead(lead);
  };

  const handleLeadKanbanStatusChange = async (lead: LeadKanbanLead, nextStatus: string) => {
    const previousLead = { ...lead };
    const querySnapshots = queryClient.getQueriesData<any[]>({ queryKey: ["leads", tenantId, userId] });
    const applyStatus = (rows: any[] | undefined) =>
      Array.isArray(rows) ? rows.map((row) => (row?.id === lead.id ? { ...row, status: nextStatus, updated_at: new Date().toISOString() } : row)) : rows;

    queryClient.setQueriesData<any[]>({ queryKey: ["leads", tenantId, userId] }, applyStatus);
    setSelectedLead((prev: any) => (prev?.id === lead.id ? { ...prev, status: nextStatus, updated_at: new Date().toISOString() } : prev));

    try {
      const response = await apiClient.patch(`/api/leads/${lead.id}`, { status: nextStatus });
      if (response.error) throw new Error(response.error);
      if (response.data) {
        queryClient.setQueriesData<any[]>({ queryKey: ["leads", tenantId, userId] }, (rows) =>
          Array.isArray(rows) ? rows.map((row) => (row?.id === lead.id ? { ...row, ...response.data } : row)) : rows,
        );
        setSelectedLead((prev: any) => (prev?.id === lead.id ? { ...prev, ...response.data } : prev));
      }
      toast.success(`Lead movido para ${nextStatus}.`);
    } catch (error) {
      for (const [key, data] of querySnapshots) {
        queryClient.setQueryData(key, data);
      }
      setSelectedLead((prev: any) => (prev?.id === lead.id ? previousLead : prev));
      toast.error(error instanceof Error ? error.message : "Não foi possível mover o lead");
      throw error;
    }
  };

  const handleLeadsCsvChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !canImportLeads) return;

    setLeadsCsvImportRunning(true);
    try {
      const text = await file.text();
      const profilesRes = await apiClient.get<LeadCsvProfile[]>("/api/user-profiles");
      if (profilesRes.error) throw new Error(profilesRes.error);
      const profiles = profilesRes.data ?? [];

      const { prepared, skipped } = prepareLeadsFromCsv(text, profiles);
      const failed: { line: number; message: string }[] = skipped.map((s) => ({
        line: s.line,
        message: s.reason,
      }));
      const warnings: string[] = [];
      let created = 0;
      const BATCH = 4;

      for (let i = 0; i < prepared.length; i += BATCH) {
        const chunk = prepared.slice(i, i + BATCH);
        await Promise.all(
          chunk.map(async (row) => {
            try {
              if (row.warn) warnings.push(`Linha ${row.lineNumber}: ${row.warn}`);
              const p = row.payload;
              const leadData: Record<string, unknown> = {
                name: p.name,
                source: p.source || "Importação CSV",
              };
              if (p.email) leadData.email = p.email;
              if (p.phone) leadData.phone = p.phone;
              if (p.company) leadData.company = p.company;
              if (p.status) leadData.status = p.status;
              if (p.notes) leadData.notes = p.notes;
              if (p.profile_id) leadData.profile_id = p.profile_id;

              const response = await apiClient.post("/api/leads", leadData);
              if (response.error) throw new Error(response.error);
              created++;
            } catch (err) {
              failed.push({
                line: row.lineNumber,
                message: err instanceof Error ? err.message : "Erro ao criar lead",
              });
            }
          }),
        );
      }

      await queryClient.invalidateQueries({ queryKey: ["leads", tenantId, userId] });
      setLeadsCsvImportSummary({ created, failed, warnings });

      if (failed.length > 0 || warnings.length > 0 || created === 0) {
        setLeadsCsvImportDialogOpen(true);
      }

      if (created > 0 && failed.length === 0) {
        toast.success(`${created} lead${created === 1 ? "" : "s"} importado${created === 1 ? "" : "s"}.`);
      } else if (created > 0) {
        toast.warning(`${created} criado(s); há falhas ou avisos — ver relatório.`);
      } else if (skipped.length > 0 || failed.length > 0) {
        toast.error("Nenhum lead criado ou arquivo inválido.");
      } else {
        toast.message("Nenhuma linha válida para importar.");
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Falha ao ler o CSV.");
    } finally {
      setLeadsCsvImportRunning(false);
    }
  };

  const handleProposalCreatedFromLead = (_created: ProposalCreateSuccessPayload, mode: "sent" | "draft") => {
    toast.success(mode === "draft" ? "Rascunho salvo." : "Proposta criada.");
    setIsProposalSheetOpen(false);
    void queryClient.invalidateQueries({ queryKey: ["proposals"] });
    fetchLeads();
  };

  const metricCardActive = (filter: MetricFilter) =>
    (filter === "all" && activeStatusFilter === "all") || activeStatusFilter === filter;

  return (
    <CommercialListingPageShell>
      <input
        ref={leadsCsvInputRef}
        type="file"
        accept=".csv,text/csv,.txt"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={handleLeadsCsvChange}
      />
      <LeadHeader
        searchTerm={searchTerm}
        onSearchChange={(e) => setSearchTerm(e.target.value)}
        onAddClick={() => setIsAddDialogOpen(true)}
        canImport={canImportLeads}
        importRunning={leadsCsvImportRunning}
        onImportClick={() => leadsCsvInputRef.current?.click()}
      />

      <div className={COMMERCIAL_SUMMARY_GRID_6}>
        {funnelMetrics.map((m) => {
          const Icon = m.Icon;
          const active = metricCardActive(m.filter);
          return (
            <Card
              key={m.key}
              role="button"
              tabIndex={0}
              className={cn(
                COMMERCIAL_SUMMARY_CARD_CLASS,
                active && COMMERCIAL_SUMMARY_ACTIVE_RING,
              )}
              onClick={() => {
                setActiveStatusFilter(m.filter);
                setCurrentPage(1);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setActiveStatusFilter(m.filter);
                  setCurrentPage(1);
                }
              }}
            >
              <CardContent className="p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-muted-foreground">{m.label}</p>
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground opacity-80" aria-hidden />
                </div>
                <p className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight">{m.value}</p>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{m.hint}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className={COMMERCIAL_LIST_CONTAINER_CARD}>
        <CardHeader className="flex flex-col gap-2 border-b border-border/50 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg font-semibold tracking-tight">
              {viewMode === "kanban" ? "Kanban de leads" : "Lista de leads"}
            </CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {filteredLeads.length === 0
                ? "Nenhum resultado"
                : viewMode === "kanban"
                  ? `${filteredLeads.length} lead${filteredLeads.length === 1 ? "" : "s"} neste quadro`
                  : `Mostrando ${paginatedLeads.length} de ${filteredLeads.length} neste filtro`}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="inline-flex rounded-lg border border-border/70 bg-muted/30 p-1">
              <Button
                type="button"
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 gap-1.5 px-2.5 text-xs sm:text-sm"
                onClick={() => setLeadViewMode("list")}
              >
                <List className="h-3.5 w-3.5" aria-hidden />
                Lista
              </Button>
              <Button
                type="button"
                variant={viewMode === "kanban" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 gap-1.5 px-2.5 text-xs sm:text-sm"
                onClick={() => setLeadViewMode("kanban")}
              >
                <KanbanSquare className="h-3.5 w-3.5" aria-hidden />
                Kanban
              </Button>
            </div>
            {viewMode === "list" ? (
              <div className="flex items-center gap-2">
                <span className="hidden text-sm text-muted-foreground sm:inline">Por página</span>
                <Select
                  value={String(itemsPerPage)}
                  onValueChange={(v) => {
                    setItemsPerPage(Number(v));
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="h-10 w-[88px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 25, 50].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {viewMode === "kanban" ? (
            <LeadKanbanBoard
              leads={filteredLeads as LeadKanbanLead[]}
              statuses={leadStatuses}
              loading={leadsLoading}
              getStatusVariant={getStatusVariant}
              onOpenLead={handleViewLead}
              onStatusChange={handleLeadKanbanStatusChange}
              onQuickAction={handleLeadKanbanQuickAction}
              canCreateProposal={canCreateProposals}
            />
          ) : (
            <>
              <div className={COMMERCIAL_TABLE_DESKTOP_WRAP}>
                <LeadListTable
                  leads={paginatedLeads}
                  sortField={sortField}
                  sortDirection={sortDirection}
                  handleSort={handleSort}
                  handleViewLead={handleViewLead}
                  handleEditLead={handleEditLead}
                  getStatusVariant={getStatusVariant}
                  onSelectLeadForTasks={(lead) => {
                    handleViewLead(lead);
                    setActiveTab("tasks");
                  }}
                  onSelectLeadForConversion={(lead) => {
                    setSelectedLead(lead);
                    fetchLeadTasks(lead.id);
                    setIsConvertDialogOpen(true);
                  }}
                  onDeleteLead={confirmDeleteLead}
                />
              </div>

              <LeadMobileCardList
                leads={paginatedLeads as any}
                getStatusVariant={getStatusVariant}
                onView={handleViewLead}
                onEdit={handleEditLead}
                onTasks={(lead) => {
                  handleViewLead(lead);
                  setActiveTab("tasks");
                }}
                onConvert={(lead) => {
                  setSelectedLead(lead);
                  void fetchLeadTasks(lead.id);
                  setIsConvertDialogOpen(true);
                }}
                onProposal={openProposalForLead}
                onDelete={confirmDeleteLead}
                canProposal={canCreateProposals}
              />

              {filteredLeads.length > 0 ? (
                <div className="mt-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-center text-xs text-muted-foreground sm:text-left">
                    Página {currentPage} de {totalPages}
                  </p>
                  <Pagination className="justify-center sm:justify-end">
                    <PaginationContent className="flex-wrap gap-1">
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                          className={
                            currentPage <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"
                          }
                          aria-disabled={currentPage <= 1}
                        />
                      </PaginationItem>
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter((p) => {
                          if (totalPages <= 5) return true;
                          if (p === 1 || p === totalPages) return true;
                          return Math.abs(p - currentPage) <= 1;
                        })
                        .flatMap((p, idx, arr) => {
                          const prev = arr[idx - 1];
                          const showEllipsis = Boolean(prev && p - prev > 1);
                          const items: React.ReactElement[] = [];
                          if (showEllipsis) {
                            items.push(
                              <PaginationItem key={`ellipsis-${p}`}>
                                <PaginationEllipsis />
                              </PaginationItem>
                            );
                          }
                          items.push(
                            <PaginationItem key={p}>
                              <PaginationLink
                                isActive={currentPage === p}
                                onClick={() => setCurrentPage(p)}
                                className="cursor-pointer"
                              >
                                {p}
                              </PaginationLink>
                            </PaginationItem>
                          );
                          return items;
                        })}
                      <PaginationItem>
                        <PaginationNext
                          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                          className={
                            currentPage >= totalPages
                              ? "pointer-events-none opacity-50"
                              : "cursor-pointer"
                          }
                          aria-disabled={currentPage >= totalPages}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <LeadAddDialog 
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onSave={handleAddLead}
        leadStatuses={leadStatuses}
      />

      <LeadEditDialog 
        isOpen={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        onSave={handleSaveEdit}
        lead={selectedLead}
        leadStatuses={leadStatuses}
      />

      <LeadDetailsDialog 
        isOpen={isViewDialogOpen}
        onClose={() => setIsViewDialogOpen(false)}
        lead={selectedLead}
        tasks={leadTasks}
        getStatusVariant={getStatusVariant}
        onEditLead={handleEditLead}
        onTabChange={setActiveTab}
        activeTab={activeTab}
        onConvertToClient={() => setIsConvertDialogOpen(true)}
        onAddTask={handleAddTask}
        onUpdateTaskStatus={updateTaskStatus}
        onDeleteTask={handleDeleteTask}
        onSaveStickyNotesJson={handleSaveStickyNotesJson}
        onOpenProposalCreate={() => setIsProposalSheetOpen(true)}
      />

      <Sheet open={isProposalSheetOpen} onOpenChange={setIsProposalSheetOpen}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-lg md:max-w-2xl lg:max-w-3xl"
        >
          <SheetHeader>
            <SheetTitle>Nova proposta</SheetTitle>
            <SheetDescription>
              Mesmo fluxo do chat: com lead não convertido a proposta fica vinculada ao lead; após conversão, use o
              cliente CRM para faturamento.
            </SheetDescription>
          </SheetHeader>
          {selectedLead ? (
            <div className="mt-4">
              <ProposalCreateForm
                key={selectedLead.id}
                embedded
                initialClientId={selectedLead.migrated_client_id ?? null}
                initialLeadId={selectedLead.migrated_client_id ? null : selectedLead.id}
                initialLeadName={selectedLead.name ?? null}
                initialTitle={
                  selectedLead.name ? `Proposta — ${selectedLead.name}` : ""
                }
                onBack={() => setIsProposalSheetOpen(false)}
                onCreated={handleProposalCreatedFromLead}
              />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <LeadConvertDialog 
        isOpen={isConvertDialogOpen}
        onClose={() => setIsConvertDialogOpen(false)}
        onConvert={handleConvertToClient}
        lead={selectedLead}
        taskCount={leadTasks.length}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir o lead <strong>{leadToDelete?.name}</strong>?
              <br />
              <span className="text-destructive">Esta ação não pode ser desfeita.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsDeleteDialogOpen(false);
                setLeadToDelete(null);
              }}
            >
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteLead}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={leadsCsvImportDialogOpen} onOpenChange={setLeadsCsvImportDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importação de leads (CSV)</DialogTitle>
            <DialogDescription>Resumo do ficheiro enviado.</DialogDescription>
          </DialogHeader>
          {leadsCsvImportSummary ? (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">{leadsCsvImportSummary.created}</span> lead(s) criado(s).
              </p>
              {leadsCsvImportSummary.warnings.length > 0 ? (
                <div>
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-200">Avisos</p>
                  <ScrollArea className="mt-1 h-[220px] rounded-md border p-3 sm:h-[260px]">
                    <ul className="list-inside list-disc space-y-1 pr-3 text-xs text-muted-foreground">
                      {leadsCsvImportSummary.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </ScrollArea>
                </div>
              ) : null}
              {leadsCsvImportSummary.failed.length > 0 ? (
                <ScrollArea className="h-[200px] rounded-md border p-3">
                  <ul className="space-y-1.5 text-xs">
                    {leadsCsvImportSummary.failed.map((f, i) => (
                      <li key={`${f.line}-${i}`}>
                        Linha {f.line}: {f.message}
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" onClick={() => setLeadsCsvImportDialogOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CommercialListingPageShell>
  );
};

export default Leads;
