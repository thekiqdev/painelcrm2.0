
import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { apiClient } from "@/integrations/api/client";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";
import { z } from "zod";

// Import our refactored components
import LeadHeader from "@/components/leads/LeadHeader";
import LeadFilters from "@/components/leads/LeadFilters";
import LeadListTable from "@/components/leads/LeadListTable";
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

const DEFAULT_LEAD_STATUSES = [
  { id: "1", name: "Novo", color: "#6E56CF" },
  { id: "2", name: "Em contato", color: "#F59E0B" },
  { id: "3", name: "Qualificado", color: "#10B981" },
  { id: "4", name: "Perdido", color: "#EF4444" },
];

const Leads = () => {
  const queryClient = useQueryClient();
  const [leadStatuses, setLeadStatuses] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [sortField, setSortField] = useState("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [leadTasks, setLeadTasks] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("details");
  const [activeStatusFilter, setActiveStatusFilter] = useState("all");
  const [isConvertDialogOpen, setIsConvertDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState<any>(null);
  const [isProposalSheetOpen, setIsProposalSheetOpen] = useState(false);
  const { user } = useAuth();

  // Statuses em cache
  const { data: statusesData } = useQuery({
    queryKey: ["leadStatuses"],
    queryFn: async () => {
      const response = await apiClient.get("/api/lead-statuses");
      if (response.error) throw new Error(response.error);
      const data = response.data || [];
      return data?.length > 0 ? data : DEFAULT_LEAD_STATUSES;
    },
    enabled: !!user,
  });
  useEffect(() => {
    setLeadStatuses(statusesData ?? DEFAULT_LEAD_STATUSES);
  }, [statusesData]);

  // Leads em cache – ao voltar na página os dados aparecem na hora
  const { data: leadsData, isPending: leadsLoading } = useQuery({
    queryKey: ["leads", sortField, sortDirection, activeStatusFilter],
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
        const aVal = a[sortField] || "";
        const bVal = b[sortField] || "";
        if (sortDirection === "asc") return aVal > bVal ? 1 : -1;
        return aVal < bVal ? 1 : -1;
      });
      return data;
    },
    enabled: !!user,
  });
  const leads = leadsData ?? [];
  const fetchLeads = () => queryClient.invalidateQueries({ queryKey: ["leads"] });

  // Fetch tasks for a selected lead
  const fetchLeadTasks = async (leadId: string) => {
    if (!user) return;
    
    try {
      const response = await apiClient.get(`/api/leads/${leadId}/tasks`);
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
    setActiveTab("details");
    await fetchLeadTasks(lead.id);
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

      queryClient.invalidateQueries({ queryKey: ["leads"] });
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
      // Converting Date to ISO string
      const formattedDueDate = values.due_date ? values.due_date.toISOString() : null;
      
      const taskData = {
        lead_id: selectedLead.id,
        title: values.title,
        description: values.description || "",
        due_date: formattedDueDate,
        status: values.status
      };
      
      const response = await apiClient.post("/api/lead-tasks", taskData);
      if (response.error) throw new Error(response.error);

      toast.success("Tarefa adicionada com sucesso!");
      fetchLeadTasks(selectedLead.id);
      setActiveTab("tasks");
    } catch (error: any) {
      console.error("Erro ao adicionar tarefa:", error.message);
      toast.error("Não foi possível adicionar a tarefa");
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
      void queryClient.invalidateQueries({ queryKey: ["clients", "list"] });
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

  // Get status color variant
  const getStatusVariant = (status: string) => {
    const foundStatus = leadStatuses.find(s => s.name === status);
    return foundStatus ? { color: foundStatus.color } : { color: "#6E56CF" };
  };


  const filteredLeads = getFilteredLeads();

  const handleProposalCreatedFromLead = (_created: ProposalCreateSuccessPayload, mode: "sent" | "draft") => {
    toast.success(mode === "draft" ? "Rascunho salvo." : "Proposta criada.");
    setIsProposalSheetOpen(false);
    void queryClient.invalidateQueries({ queryKey: ["proposals"] });
    fetchLeads();
  };

  return (
    <div className="space-y-6">
      {/* Header with search and add button */}
      <LeadHeader 
        searchTerm={searchTerm}
        onSearchChange={(e) => setSearchTerm(e.target.value)}
        onAddClick={() => setIsAddDialogOpen(true)} 
      />

      {/* Status filter tabs */}
      <LeadFilters 
        activeStatusFilter={activeStatusFilter}
        setActiveStatusFilter={setActiveStatusFilter}
        leadStatuses={leadStatuses}
      />

      {/* Main card with leads table */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle>Lista de Leads</CardTitle>
        </CardHeader>
        <CardContent>
          <LeadListTable 
            leads={filteredLeads}
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

          {/* Pagination */}
          <div className="mt-4">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious onClick={() => console.log('Previous page')} />
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink onClick={() => console.log('Page 1')} isActive>1</PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink onClick={() => console.log('Page 2')}>2</PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext onClick={() => console.log('Next page')} />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
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
    </div>
  );
};

export default Leads;
