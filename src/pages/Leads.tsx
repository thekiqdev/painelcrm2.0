
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/contexts/AuthContext";
import { withUserId } from "@/utils/auth-helpers";

// Import our refactored components
import LeadHeader from "@/components/leads/LeadHeader";
import LeadFilters from "@/components/leads/LeadFilters";
import LeadListTable from "@/components/leads/LeadListTable";
import LeadAddDialog from "@/components/leads/LeadAddDialog";
import LeadEditDialog from "@/components/leads/LeadEditDialog";
import LeadDetailsDialog from "@/components/leads/LeadDetailsDialog";
import LeadConvertDialog from "@/components/leads/LeadConvertDialog";

// Schemas for form validation
const leadFormSchema = z.object({
  name: z.string().min(2, { message: "Nome é obrigatório" }),
  company: z.string().optional(),
  email: z.string().email({ message: "E-mail inválido" }).optional().or(z.literal("")),
  phone: z.string().optional(),
  status: z.string(),
  source: z.string(),
  notes: z.string().optional(),
});

const taskFormSchema = z.object({
  title: z.string().min(3, { message: "Título é obrigatório" }),
  description: z.string().optional(),
  due_date: z.date().optional().nullable(),
  status: z.string(),
});

const noteFormSchema = z.object({
  content: z.string().min(1, { message: "Conteúdo é obrigatório" }),
});

type LeadFormValues = z.infer<typeof leadFormSchema>;
type TaskFormValues = z.infer<typeof taskFormSchema>;
type NoteFormValues = z.infer<typeof noteFormSchema>;

