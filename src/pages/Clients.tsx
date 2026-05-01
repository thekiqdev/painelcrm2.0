import React, { useState, useEffect, useLayoutEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams, useLocation, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import {
  Search,
  Plus,
  FileText,
  MoreVertical,
  UserPlus,
  ArrowDown,
  ArrowUp,
  Filter,
  CalendarIcon,
  Trash2,
  RefreshCw,
  MessageCircle,
  CreditCard,
  Building2,
  Layers,
  CheckCircle2,
  Ban,
  Eye,
  Receipt,
  CalendarSync,
  FileSignature,
  Pencil,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { clientsService } from "@/services/clients";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { format } from "date-fns";
import { formatDateOnlyPtBr } from "@/utils/formatCalendarDate";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { withUserId } from "@/utils/auth-helpers";
import { addClient, addClientTask } from "@/utils/clients-helpers";
import { formatCpfCnpjDisplay } from "@/utils/cpfCnpj";
import { resolveProfileAvatarUrl } from "@/utils/chatIdentityDisplay";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StickyNote, StickyNoteData } from "@/components/clients/StickyNote";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { proposalsService, type Proposal } from "@/services/proposals";
import { applyUrlPatch } from "@/lib/listFiltersUrl";
import { cn } from "@/lib/utils";
import {
  COMMERCIAL_FILTERS_PANEL,
  COMMERCIAL_LIST_CONTAINER_CARD,
  COMMERCIAL_SUMMARY_ACTIVE_RING,
  COMMERCIAL_SUMMARY_CARD_CLASS,
  COMMERCIAL_SUMMARY_GRID_3,
  COMMERCIAL_TABLE_DESKTOP_WRAP,
} from "@/lib/commercialListUi";
import { CommercialListingPageShell } from "@/components/listing/CommercialListingPageShell";
import { CommercialListingPageHeader } from "@/components/listing/CommercialListingPageHeader";
import { MobileClientsSearchSheet } from "@/components/clients/MobileClientsSearchSheet";
import { useFloatingChat } from "@/features/floating-chat";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import {
  appendClientsListReturnPath,
  consumeClientsListScrollPosition,
  saveClientsListScrollPosition,
} from "@/lib/clientsListRestore";

// Opções para quantidade de itens por página
const itemsPerPageOptions = [10, 25, 50, 100];

const CLIENT_SORT_WHITELIST = new Set(["name", "company", "email", "phone", "status", "group"]);

// Schema de validação para as tarefas
const taskSchema = z.object({
  title: z.string().min(3, "Título deve ter pelo menos 3 caracteres"),
  description: z.string().optional(),
  due_date: z.date().optional(),
  status: z.string().default("Pendente"),
});

const MODULE_CLIENTS = 'clients';

const CLIENTS_QUERY_KEY = ["clients", "list"] as const;

const DIALOG_PROPOSAL_STATUS_LABELS: Record<Proposal["status"], string> = {
  draft: "Rascunho",
  sent: "Enviada",
  accepted: "Aceita",
  rejected: "Recusada",
  expired: "Expirada",
  invoiced: "Faturada",
};

const DIALOG_PROPOSAL_STATUS_CLASS: Record<Proposal["status"], string> = {
  draft: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100",
  sent: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-100",
  accepted: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-100",
  rejected: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-100",
  expired: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-100",
  invoiced: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-100",
};

function dialogClientProposalCode(id: string): string {
  return `PROP-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function formatDialogProposalCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

/** Resumo de observação em texto simples (ignora JSON de notas adesivas). */
function clientNotesPreview(raw: unknown, maxLen = 72): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (s.startsWith("[") || s.startsWith("{")) return null;
  const oneLine = s.replace(/\s+/g, " ");
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen).trimEnd()}…`;
}

const Clients = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const clientsListHref = `${location.pathname}${location.search}`;
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { canCreate, canEdit, canDelete, canView } = useModulePermissions();
  const hasChat = useFeatureFlag("chat");
  const floatingChat = useFloatingChat();
  const [clients, setClients] = useState<any[]>([]);
  const [clientGroups, setClientGroups] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get("q") ?? "");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [sortField, setSortField] = useState(() => {
    const s = searchParams.get("sort");
    return s && CLIENT_SORT_WHITELIST.has(s) ? s : "name";
  });
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(() =>
    searchParams.get("dir") === "desc" ? "desc" : "asc",
  );
  const [activeTab, setActiveTab] = useState(() => {
    const t = searchParams.get("tab");
    return t === "active" || t === "inactive" ? t : "all";
  });
  const [currentPage, setCurrentPage] = useState(() => {
    const p = parseInt(searchParams.get("page") || "1", 10);
    return Number.isFinite(p) && p > 0 ? p : 1;
  });
  const [selectedGroup, setSelectedGroup] = useState<string | null>(() => searchParams.get("group"));
  const [newClientGroup, setNewClientGroup] = useState("");
  const [itemsPerPage, setItemsPerPage] = useState(() => {
    const per = parseInt(searchParams.get("per") || "10", 10);
    return itemsPerPageOptions.includes(per) ? per : 10;
  });
  const [notes, setNotes] = useState<StickyNoteData[]>([]);
  const [clientTasks, setClientTasks] = useState<any[]>([]);
  const [isAddTaskDialogOpen, setIsAddTaskDialogOpen] = useState(false);
  const [tabSelected, setTabSelected] = useState("details");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<any>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [dialogProposals, setDialogProposals] = useState<Proposal[]>([]);
  const [dialogProposalsLoading, setDialogProposalsLoading] = useState(false);

  const dialogProposalStats = useMemo(() => {
    const pending = dialogProposals.filter((p) => p.status === "draft" || p.status === "sent").length;
    const acceptedRows = dialogProposals.filter((p) => p.status === "accepted" || p.status === "invoiced");
    const acceptedCount = acceptedRows.length;
    const acceptedTotal = acceptedRows.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const totalCount = dialogProposals.length;
    return { pending, acceptedCount, acceptedTotal, totalCount };
  }, [dialogProposals]);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setIsAddDialogOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("new");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Hidratar filtros a partir da URL (voltar do detalhe, link partilhado).
  useEffect(() => {
    const q = searchParams.get("q") ?? "";
    const tabRaw = searchParams.get("tab");
    const tab = tabRaw === "active" || tabRaw === "inactive" ? tabRaw : "all";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const perRaw = parseInt(searchParams.get("per") || "10", 10);
    const per = itemsPerPageOptions.includes(perRaw) ? perRaw : 10;
    const groupRaw = searchParams.get("group");
    const group = groupRaw && groupRaw.length > 0 ? groupRaw : null;
    const sRaw = searchParams.get("sort");
    const sort = sRaw && CLIENT_SORT_WHITELIST.has(sRaw) ? sRaw : "name";
    const dir: "asc" | "desc" = searchParams.get("dir") === "desc" ? "desc" : "asc";

    setSearchTerm((prev) => (prev !== q ? q : prev));
    setActiveTab((prev) => (prev !== tab ? tab : prev));
    setCurrentPage((prev) => (prev !== page ? page : prev));
    setItemsPerPage((prev) => (prev !== per ? per : prev));
    setSelectedGroup((prev) => (prev !== group ? group : prev));
    setSortField((prev) => (prev !== sort ? sort : prev));
    setSortDirection((prev) => (prev !== dir ? dir : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intencional: só reagir a mudanças na URL
  }, [searchParams]);

  // Persistir filtros na URL (substitui entrada atual para não poluir histórico).
  useEffect(() => {
    setSearchParams(
      (prev) =>
        applyUrlPatch(prev, {
          q: searchTerm.trim() || null,
          tab: activeTab === "all" ? null : activeTab,
          group: selectedGroup || null,
          page: currentPage > 1 ? currentPage : null,
          per: itemsPerPage !== 10 ? itemsPerPage : null,
          sort: sortField !== "name" ? sortField : null,
          dir: sortDirection !== "asc" ? sortDirection : null,
        }),
      { replace: true },
    );
  }, [
    searchTerm,
    activeTab,
    selectedGroup,
    currentPage,
    itemsPerPage,
    sortField,
    sortDirection,
    setSearchParams,
  ]);

  useEffect(() => {
    if (!isViewDialogOpen || !selectedClient?.id || tabSelected !== "opportunities" || !canView("proposals")) {
      return;
    }
    let cancelled = false;
    setDialogProposalsLoading(true);
    void proposalsService
      .getProposals({ client_id: selectedClient.id })
      .then((rows) => {
        if (!cancelled) setDialogProposals(rows);
      })
      .catch((e) => {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "Erro ao carregar propostas");
          setDialogProposals([]);
        }
      })
      .finally(() => {
        if (!cancelled) setDialogProposalsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isViewDialogOpen, selectedClient?.id, tabSelected, canView]);
  
  // New client data state
  const [newClient, setNewClient] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    status: "Ativo",
    group_id: "",
    notes: "",
    cpf_cnpj: ""
  });
  
  // Edited client state (for edit mode)
  const [editedClient, setEditedClient] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    status: "",
    group_id: "",
    notes: "",
    cpf_cnpj: ""
  });

  // Form para adicionar nova tarefa
  const taskForm = useForm<z.infer<typeof taskSchema>>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: "",
      description: "",
      status: "Pendente",
    },
  });

  // Clientes e grupos em cache – ao voltar na página os dados aparecem na hora
  const { data: clientsData, isPending: isLoading } = useQuery({
    queryKey: ["clients", "list"],
    queryFn: async () => {
      const [groupsData, clientsData] = await Promise.all([
        clientsService.getClientGroups(),
        clientsService.getClients(),
      ]);
      const groups = groupsData || [];
      const formatted = (clientsData || []).map((client: any) => ({
        id: client.id,
        name: client.name,
        company: client.company,
        email: client.email,
        phone: client.phone,
        status: client.status,
        group: client.client_groups?.name || "",
        group_id: client.group_id,
        notes: client.notes,
        cpf_cnpj: client.cpf_cnpj ?? null,
        whatsapp_avatar_url: client.whatsapp_avatar_url ?? null,
      }));
      return { clients: formatted, groups };
    },
  });
  useEffect(() => {
    if (clientsData) {
      setClients(clientsData.clients);
      setClientGroups(clientsData.groups);
    }
  }, [clientsData]);

  /** Após voltar de fatura/proposta/etc., repõe o scroll da listagem (URL já traz filtros/página). */
  useLayoutEffect(() => {
    if (isLoading && clients.length === 0) return;
    const y = consumeClientsListScrollPosition(clientsListHref);
    if (y != null && y > 0) {
      requestAnimationFrame(() => {
        window.scrollTo({ top: y, left: 0, behavior: "auto" });
      });
    }
  }, [clientsListHref, isLoading, clients.length]);

  // Carregar tarefas do cliente selecionado
  useEffect(() => {
    const fetchClientTasks = async () => {
      if (!selectedClient) return;
      
      try {
        const tasks = await clientsService.getClientTasks(selectedClient.id);
        setClientTasks(tasks || []);
      } catch (error: any) {
        console.error("Erro ao carregar tarefas:", error);
        toast.error(error.message || "Erro ao carregar tarefas do cliente.");
      }
    };
    
    fetchClientTasks();
  }, [selectedClient]);

  const handleSort = (field: string) => {
    if (field === sortField) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // First apply status filter
  const filteredByStatus = clients.filter((client) => {
    if (activeTab === "all") return true;
    if (activeTab === "active") return client.status === "Ativo";
    if (activeTab === "inactive") return client.status === "Inativo";
    return true;
  });

  // Then apply group filter if selected
  const filteredByGroup = selectedGroup 
    ? filteredByStatus.filter(client => client.group_id === selectedGroup)
    : filteredByStatus;

  // Finally apply search term
  const filteredClients = filteredByGroup.filter((client) => {
    return (
      client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (client.company && client.company.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (client.email && client.email.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  });

  // Sort the filtered clients
  const sortedClients = [...filteredClients].sort((a: any, b: any) => {
    const valueA = a[sortField] || "";
    const valueB = b[sortField] || "";
    
    if (sortDirection === "asc") {
      return valueA > valueB ? 1 : -1;
    } else {
      return valueA < valueB ? 1 : -1;
    }
  });

  const clientMetrics = useMemo(() => {
    return {
      total: sortedClients.length,
      ativos: sortedClients.filter((c) => c.status === "Ativo").length,
      inativos: sortedClients.filter((c) => c.status === "Inativo").length,
    };
  }, [sortedClients]);

  // Apply pagination with dynamic itemsPerPage
  const totalPages = Math.max(1, Math.ceil(sortedClients.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedClients = sortedClients.slice(startIndex, startIndex + itemsPerPage);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const handleViewClient = (client: any) => {
    saveClientsListScrollPosition();
    navigate(`/clients/${client.id}`);
  };

  /** Edição rápida a partir da lista (mobile): reutiliza o diálogo de ficha já existente. */
  const openClientQuickEditFromList = (client: any) => {
    setSelectedClient(client);
    setEditedClient({
      name: client.name,
      company: client.company || "",
      email: client.email || "",
      phone: client.phone || "",
      status: client.status,
      group_id: client.group_id || "",
      notes: typeof client.notes === "string" ? client.notes : "",
      cpf_cnpj: client.cpf_cnpj ?? "",
    });
    setNewClientGroup(client.group_id || "");
    try {
      const raw = client.notes;
      if (typeof raw === "string" && raw.trim().startsWith("[")) {
        setNotes(JSON.parse(raw) as StickyNoteData[]);
      } else {
        setNotes([]);
      }
    } catch {
      setNotes([]);
    }
    setIsEditMode(true);
    setTabSelected("details");
    setIsViewDialogOpen(true);
  };
  
  const handleEditClient = () => {
    if (selectedClient) {
      setEditedClient({
        name: selectedClient.name,
        company: selectedClient.company || "",
        email: selectedClient.email || "",
        phone: selectedClient.phone || "",
        status: selectedClient.status,
        group_id: selectedClient.group_id || "",
        notes: selectedClient.notes || "",
        cpf_cnpj: selectedClient.cpf_cnpj ?? ""
      });
      setIsEditMode(true);
    }
  };
  
  const handleCancelEdit = () => {
    setIsEditMode(false);
  };
  
  const handleSaveEdit = async () => {
    if (selectedClient) {
      try {
        await clientsService.updateClient(selectedClient.id, {
            name: editedClient.name,
            company: editedClient.company,
            email: editedClient.email,
            phone: editedClient.phone,
            status: editedClient.status,
          group_id: editedClient.group_id || undefined,
            notes: editedClient.notes,
            cpf_cnpj: editedClient.cpf_cnpj?.replace(/\D/g, "").trim() || null
        });
        
        // Atualizar o cliente na lista local
        const updatedClients = clients.map(client => {
          if (client.id === selectedClient.id) {
            const updatedGroupName = clientGroups.find(g => g.id === editedClient.group_id)?.name || "";
            return {
              ...client,
              name: editedClient.name,
              company: editedClient.company,
              email: editedClient.email,
              phone: editedClient.phone,
              status: editedClient.status,
              group_id: editedClient.group_id,
              group: updatedGroupName,
              notes: editedClient.notes,
              cpf_cnpj: editedClient.cpf_cnpj?.trim() || null
            };
          }
          return client;
        });
        
        setClients(updatedClients);
        queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
        setSelectedClient({
          ...selectedClient,
          name: editedClient.name,
          company: editedClient.company,
          email: editedClient.email,
          phone: editedClient.phone,
          status: editedClient.status,
          group_id: editedClient.group_id,
          group: clientGroups.find(g => g.id === editedClient.group_id)?.name || "",
          notes: editedClient.notes,
          cpf_cnpj: editedClient.cpf_cnpj?.trim() || null
        });
        
        setIsEditMode(false);
        toast.success("Cliente atualizado com sucesso!");
      } catch (error: any) {
        console.error("Erro ao atualizar cliente:", error);
        toast.error(`Erro ao atualizar cliente: ${error.message}`);
      }
    }
  };

  // Handle input change for new client form
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { id, value } = e.target;
    setNewClient({
      ...newClient,
      [id]: value
    });
  };
  
  // Handle input change for edit client form
  const handleEditInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { id, value } = e.target;
    setEditedClient({
      ...editedClient,
      [id]: value
    });
  };

  // Handle select change for select components
  const handleSelectChange = (field: string, value: string) => {
    setNewClient({
      ...newClient,
      [field]: value
    });
  };
  
  // Handle select change for edit form
  const handleEditSelectChange = (field: string, value: string) => {
    setEditedClient({
      ...editedClient,
      [field]: value
    });
  };

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const result = await addClient({
        name: newClient.name,
        company: newClient.company || undefined,
        email: newClient.email || undefined,
        phone: newClient.phone || undefined,
        status: newClient.status || undefined,
        group_id: newClient.group_id || undefined,
        notes: newClient.notes || undefined,
        cpf_cnpj: newClient.cpf_cnpj?.trim() || undefined
      });
      
      if (!result.success) {
        throw new Error(result.error?.message || "Erro ao adicionar cliente");
      }
      
      // Backend returns a single object, not an array
      const addedClient = result.data;
      
      if (!addedClient || !addedClient.id) {
        throw new Error("Resposta inválida do servidor");
      }
      
      // Format the client data for the list
      const formattedClient = {
        id: addedClient.id,
        name: addedClient.name,
        company: addedClient.company,
        email: addedClient.email,
        phone: addedClient.phone,
        status: addedClient.status,
        group: clientGroups.find(g => g.id === addedClient.group_id)?.name || "",
        group_id: addedClient.group_id,
        notes: addedClient.notes,
        cpf_cnpj: addedClient.cpf_cnpj ?? null
      };
      
      setClients([...clients, formattedClient]);
      queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
      toast.success("Cliente adicionado com sucesso!");
      setIsAddDialogOpen(false);
      
      // Reset the form
      setNewClient({
        name: "",
        company: "",
        email: "",
        phone: "",
        status: "Ativo",
        group_id: "",
        notes: "",
        cpf_cnpj: ""
      });
    } catch (error: any) {
      console.error("Erro ao adicionar cliente:", error);
      toast.error(`Erro ao adicionar cliente: ${error.message}`);
    }
  };

  const handleUpdateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (selectedClient && newClientGroup) {
      try {
        // Atualizar o grupo do cliente
        await clientsService.updateClient(selectedClient.id, { group_id: newClientGroup || undefined });
        
        // Atualizar o cliente na lista local
        const updatedClients = clients.map(client => {
          if (client.id === selectedClient.id) {
            const updatedGroupName = clientGroups.find(group => group.id === newClientGroup)?.name || "";
            return { 
              ...client, 
              group_id: newClientGroup,
              group: updatedGroupName
            };
          }
          return client;
        });
        
        setClients(updatedClients);
        queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
        setSelectedClient({
          ...selectedClient, 
          group_id: newClientGroup,
          group: clientGroups.find(group => group.id === newClientGroup)?.name || ""
        });
        
        const updatedGroupName = clientGroups.find(group => group.id === newClientGroup)?.name || "";
        toast.success(`Grupo do cliente ${selectedClient.name} alterado para ${updatedGroupName}`);
      } catch (error: any) {
        console.error("Erro ao atualizar grupo do cliente:", error);
        toast.error(`Erro ao atualizar grupo: ${error.message}`);
      }
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
    // Salvar automaticamente quando a nota for criada (mesmo vazia)
    setTimeout(() => saveNotes([...notes, newNote]), 100);
  };

  const handleUpdateNote = async (id: string, content: string) => {
    const updatedNotes = notes.map(note => 
      note.id === id 
        ? { ...note, content, updated_at: new Date().toISOString() }
        : note
    );
    setNotes(updatedNotes);
    await saveNotes(updatedNotes);
  };

  const handleDeleteNote = async (id: string) => {
    const updatedNotes = notes.filter(note => note.id !== id);
    setNotes(updatedNotes);
    await saveNotes(updatedNotes);
  };

  const handleColorChange = async (id: string, color: string) => {
    const updatedNotes = notes.map(note => 
      note.id === id ? { ...note, color } : note
    );
    setNotes(updatedNotes);
    await saveNotes(updatedNotes);
  };

  const saveNotes = async (notesToSave: StickyNoteData[]) => {
    if (!selectedClient) return;
    
    try {
      // Salvar como JSON string
      const notesJson = JSON.stringify(notesToSave);
      await clientsService.updateClient(selectedClient.id, { notes: notesJson });
      
      // Atualizar o cliente na lista local
      const updatedClients = clients.map(client => {
        if (client.id === selectedClient.id) {
          return { ...client, notes: notesJson };
        }
        return client;
      });
      
      setClients(updatedClients);
      queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
      // Atualizar o cliente selecionado
      setSelectedClient({
        ...selectedClient,
        notes: notesJson
      });
      
      toast.success("Notas salvas com sucesso!");
    } catch (error: any) {
      console.error("Erro ao salvar notas:", error);
      toast.error(`Erro ao salvar notas: ${error.message}`);
    }
  };

  // Adicionar tarefa para o cliente
  const handleAddTask = async (values: z.infer<typeof taskSchema>) => {
    if (!selectedClient) return;
    
    try {
      // Convertendo o objeto Date para string no formato ISO
      const formattedDueDate = values.due_date ? values.due_date.toISOString() : null;
      
      const result = await addClientTask({
        client_id: selectedClient.id,
        title: values.title,
        description: values.description || "",
        due_date: formattedDueDate,
        status: values.status
      });

      if (!result.success) {
        throw new Error(result.error?.message || "Erro ao adicionar tarefa");
      }
      
      // Adicionar a nova tarefa à lista
      // result.data já é o objeto da tarefa, não um array
      if (result.data) {
        setClientTasks([...clientTasks, result.data]);
      }
      
      toast.success("Tarefa adicionada com sucesso!");
      setIsAddTaskDialogOpen(false);
      taskForm.reset();
      
      // Recarregar tarefas para garantir sincronização
      const tasks = await clientsService.getClientTasks(selectedClient.id);
      setClientTasks(tasks || []);
    } catch (error: any) {
      console.error("Erro ao adicionar tarefa:", error);
      toast.error(`Erro ao adicionar tarefa: ${error.message}`);
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, newStatus: string) => {
    try {
      await clientsService.updateClientTask(taskId, { status: newStatus });
      
      // Update the task in the local list
      setClientTasks(clientTasks.map(task => 
        task.id === taskId ? { ...task, status: newStatus } : task
      ));
      
      toast.success("Status da tarefa atualizado com sucesso!");
    } catch (error: any) {
      console.error("Erro ao atualizar status da tarefa:", error.message);
      toast.error("Não foi possível atualizar o status da tarefa");
    }
  };
  
  const handleDeleteTask = async (taskId: string) => {
    try {
      await clientsService.deleteClientTask(taskId);
      
      // Remove the task from the local list
      setClientTasks(clientTasks.filter(task => task.id !== taskId));
      
      toast.success("Tarefa removida com sucesso!");
    } catch (error: any) {
      console.error("Erro ao remover tarefa:", error.message);
      toast.error("Não foi possível remover a tarefa");
    }
  };

  const handleDeleteClient = async () => {
    if (!clientToDelete) return;
    
    try {
      await clientsService.deleteClient(clientToDelete.id);
      setClients(clients.filter(client => client.id !== clientToDelete.id));
      queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
      // If the deleted client was selected, clear selection
      if (selectedClient && selectedClient.id === clientToDelete.id) {
        setSelectedClient(null);
        setIsViewDialogOpen(false);
      }
      
      setIsDeleteDialogOpen(false);
      setClientToDelete(null);
      toast.success("Cliente excluído com sucesso!");
    } catch (error: any) {
      console.error("Erro ao excluir cliente:", error.message);
      toast.error(error.message || "Não foi possível excluir o cliente");
    }
  };

  const confirmDeleteClient = (client: any) => {
    setClientToDelete(client);
    setIsDeleteDialogOpen(true);
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (field !== sortField) return null;
    return sortDirection === "asc" ? <ArrowUp className="ml-1 h-4 w-4" /> : <ArrowDown className="ml-1 h-4 w-4" />;
  };

  const renderPagination = () => {
    const pages = [];
    const maxVisiblePages = 3;
    
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    // Previous button
    pages.push(
      <PaginationItem key="prev">
        <PaginationPrevious 
          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
          className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
          aria-disabled={currentPage === 1}
        />
      </PaginationItem>
    );
    
    // First page if not visible
    if (startPage > 1) {
      pages.push(
        <PaginationItem key="1">
          <PaginationLink onClick={() => setCurrentPage(1)}>1</PaginationLink>
        </PaginationItem>
      );
      
      // Ellipsis if needed
      if (startPage > 2) {
        pages.push(
          <PaginationItem key="start-ellipsis">
            <PaginationEllipsis />
          </PaginationItem>
        );
      }
    }
    
    // Visible page numbers
    for (let i = startPage; i <= endPage; i++) {
      pages.push(
        <PaginationItem key={i}>
          <PaginationLink 
            isActive={currentPage === i}
            onClick={() => setCurrentPage(i)}
          >
            {i}
          </PaginationLink>
        </PaginationItem>
      );
    }
    
    // Ellipsis if needed
    if (endPage < totalPages - 1) {
      pages.push(
        <PaginationItem key="end-ellipsis">
          <PaginationEllipsis />
        </PaginationItem>
      );
    }
    
    // Last page if not visible
    if (endPage < totalPages) {
      pages.push(
        <PaginationItem key={totalPages}>
          <PaginationLink onClick={() => setCurrentPage(totalPages)}>
            {totalPages}
          </PaginationLink>
        </PaginationItem>
      );
    }
    
    // Next button
    pages.push(
      <PaginationItem key="next">
        <PaginationNext 
          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
          className={currentPage === totalPages || totalPages === 0 ? "pointer-events-none opacity-50" : "cursor-pointer"}
          aria-disabled={currentPage === totalPages || totalPages === 0}
        />
      </PaginationItem>
    );
    
    return pages;
  };

  const renderClientDetails = () => {
    if (!selectedClient) return null;
    
    if (isEditMode) {
      // Modo de edição - exibir formulário
      return (
        <form onSubmit={(e) => { e.preventDefault(); handleSaveEdit(); }}>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input 
                id="name" 
                value={editedClient.name}
                onChange={handleEditInputChange}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company">Empresa</Label>
              <Input 
                id="company" 
                value={editedClient.company}
                onChange={handleEditInputChange}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input 
                id="email"
                type="email"
                value={editedClient.email}
                onChange={handleEditInputChange}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input 
                id="phone"
                value={editedClient.phone}
                onChange={handleEditInputChange}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cpf_cnpj">CPF ou CNPJ</Label>
              <Input 
                id="cpf_cnpj"
                placeholder="000.000.000-00 ou 00.000.000/0000-00"
                value={editedClient.cpf_cnpj}
                onChange={handleEditInputChange}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={editedClient.status}
                onValueChange={(value) => handleEditSelectChange("status", value)}
              >
                <SelectTrigger id="status">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Ativo">Ativo</SelectItem>
                  <SelectItem value="Inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="group_id">Grupo</Label>
              <Select
                value={editedClient.group_id}
                onValueChange={(value) => handleEditSelectChange("group_id", value)}
              >
                <SelectTrigger id="group_id">
                  <SelectValue placeholder="Selecione um grupo" />
                </SelectTrigger>
                <SelectContent>
                  {clientGroups.map(group => (
                    <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              value={editedClient.notes}
              onChange={handleEditInputChange}
              placeholder="Adicione informações relevantes sobre este cliente"
            />
          </div>
        </form>
      );
    } else {
      // Modo de visualização - exibir detalhes
      return (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>E-mail</Label>
            <p className="text-sm">{selectedClient.email}</p>
          </div>
          <div className="space-y-1">
            <Label>Telefone</Label>
            <p className="text-sm">{selectedClient.phone}</p>
          </div>
          <div className="space-y-1">
            <Label>CPF ou CNPJ</Label>
            <p className="text-sm">{formatCpfCnpjDisplay(selectedClient.cpf_cnpj)}</p>
          </div>
          <div className="space-y-1">
            <Label>Empresa</Label>
            <p className="text-sm">{selectedClient.company}</p>
          </div>
          <div className="space-y-1">
            <Label>Status</Label>
            <p className="text-sm">
              <Badge variant={selectedClient.status === "Ativo" ? "default" : (selectedClient.status === "Inativo" ? "destructive" : "outline")}>
                {selectedClient.status}
              </Badge>
            </p>
          </div>
          <div className="space-y-1">
            <Label>Grupo</Label>
            <div className="flex items-center gap-2">
              <p className="text-sm">{selectedClient.group || "Nenhum grupo atribuído"}</p>
              <form onSubmit={handleUpdateGroup} className="flex items-center gap-2">
                <Select value={newClientGroup} onValueChange={setNewClientGroup}>
                  <SelectTrigger className="h-8 w-[180px]">
                    <SelectValue placeholder="Alterar grupo" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientGroups.map(group => (
                      <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="submit" size="sm" disabled={!newClientGroup}>
                  Atribuir
                </Button>
              </form>
            </div>
          </div>
        </div>
      );
    }
  };

  const renderTasksTab = () => {
    if (clientTasks.length === 0) {
      return (
        <div className="text-center py-6">
          <p className="text-sm text-muted-foreground mb-4">
            Nenhuma tarefa encontrada para este cliente.
          </p>
          <Button onClick={() => setIsAddTaskDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Adicionar Tarefa
          </Button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium">Tarefas</h3>
          <Button onClick={() => setIsAddTaskDialogOpen(true)} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Nova Tarefa
          </Button>
        </div>
        <div className="space-y-2">
          {clientTasks && clientTasks.length > 0 ? (
            clientTasks.map(task => {
              if (!task || !task.id) return null;
              return (
            <Card key={task.id} className="p-4">
              <div className="flex justify-between">
                <div>
                      <h4 className="font-medium">{task.title || 'Sem título'}</h4>
                  {task.description && <p className="text-sm text-muted-foreground mt-1">{task.description}</p>}
                  {task.due_date && (
                    <div className="flex items-center text-xs text-muted-foreground mt-2">
                      <CalendarIcon className="h-3 w-3 mr-1" />
                      {format(new Date(task.due_date), "dd/MM/yyyy")}
                    </div>
                  )}
                </div>
                <div className="flex items-start space-x-2">
                  <Select
                        value={task.status || 'Pendente'}
                    onValueChange={(value) => handleUpdateTaskStatus(task.id, value)}
                  >
                    <SelectTrigger className="h-8 w-[120px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Pendente">Pendente</SelectItem>
                      <SelectItem value="Em andamento">Em andamento</SelectItem>
                      <SelectItem value="Concluída">Concluída</SelectItem>
                      <SelectItem value="Cancelada">Cancelada</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteTask(task.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
              );
            })
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma tarefa cadastrada</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <CommercialListingPageShell>
      <div className="contents" onPointerDownCapture={() => saveClientsListScrollPosition()}>
      <CommercialListingPageHeader
        eyebrow="Base comercial"
        EyebrowIcon={Building2}
        title="Clientes"
        description="Carteira ativa: dados principais, grupos e atalhos para relacionamento e vendas."
        mobileSecondaryActions={[
          {
            icon: <Search className="h-4 w-4" aria-hidden />,
            ariaLabel: "Buscar clientes",
            onClick: () => setMobileSearchOpen(true),
          },
          {
            icon: <Filter className="h-4 w-4" aria-hidden />,
            ariaLabel: "Filtros",
            onClick: () => setMobileFiltersOpen(true),
          },
        ]}
        mobilePrimaryAction={
          canCreate(MODULE_CLIENTS)
            ? {
                label: "Novo cliente",
                icon: <Plus className="h-4 w-4" aria-hidden />,
                onClick: () => setIsAddDialogOpen(true),
              }
            : undefined
        }
        belowTitle={
          <>
            <MobileClientsSearchSheet
              open={mobileSearchOpen}
              onOpenChange={setMobileSearchOpen}
              canCreateClient={canCreate(MODULE_CLIENTS)}
              canUseChat={hasChat && canView("chat")}
              onRequestCreateClient={() => setIsAddDialogOpen(true)}
              clientsListHref={clientsListHref}
            />
            <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
              <SheetContent
                side="bottom"
                className="max-h-[88vh] overflow-y-auto rounded-t-2xl px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 md:hidden"
              >
                  <SheetHeader className="text-left">
                    <SheetTitle>Filtros</SheetTitle>
                    <SheetDescription>
                      Situação, grupo e itens por página. Use a busca no topo da página.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mt-4 space-y-4">
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Situação</p>
                      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsList className="grid w-full grid-cols-3">
                          <TabsTrigger value="all">Todos</TabsTrigger>
                          <TabsTrigger value="active">Ativos</TabsTrigger>
                          <TabsTrigger value="inactive">Inativos</TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Grupo</p>
                      <Select
                        value={selectedGroup || "all"}
                        onValueChange={(value) => setSelectedGroup(value === "all" ? null : value)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Grupo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos os grupos</SelectItem>
                          {clientGroups.map((group) => (
                            <SelectItem key={group.id} value={group.id}>
                              {group.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Itens por página</p>
                      <Select
                        value={itemsPerPage.toString()}
                        onValueChange={(value) => {
                          setItemsPerPage(Number(value));
                          setCurrentPage(1);
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {itemsPerPageOptions.map((option) => (
                            <SelectItem key={option} value={option.toString()}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <SheetClose asChild>
                      <Button type="button" className="w-full">
                        Concluir
                      </Button>
                    </SheetClose>
                  </div>
                </SheetContent>
              </Sheet>
            <div className="hidden md:flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-2">
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
            <Input
              type="search"
                  placeholder="Buscar nome, empresa ou e-mail…"
                  className="h-10 pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
                  aria-label="Buscar clientes"
            />
          </div>
          {canCreate(MODULE_CLIENTS) && (
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
                    <Button type="button" className="h-10 shrink-0 touch-manipulation sm:px-4">
                <Plus className="mr-2 h-4 w-4" />
                      Novo cliente
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Adicionar Cliente</DialogTitle>
                <DialogDescription>
                  Preencha os dados para adicionar um novo cliente ao sistema.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddClient}>
                <div className="grid gap-6 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nome</Label>
                      <Input 
                        id="name" 
                        placeholder="Nome completo" 
                        required 
                        value={newClient.name}
                        onChange={handleInputChange}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="company">Empresa</Label>
                      <Input 
                        id="company" 
                        placeholder="Nome da empresa" 
                        value={newClient.company}
                        onChange={handleInputChange}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">E-mail</Label>
                      <Input 
                        id="email" 
                        type="email" 
                        placeholder="email@exemplo.com" 
                        required 
                        value={newClient.email}
                        onChange={handleInputChange}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Telefone</Label>
                      <Input 
                        id="phone" 
                        placeholder="(00) 00000-0000" 
                        value={newClient.phone}
                        onChange={handleInputChange}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="cpf_cnpj">CPF ou CNPJ</Label>
                      <Input 
                        id="cpf_cnpj" 
                        placeholder="000.000.000-00 ou 00.000.000/0000-00" 
                        value={newClient.cpf_cnpj}
                        onChange={handleInputChange}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="status">Status</Label>
                      <Select 
                        defaultValue="Ativo"
                        onValueChange={(value) => handleSelectChange("status", value)}
                      >
                        <SelectTrigger id="status">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Ativo">Ativo</SelectItem>
                          <SelectItem value="Inativo">Inativo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="group_id">Grupo</Label>
                      <Select 
                        defaultValue=""
                        onValueChange={(value) => handleSelectChange("group_id", value)}
                      >
                        <SelectTrigger id="group_id">
                          <SelectValue placeholder="Selecione um grupo" />
                        </SelectTrigger>
                        <SelectContent>
                                {clientGroups.map((group) => (
                                  <SelectItem key={group.id} value={group.id}>
                                    {group.name}
                                  </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Observações</Label>
                    <Textarea 
                      id="notes" 
                      placeholder="Adicione informações relevantes sobre este cliente" 
                      value={newClient.notes || ""}
                      onChange={handleInputChange}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit">Salvar Cliente</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          )}
            </div>
          </>
        }
      />

      <div className={COMMERCIAL_SUMMARY_GRID_3}>
        <Card
          role="button"
          tabIndex={0}
          className={cn(
            COMMERCIAL_SUMMARY_CARD_CLASS,
            activeTab === "all" && COMMERCIAL_SUMMARY_ACTIVE_RING,
          )}
          onClick={() => {
            setActiveTab("all");
            setCurrentPage(1);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setActiveTab("all");
              setCurrentPage(1);
            }
          }}
        >
          <CardContent className="p-3.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-muted-foreground">Total (filtro)</p>
              <Layers className="h-4 w-4 shrink-0 text-muted-foreground opacity-80" aria-hidden />
            </div>
            <p className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight">{clientMetrics.total}</p>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">Todos nesta pesquisa e grupo</p>
          </CardContent>
        </Card>
        <Card
          role="button"
          tabIndex={0}
          className={cn(
            COMMERCIAL_SUMMARY_CARD_CLASS,
            activeTab === "active" && COMMERCIAL_SUMMARY_ACTIVE_RING,
          )}
          onClick={() => {
            setActiveTab("active");
            setCurrentPage(1);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setActiveTab("active");
              setCurrentPage(1);
            }
          }}
        >
          <CardContent className="p-3.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-muted-foreground">Ativos</p>
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600/80" aria-hidden />
            </div>
            <p className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight">{clientMetrics.ativos}</p>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">Em relacionamento comercial</p>
          </CardContent>
        </Card>
        <Card
          role="button"
          tabIndex={0}
          className={cn(
            "col-span-2 sm:col-span-1",
            COMMERCIAL_SUMMARY_CARD_CLASS,
            activeTab === "inactive" && COMMERCIAL_SUMMARY_ACTIVE_RING,
          )}
          onClick={() => {
            setActiveTab("inactive");
            setCurrentPage(1);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setActiveTab("inactive");
              setCurrentPage(1);
            }
          }}
        >
          <CardContent className="p-3.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-muted-foreground">Inativos</p>
              <Ban className="h-4 w-4 shrink-0 text-muted-foreground opacity-80" aria-hidden />
            </div>
            <p className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight">{clientMetrics.inativos}</p>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">Fora da operação atual</p>
          </CardContent>
        </Card>
      </div>

      <div className={cn(COMMERCIAL_FILTERS_PANEL, "hidden space-y-4 md:block")}>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Situação e grupo</p>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between xl:gap-6">
          <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab} className="w-full min-w-0">
            <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-background/80 p-1 md:min-h-11">
              <TabsTrigger value="all" className="px-3 text-xs sm:text-sm">
                Todos
              </TabsTrigger>
              <TabsTrigger value="active" className="px-3 text-xs sm:text-sm">
                Ativos
              </TabsTrigger>
              <TabsTrigger value="inactive" className="px-3 text-xs sm:text-sm">
                Inativos
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex w-full min-w-0 flex-col gap-1.5 border-border/50 xl:w-auto xl:max-w-sm xl:border-l xl:pl-6">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Grupo</span>
            <Select
              value={selectedGroup || "all"}
              onValueChange={(value) => {
                setSelectedGroup(value === "all" ? null : value);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="h-10 w-full md:max-w-md">
                <SelectValue placeholder="Filtrar por grupo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os grupos</SelectItem>
                {clientGroups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

          {/* Dialog para adicionar nova tarefa */}
          <Dialog open={isAddTaskDialogOpen} onOpenChange={setIsAddTaskDialogOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Adicionar Tarefa</DialogTitle>
                <DialogDescription>
                  Crie uma nova tarefa para {selectedClient?.name}.
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
                          <Textarea 
                            {...field} 
                            placeholder="Descreva os detalhes da tarefa"
                            value={field.value || ""}
                          />
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
                              <Button
                                variant={"outline"}
                                className={
                                  "w-full pl-3 text-left font-normal flex justify-between items-center"
                                }
                              >
                                {field.value ? (
                                  format(field.value, "dd/MM/yyyy")
                                ) : (
                                  <span>Selecionar data</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
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
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Pendente">Pendente</SelectItem>
                            <SelectItem value="Em andamento">Em andamento</SelectItem>
                            <SelectItem value="Concluída">Concluída</SelectItem>
                            <SelectItem value="Cancelada">Cancelada</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <DialogFooter className="mt-6">
                    <Button type="button" variant="outline" onClick={() => setIsAddTaskDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit">Salvar Tarefa</Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

          <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
            {selectedClient && (
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {selectedClient.name}
                    <Badge variant="default">Cliente</Badge>
                  </DialogTitle>
                  <DialogDescription>{selectedClient.company}</DialogDescription>
                </DialogHeader>
                <Tabs value={tabSelected} onValueChange={setTabSelected} className="w-full">
                  <TabsList className="grid grid-cols-4 mb-4">
                    <TabsTrigger value="details">Detalhes</TabsTrigger>
                    <TabsTrigger value="opportunities">Propostas</TabsTrigger>
                    <TabsTrigger value="tasks">Tarefas</TabsTrigger>
                    <TabsTrigger value="notes">Anotações</TabsTrigger>
                  </TabsList>
                  <TabsContent value="details">
                    {renderClientDetails()}
                  </TabsContent>
                  <TabsContent value="opportunities" className="space-y-4">
                    {!canView("proposals") ? (
                      <p className="text-sm text-muted-foreground text-center py-6">
                        Sem permissão para visualizar propostas.
                      </p>
                    ) : dialogProposalsLoading ? (
                      <div className="flex justify-center py-10">
                        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <div className="rounded-lg border bg-muted/30 px-3 py-2">
                            <p className="text-xs text-muted-foreground">Pendentes</p>
                            <p className="text-base font-semibold tabular-nums">{dialogProposalStats.pending}</p>
                            <p className="text-[10px] text-muted-foreground">Rascunho ou enviada</p>
                          </div>
                          <div className="rounded-lg border bg-muted/30 px-3 py-2">
                            <p className="text-xs text-muted-foreground">Aceitas / faturadas</p>
                            <p className="text-base font-semibold tabular-nums">{dialogProposalStats.acceptedCount}</p>
                          </div>
                          <div className="rounded-lg border bg-muted/30 px-3 py-2">
                            <p className="text-xs text-muted-foreground">Valor (aceitas + faturadas)</p>
                            <p className="text-base font-semibold tabular-nums">
                              {formatDialogProposalCurrency(dialogProposalStats.acceptedTotal)}
                            </p>
                          </div>
                          <div className="rounded-lg border bg-muted/30 px-3 py-2">
                            <p className="text-xs text-muted-foreground">Total</p>
                            <p className="text-base font-semibold tabular-nums">{dialogProposalStats.totalCount}</p>
                          </div>
                        </div>
                        {dialogProposals.length === 0 ? (
                          <div className="rounded-md border border-dashed py-8 text-center space-y-3">
                            <p className="text-sm text-muted-foreground">
                              Nenhuma proposta cadastrada para este cliente.
                            </p>
                            {canCreate("proposals") && selectedClient?.id ? (
                              <Button variant="outline" asChild className="mx-auto">
                                <Link
                                  to={appendClientsListReturnPath(
                                    `/proposals/new?clientId=${encodeURIComponent(selectedClient.id)}&from=client`,
                                    clientsListHref,
                                  )}
                                  onClick={() => setIsViewDialogOpen(false)}
                                >
                                  <Plus className="mr-2 h-4 w-4" />
                                  Nova proposta
                                </Link>
                              </Button>
                            ) : null}
                          </div>
                        ) : (
                          <div className="rounded-md border overflow-x-auto max-h-[min(360px,50vh)] overflow-y-auto">
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
                                {dialogProposals.map((p) => (
                                  <TableRow
                                    key={p.id}
                                    className="cursor-pointer hover:bg-muted/50"
                                    onClick={() => {
                                      setIsViewDialogOpen(false);
                                      navigate(`/proposals/${p.id}`);
                                    }}
                                  >
                                    <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                                      {dialogClientProposalCode(p.id)}
                                    </TableCell>
                                    <TableCell className="font-medium max-w-[140px] truncate">{p.title}</TableCell>
                                    <TableCell>
                                      <span
                                        className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${DIALOG_PROPOSAL_STATUS_CLASS[p.status]}`}
                                      >
                                        {DIALOG_PROPOSAL_STATUS_LABELS[p.status]}
                                      </span>
                                    </TableCell>
                                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground whitespace-nowrap">
                                      {p.valid_until ? formatDateOnlyPtBr(p.valid_until) : "—"}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums text-sm font-medium">
                                      {formatDialogProposalCurrency(Number(p.amount) || 0)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                        {dialogProposals.length > 0 && canCreate("proposals") && selectedClient?.id ? (
                          <Button className="w-full" variant="outline" asChild>
                            <Link
                              to={appendClientsListReturnPath(
                                `/proposals/new?clientId=${encodeURIComponent(selectedClient.id)}&from=client`,
                                clientsListHref,
                              )}
                              onClick={() => setIsViewDialogOpen(false)}
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              Nova proposta
                            </Link>
                          </Button>
                        ) : null}
                      </>
                    )}
                  </TabsContent>
                  <TabsContent value="tasks">
                    {renderTasksTab()}
                  </TabsContent>
                  <TabsContent value="notes">
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <h3 className="text-lg font-medium">Notas Autoadesivas</h3>
                        <Button onClick={handleAddNote} size="sm">
                          <Plus className="mr-2 h-4 w-4" />
                          Nova Nota
                        </Button>
                      </div>
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
                    </div>
                  </TabsContent>
                </Tabs>
                <DialogFooter>
                  {isEditMode ? (
                    <>
                      <Button variant="outline" onClick={handleCancelEdit}>
                        Cancelar
                      </Button>
                      <Button onClick={handleSaveEdit}>
                        Salvar Alterações
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
                        Fechar
                      </Button>
                      {canEdit(MODULE_CLIENTS) && (
                      <Button onClick={handleEditClient}>
                        Editar Cliente
                      </Button>
                      )}
                    </>
                  )}
                </DialogFooter>
              </DialogContent>
            )}
          </Dialog>

      <Card className={COMMERCIAL_LIST_CONTAINER_CARD}>
        <CardHeader className="flex flex-col gap-2 border-b border-border/50 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg font-semibold tracking-tight">Lista de clientes</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {sortedClients.length === 0
                ? "Nenhum resultado"
                : `Mostrando ${paginatedClients.length} de ${sortedClients.length} neste filtro`}
              </p>
            </div>
          <div className="hidden items-center gap-2 md:flex">
            <span className="text-sm text-muted-foreground">Por página</span>
              <Select 
                value={itemsPerPage.toString()} 
                onValueChange={(value) => {
                  setItemsPerPage(Number(value));
                setCurrentPage(1);
                }}
              >
              <SelectTrigger className="h-10 w-[88px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                {itemsPerPageOptions.map((option) => (
                    <SelectItem key={option} value={option.toString()}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
        </CardHeader>
        <CardContent className="pt-4">
          {isLoading && clients.length === 0 ? (
            <div className="flex min-h-[12rem] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/70 bg-card/50 px-4 py-8 text-center">
              <UserPlus className="h-7 w-7 text-muted-foreground/80" aria-hidden />
              <p className="text-sm font-medium text-foreground">Carregando clientes</p>
              <p className="text-xs text-muted-foreground">Aguarde enquanto buscamos sua base.</p>
            </div>
          ) : (
            <>
              <div className={COMMERCIAL_TABLE_DESKTOP_WRAP}>
            <Table>
              <TableHeader>
                    <TableRow className="border-b border-border/60 hover:bg-transparent">
                  <TableHead className="w-12" aria-label="Avatar" />
                      <TableHead
                        className="min-w-[200px] cursor-pointer text-xs font-medium text-muted-foreground"
                        onClick={() => handleSort("name")}
                      >
                    <div className="flex items-center">
                          Cliente
                      <SortIcon field="name" />
                    </div>
                  </TableHead>
                      <TableHead
                        className="hidden cursor-pointer text-xs font-medium text-muted-foreground lg:table-cell lg:min-w-[160px]"
                        onClick={() => handleSort("company")}
                      >
                    <div className="flex items-center">
                      Empresa
                      <SortIcon field="company" />
                    </div>
                  </TableHead>
                      <TableHead className="hidden text-xs font-medium text-muted-foreground xl:table-cell xl:max-w-[200px]">
                        E-mail
                      </TableHead>
                      <TableHead className="hidden text-xs font-medium text-muted-foreground md:table-cell">
                        Telefone
                      </TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Status</TableHead>
                      <TableHead className="hidden text-xs font-medium text-muted-foreground lg:table-cell lg:max-w-[140px]">
                        Grupo
                      </TableHead>
                      <TableHead className="w-[132px] text-right text-xs font-medium text-muted-foreground">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedClients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      Nenhum cliente encontrado com os critérios de busca
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedClients.map((client) => {
                    const listAvatar = resolveProfileAvatarUrl(
                      client,
                      client.whatsapp_avatar_url ?? null
                    );
                    return (
                        <TableRow
                          key={client.id}
                          className="group/row border-border/40 transition-colors hover:bg-muted/50"
                        >
                          <TableCell className="w-12 align-middle">
                            <Avatar className="h-9 w-9 ring-1 ring-border/60">
                          {listAvatar.src ? (
                            <AvatarImage src={listAvatar.src} alt={client.name} />
                          ) : null}
                          <AvatarFallback className="text-xs">{listAvatar.initials}</AvatarFallback>
                        </Avatar>
                      </TableCell>
                          <TableCell className="align-middle">
                            <button
                              type="button"
                              className="block w-full text-left"
                              onClick={() => handleViewClient(client)}
                            >
                              <span className="font-semibold text-foreground group-hover/row:text-primary">
                                {client.name}
                              </span>
                              {client.company ? (
                                <span className="mt-0.5 block truncate text-xs text-muted-foreground lg:hidden">
                                  {client.company}
                                </span>
                              ) : null}
                            </button>
                          </TableCell>
                          <TableCell className="hidden align-middle text-sm text-muted-foreground lg:table-cell">
                            <span className="line-clamp-2 max-w-[200px]">{client.company || "—"}</span>
                          </TableCell>
                          <TableCell className="hidden align-middle xl:table-cell">
                            <span className="line-clamp-2 max-w-[200px] text-sm text-muted-foreground">
                              {client.email || "—"}
                            </span>
                          </TableCell>
                          <TableCell className="hidden align-middle text-sm tabular-nums text-muted-foreground md:table-cell">
                            {client.phone || "—"}
                          </TableCell>
                          <TableCell className="align-middle">
                        <Badge 
                              variant="outline"
                              className={cn(
                                "rounded-md px-2.5 py-1 text-xs font-medium",
                                client.status === "Ativo" &&
                                  "border-emerald-200/80 bg-emerald-100 text-emerald-950 dark:border-emerald-800/50 dark:bg-emerald-950/35 dark:text-emerald-100",
                                client.status === "Inativo" &&
                                  "border-border/60 bg-muted/80 text-muted-foreground",
                                client.status !== "Ativo" &&
                                  client.status !== "Inativo" &&
                                  "border-border/60",
                              )}
                        >
                          {client.status}
                        </Badge>
                      </TableCell>
                          <TableCell className="hidden align-middle text-sm text-muted-foreground lg:table-cell">
                            <span className="line-clamp-2 max-w-[160px]">{client.group || "—"}</span>
                          </TableCell>
                          <TableCell className="text-right align-middle" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end gap-0.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                aria-label="Abrir ficha"
                                onClick={() => handleViewClient(client)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                  <Button variant="outline" size="sm" className="h-8 gap-1 px-2" aria-label="Mais ações">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                                  <DropdownMenuLabel>Mais ações</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={(e) => {
                              e.stopPropagation();
                                      saveClientsListScrollPosition();
                              navigate(`/clients/${client.id}/tasks`);
                                    }}
                                  >
                                    <Plus className="mr-2 h-4 w-4" />
                                    Adicionar tarefa
                            </DropdownMenuItem>
                                  {canCreate("proposals") && (
                                    <DropdownMenuItem asChild>
                                      <Link
                                        to={appendClientsListReturnPath(
                                          `/proposals/new?clientId=${encodeURIComponent(client.id)}&from=client`,
                                          clientsListHref,
                                        )}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <UserPlus className="mr-2 h-4 w-4" />
                                        Nova proposta
                                      </Link>
                            </DropdownMenuItem>
                                  )}
                                  {canCreate("billing") ? (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem asChild>
                                        <Link
                                          to={appendClientsListReturnPath(
                                            `/customer-invoices/new?client_id=${encodeURIComponent(client.id)}&billing=one_off`,
                                            clientsListHref,
                                          )}
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <Receipt className="mr-2 h-4 w-4" />
                                          Nova fatura
                                        </Link>
                            </DropdownMenuItem>
                                      <DropdownMenuItem asChild>
                                        <Link
                                          to={appendClientsListReturnPath(
                                            `/customer-invoices/new?client_id=${encodeURIComponent(client.id)}&billing=subscription`,
                                            clientsListHref,
                                          )}
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <CalendarSync className="mr-2 h-4 w-4" />
                                          Nova assinatura
                                        </Link>
                                      </DropdownMenuItem>
                                    </>
                                  ) : null}
                                  {canCreate("contracts") ? (
                                    <DropdownMenuItem asChild>
                                      <Link
                                        to={appendClientsListReturnPath(
                                          `/contracts/new?clientId=${encodeURIComponent(client.id)}`,
                                          clientsListHref,
                                        )}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <FileSignature className="mr-2 h-4 w-4" />
                                        Criar contrato
                                      </Link>
                                    </DropdownMenuItem>
                                  ) : null}
                            <DropdownMenuSeparator />
                            {canDelete(MODULE_CLIENTS) && (
                            <DropdownMenuItem 
                              onClick={(e) => {
                                e.stopPropagation();
                                confirmDeleteClient(client);
                              }}
                              className="text-destructive focus:text-destructive"
                            >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Excluir cliente
                            </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                            </div>
                      </TableCell>
                    </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
              </div>

              <div className="space-y-2 pb-[max(0.25rem,env(safe-area-inset-bottom))] md:hidden">
                {paginatedClients.length === 0 ? (
                  <div className="flex min-h-[9rem] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/70 bg-card/50 px-3 py-8 text-center">
                    <Search className="h-7 w-7 text-muted-foreground/80" aria-hidden />
                    <p className="text-sm font-medium text-foreground">Nenhum cliente encontrado</p>
                    <p className="text-xs text-muted-foreground">Ajuste filtros ou termos de busca para continuar.</p>
                  </div>
                ) : (
                  paginatedClients.map((client) => {
                    const listAvatar = resolveProfileAvatarUrl(
                      client,
                      client.whatsapp_avatar_url ?? null
                    );
                    const notePreview = clientNotesPreview(client.notes);
                    const contactLine = [client.phone, client.email].filter(Boolean).join(" · ");
                    const opHint =
                      client.group?.trim() ||
                      (notePreview ? notePreview.slice(0, 72) + (notePreview.length > 72 ? "…" : "") : "");

                    return (
                      <Card
                        key={`m-${client.id}`}
                        className="overflow-hidden border-border/70 shadow-sm"
                      >
                        <CardContent className="p-0">
                          <button
                            type="button"
                            className="flex w-full min-h-[4.5rem] gap-2.5 px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/20 focus-visible:bg-muted/25 active:bg-muted/35"
                            onClick={() => handleViewClient(client)}
                            aria-label={`Abrir ficha de ${client.name}`}
                          >
                            <Avatar className="h-10 w-10 shrink-0 ring-1 ring-border/50">
                              {listAvatar.src ? (
                                <AvatarImage src={listAvatar.src} alt={client.name} />
                              ) : null}
                              <AvatarFallback className="text-xs">{listAvatar.initials}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-[15px] font-semibold leading-tight text-foreground">
                                    {client.name}
                                  </p>
                                  {client.company ? (
                                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                                      <Building2 className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
                                      {client.company}
                                    </p>
                                  ) : null}
                                </div>
                                <Badge
                                  variant={
                                    client.status === "Ativo"
                                      ? "default"
                                      : client.status === "Inativo"
                                        ? "destructive"
                                        : "outline"
                                  }
                                  className="max-w-[6.5rem] shrink-0 truncate px-2 py-0.5 text-[11px]"
                                >
                                  {client.status}
                                </Badge>
                              </div>
                              {contactLine ? (
                                <p className="mt-1 line-clamp-1 text-xs tabular-nums text-muted-foreground">
                                  {contactLine}
                                </p>
                              ) : null}
                              {opHint ? (
                                <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{opHint}</p>
                              ) : null}
                            </div>
                          </button>
                          <div className="flex items-center gap-1.5 border-t border-border/50 bg-muted/15 px-2 py-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="h-8 min-w-0 flex-1 touch-manipulation px-2 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                void floatingChat.openChatForClient(client.id);
                              }}
                            >
                              <MessageCircle className="mr-1 h-3.5 w-3.5 shrink-0" aria-hidden />
                              Chat
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-8 shrink-0 touch-manipulation"
                                  aria-label="Mais ações"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuLabel>Ações rápidas</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {canCreate("billing") ? (
                                  <>
                                    <DropdownMenuItem asChild>
                                      <Link
                                        to={appendClientsListReturnPath(
                                          `/customer-invoices/new?client_id=${encodeURIComponent(client.id)}&billing=one_off`,
                                          clientsListHref,
                                        )}
                                      >
                                        <Receipt className="mr-2 h-4 w-4" />
                                        Nova fatura
                                      </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem asChild>
                                      <Link
                                        to={appendClientsListReturnPath(
                                          `/customer-invoices/new?client_id=${encodeURIComponent(client.id)}&billing=subscription`,
                                          clientsListHref,
                                        )}
                                      >
                                        <CalendarSync className="mr-2 h-4 w-4" />
                                        Nova assinatura
                                      </Link>
                                    </DropdownMenuItem>
                                  </>
                                ) : null}
                                {canCreate("proposals") ? (
                                  <DropdownMenuItem asChild>
                                    <Link
                                      to={appendClientsListReturnPath(
                                        `/proposals/new?clientId=${encodeURIComponent(client.id)}&from=client`,
                                        clientsListHref,
                                      )}
                                    >
                                      <FileText className="mr-2 h-4 w-4" />
                                      Criar proposta
                                    </Link>
                                  </DropdownMenuItem>
                                ) : null}
                                {canCreate("contracts") ? (
                                  <DropdownMenuItem asChild>
                                    <Link
                                      to={appendClientsListReturnPath(
                                        `/contracts/new?clientId=${encodeURIComponent(client.id)}`,
                                        clientsListHref,
                                      )}
                                    >
                                      <FileSignature className="mr-2 h-4 w-4" />
                                      Criar contrato
                                    </Link>
                                  </DropdownMenuItem>
                                ) : null}
                                {canEdit(MODULE_CLIENTS) ? (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => {
                                        openClientQuickEditFromList(client);
                                      }}
                                    >
                                      <Pencil className="mr-2 h-4 w-4" />
                                      Editar
                                    </DropdownMenuItem>
                                  </>
                                ) : null}
                                {canDelete(MODULE_CLIENTS) ? (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={() => confirmDeleteClient(client)}
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Excluir
                                    </DropdownMenuItem>
                                  </>
                                ) : null}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            </>
          )}

          {sortedClients.length > 0 ? (
            <div className="mt-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-center text-xs text-muted-foreground sm:text-left">
                Página {currentPage} de {totalPages}
              </p>
              <Pagination className="justify-center sm:justify-end">
                <PaginationContent className="flex-wrap gap-1">{renderPagination()}</PaginationContent>
            </Pagination>
          </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir o cliente <strong>{clientToDelete?.name}</strong>?
              <br />
              <span className="text-destructive">Esta ação não pode ser desfeita.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsDeleteDialogOpen(false);
                setClientToDelete(null);
              }}
            >
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteClient}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </CommercialListingPageShell>
  );
};

export default Clients;