const Leads = () => {
  // State variables
  const [leads, setLeads] = useState<any[]>([]);
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
  const { user } = useAuth();

  // Forms
  const noteForm = useForm<NoteFormValues>({
    resolver: zodResolver(noteFormSchema),
    defaultValues: {
      content: "",
    },
  });

  // Fetch lead statuses from Supabase
  const fetchLeadStatuses = async () => {
    try {
      const { data, error } = await supabase
        .from("lead_statuses")
        .select("*")
        .order("name");

      if (error) throw error;
      
      if (data && data.length > 0) {
        setLeadStatuses(data);
      } else {
        // Default statuses if none are found
        setLeadStatuses([
          { id: "1", name: "Novo", color: "#6E56CF" },
          { id: "2", name: "Em contato", color: "#F59E0B" },
          { id: "3", name: "Qualificado", color: "#10B981" },
          { id: "4", name: "Perdido", color: "#EF4444" }
        ]);
      }
    } catch (error: any) {
      console.error("Erro ao buscar status:", error.message);
    }
  };

  // Fetch leads from Supabase
  const fetchLeads = async () => {
    try {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order(sortField, { ascending: sortDirection === "asc" });

      if (error) throw error;
      setLeads(data || []);
    } catch (error: any) {
      console.error("Erro ao buscar leads:", error.message);
      toast.error("Não foi possível carregar os leads");
    }
  };

  // Fetch tasks for a selected lead
  const fetchLeadTasks = async (leadId: string) => {
    try {
      const { data, error } = await supabase
        .from("lead_tasks")
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setLeadTasks(data || []);
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
      // Filter by status if not "all"
      const statusMatches = activeStatusFilter === "all" || lead.status.toLowerCase() === activeStatusFilter;
      
      // Filter by search term
      const searchMatches = 
        lead.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (lead.company && lead.company.toLowerCase().includes(searchTerm.toLowerCase())) || 
        (lead.email && lead.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (lead.phone && lead.phone.includes(searchTerm));
        
      return statusMatches && searchMatches;
    });
  };

  // View lead details
  const handleViewLead = async (lead: any) => {
    setSelectedLead(lead);
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
    if (!selectedLead) return;

    try {
      const leadData = {
        ...values,
        company: values.company || null,
        email: values.email || null,
        phone: values.phone || null,
        notes: values.notes || null,
      };

      const { data, error } = await supabase
        .from("leads")
        .update(leadData)
        .eq("id", selectedLead.id)
        .select();

      if (error) throw error;

      toast.success("Lead atualizado com sucesso!");
      setIsEditDialogOpen(false);
      
      // Update the lead in the local list
      setLeads(leads.map(lead => 
        lead.id === selectedLead.id ? { ...lead, ...leadData } : lead
      ));
      
      // Update selected lead if being viewed
      if (isViewDialogOpen && selectedLead) {
        setSelectedLead({ ...selectedLead, ...leadData });
      }
    } catch (error: any) {
      console.error("Erro ao atualizar lead:", error.message);
      toast.error("Não foi possível atualizar o lead");
    }
  };

  // Add new lead
  const handleAddLead = async (values: LeadFormValues) => {
    try {
      // Valores já contém user_id adicionado pela função withUserId
      const leadData = {
        ...values,
        company: values.company || null,
        email: values.email || null,
        phone: values.phone || null,
        notes: values.notes || null
      };

      const { data, error } = await supabase
        .from("leads")
        .insert(leadData)
        .select();

      if (error) throw error;

      toast.success("Lead adicionado com sucesso!");
      setIsAddDialogOpen(false);
      fetchLeads();
    } catch (error: any) {
      console.error("Erro ao adicionar lead:", error.message);
      toast.error("Não foi possível adicionar o lead");
    }
  };

  // Add task to lead
  const handleAddTask = async (values: TaskFormValues) => {
    if (!selectedLead || !user) return;
    
    try {
      // Converting Date to ISO string
      const formattedDueDate = values.due_date ? values.due_date.toISOString() : null;
      
      const { data, error } = await supabase
        .from("lead_tasks")
        .insert({
          lead_id: selectedLead.id,
          title: values.title,
          description: values.description || "",
          due_date: formattedDueDate,
          status: values.status,
          user_id: user.id
        })
        .select();

      if (error) throw error;

      toast.success("Tarefa adicionada com sucesso!");
      fetchLeadTasks(selectedLead.id);
      setActiveTab("tasks");
    } catch (error: any) {
      console.error("Erro ao adicionar tarefa:", error.message);
      toast.error("Não foi possível adicionar a tarefa");
    }
  };

  // Save notes
  const handleSaveNote = async (values: NoteFormValues) => {
    if (!selectedLead) return;

    try {
      const { data, error } = await supabase
        .from("leads")
        .update({ notes: values.content })
        .eq("id", selectedLead.id)
        .select();

      if (error) throw error;

      toast.success("Nota salva com sucesso!");
      setSelectedLead({ ...selectedLead, notes: values.content });
      
      // Update in local list
      setLeads(leads.map(lead => 
        lead.id === selectedLead.id ? { ...lead, notes: values.content } : lead
      ));
    } catch (error: any) {
      console.error("Erro ao salvar nota:", error.message);
      toast.error("Não foi possível salvar a nota");
    }
  };

  // Convert lead to client
  const handleConvertToClient = async () => {
    if (!selectedLead || !user) return;

    try {
      // Create client from lead data
      const { data: clientData, error: clientError } = await supabase
        .from("clients")
        .insert({
          name: selectedLead.name,
          company: selectedLead.company,
          email: selectedLead.email,
          phone: selectedLead.phone,
          notes: selectedLead.notes,
          status: "Ativo",
          user_id: user.id
        })
        .select();

      if (clientError) throw clientError;

      // Transfer lead tasks to client
      if (leadTasks.length > 0 && clientData && clientData[0]) {
        const clientId = clientData[0].id;
        
        // Convert tasks
        for (const task of leadTasks) {
          await supabase
            .from("client_tasks")
            .insert({
              client_id: clientId,
              title: task.title,
              description: task.description,
              due_date: task.due_date,
              status: task.status,
              user_id: user.id
            });
        }
      }

      // Mark lead as converted
      await supabase
        .from("leads")
        .update({ status: "Convertido" })
        .eq("id", selectedLead.id);

      toast.success("Lead convertido para cliente com sucesso!");
      setIsConvertDialogOpen(false);
      setIsViewDialogOpen(false);
      fetchLeads();
    } catch (error: any) {
      console.error("Erro ao converter lead:", error.message);
      toast.error("Não foi possível converter o lead para cliente");
    }
  };

  // Update task status
  const updateTaskStatus = async (taskId: string, newStatus: string) => {
    try {
      const { data, error } = await supabase
        .from("lead_tasks")
        .update({ status: newStatus })
        .eq("id", taskId)
        .select();

      if (error) throw error;

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

  // Effect to load leads and statuses on mount or sort criteria change
  useEffect(() => {
    fetchLeads();
    fetchLeadStatuses();
  }, [sortField, sortDirection]);

  // Effect to update note form when selected lead changes
  useEffect(() => {
    if (selectedLead && selectedLead.notes) {
      noteForm.setValue("content", selectedLead.notes);
    } else {
      noteForm.setValue("content", "");
    }
  }, [selectedLead, activeTab]);

  const filteredLeads = getFilteredLeads();

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
        onSaveNote={handleSaveNote}
      />

      <LeadConvertDialog 
        isOpen={isConvertDialogOpen}
        onClose={() => setIsConvertDialogOpen(false)}
        onConvert={handleConvertToClient}
        lead={selectedLead}
        taskCount={leadTasks.length}
      />
    </div>
  );
};

export default Leads;
