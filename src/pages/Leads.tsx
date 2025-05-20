
import React, { useState, useEffect } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Search, Plus, FileText, MoreVertical, UserPlus, ArrowDown, ArrowUp, Filter, Edit, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useForm, FormProvider, useFormContext } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

// Esquemas de validação com Zod
const leadFormSchema = z.object({
  name: z.string().min(2, { message: "Nome é obrigatório" }),
  company: z.string().optional(),
  email: z.string().email({ message: "E-mail inválido" }).optional().or(z.literal("")),
  phone: z.string().optional(),
  status: z.string(),
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
  
  // Form para adicionar novo lead
  const leadForm = useForm<LeadFormValues>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: {
      name: "",
      company: "",
      email: "",
      phone: "",
      status: "Novo",
      notes: "",
    },
  });

  // Form para editar lead
  const editLeadForm = useForm<LeadFormValues>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: {
      name: "",
      company: "",
      email: "",
      phone: "",
      status: "Novo",
      notes: "",
    },
  });

  // Form para adicionar tarefa
  const taskForm = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: "",
      description: "",
      due_date: null,
      status: "Pendente",
    },
  });

  // Form para adicionar nota
  const noteForm = useForm<NoteFormValues>({
    resolver: zodResolver(noteFormSchema),
    defaultValues: {
      content: "",
    },
  });

  // Buscar status de leads
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
        // Status padrão se não houver nenhum cadastrado
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

  // Obter leads do Supabase
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

  // Buscar tarefas quando um lead é selecionado
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

  // Ordenar leads
  const handleSort = (field: string) => {
    if (field === sortField) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Filtrar leads
  const filteredLeads = leads.filter((lead) => {
    return (
      lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lead.company && lead.company.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (lead.email && lead.email.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  });

  // Visualizar detalhes do lead
  const handleViewLead = async (lead: any) => {
    setSelectedLead(lead);
    setIsViewDialogOpen(true);
    setActiveTab("details");
    await fetchLeadTasks(lead.id);
  };

  // Preparar para editar lead
  const handleEditLead = (lead: any) => {
    setSelectedLead(lead);
    editLeadForm.reset({
      name: lead.name,
      company: lead.company || "",
      email: lead.email || "",
      phone: lead.phone || "",
      status: lead.status,
      notes: lead.notes || "",
    });
    setIsEditDialogOpen(true);
  };

  // Salvar edição do lead
  const handleSaveEdit = async (values: LeadFormValues) => {
    if (!selectedLead) return;

    try {
      const leadData = {
        name: values.name,
        company: values.company || null,
        email: values.email || null,
        phone: values.phone || null,
        status: values.status,
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
      
      // Atualizar o lead na lista local
      setLeads(leads.map(lead => 
        lead.id === selectedLead.id ? { ...lead, ...leadData } : lead
      ));
      
      // Atualizar lead selecionado se estiver sendo visualizado
      if (isViewDialogOpen && selectedLead) {
        setSelectedLead({ ...selectedLead, ...leadData });
      }
    } catch (error: any) {
      console.error("Erro ao atualizar lead:", error.message);
      toast.error("Não foi possível atualizar o lead");
    }
  };

  // Adicionar novo lead
  const handleAddLead = async (values: LeadFormValues) => {
    try {
      // Make sure the values object meets the type requirements of Supabase
      const leadData = {
        name: values.name, // This is required
        company: values.company || null,
        email: values.email || null,
        phone: values.phone || null,
        status: values.status,
        notes: values.notes || null,
      };

      const { data, error } = await supabase
        .from("leads")
        .insert(leadData)
        .select();

      if (error) throw error;

      toast.success("Lead adicionado com sucesso!");
      setIsAddDialogOpen(false);
      leadForm.reset();
      fetchLeads();
    } catch (error: any) {
      console.error("Erro ao adicionar lead:", error.message);
      toast.error("Não foi possível adicionar o lead");
    }
  };

  // Adicionar tarefa ao lead
  const handleAddTask = async (values: TaskFormValues) => {
    if (!selectedLead) return;
    
    try {
      // Convertendo o objeto Date para string no formato ISO
      const formattedDueDate = values.due_date ? values.due_date.toISOString() : null;
      
      const { data, error } = await supabase
        .from("lead_tasks")
        .insert({
          lead_id: selectedLead.id,
          title: values.title,
          description: values.description || "",
          due_date: formattedDueDate,
          status: values.status
        })
        .select();

      if (error) throw error;

      toast.success("Tarefa adicionada com sucesso!");
      taskForm.reset();
      fetchLeadTasks(selectedLead.id);
      setActiveTab("tasks");
    } catch (error: any) {
      console.error("Erro ao adicionar tarefa:", error.message);
      toast.error("Não foi possível adicionar a tarefa");
    }
  };

  // Salvar nota (atualizar o lead)
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
      
      // Atualizar na lista local
      setLeads(leads.map(lead => 
        lead.id === selectedLead.id ? { ...lead, notes: values.content } : lead
      ));
    } catch (error: any) {
      console.error("Erro ao salvar nota:", error.message);
      toast.error("Não foi possível salvar a nota");
    }
  };

  // Atualizar status da tarefa
  const updateTaskStatus = async (taskId: string, newStatus: string) => {
    try {
      const { data, error } = await supabase
        .from("lead_tasks")
        .update({ status: newStatus })
        .eq("id", taskId)
        .select();

      if (error) throw error;

      toast.success("Status atualizado com sucesso!");
      fetchLeadTasks(selectedLead.id);
    } catch (error: any) {
      console.error("Erro ao atualizar status:", error.message);
      toast.error("Não foi possível atualizar o status");
    }
  };

  // Efeito para carregar leads e status quando componente montar ou critérios de ordenação mudarem
  useEffect(() => {
    fetchLeads();
    fetchLeadStatuses();
  }, [sortField, sortDirection]);

  // Efeito para preparar o formulário de notas quando o lead selecionado mudar
  useEffect(() => {
    if (selectedLead && selectedLead.notes) {
      noteForm.setValue("content", selectedLead.notes);
    } else {
      noteForm.setValue("content", "");
    }
  }, [selectedLead, activeTab]);

  const SortIcon = ({ field }: { field: string }) => {
    if (field !== sortField) return null;
    return sortDirection === "asc" ? <ArrowUp className="ml-1 h-4 w-4" /> : <ArrowDown className="ml-1 h-4 w-4" />;
  };

  const getStatusVariant = (status: string) => {
    const foundStatus = leadStatuses.find(s => s.name === status);
    return foundStatus ? { color: foundStatus.color } : { color: "#6E56CF" };
  };

  const getTaskStatusVariant = (status: string) => {
    switch (status) {
      case "Pendente": return "outline";
      case "Em andamento": return "secondary";
      case "Concluído": return "default";
      case "Cancelado": return "destructive";
      default: return "outline";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-4 sm:space-y-0">
        <h1 className="text-2xl font-bold">Leads</h1>
        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Buscar leads..."
              className="pl-8 w-full sm:w-[250px]"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Novo Lead
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Adicionar Lead</DialogTitle>
                <DialogDescription>
                  Preencha os dados para adicionar um novo lead ao sistema.
                </DialogDescription>
              </DialogHeader>
              <Form {...leadForm}>
                <form onSubmit={leadForm.handleSubmit(handleAddLead)}>
                  <div className="grid gap-6 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={leadForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nome</FormLabel>
                            <FormControl>
                              <Input placeholder="Nome completo" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={leadForm.control}
                        name="company"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Empresa</FormLabel>
                            <FormControl>
                              <Input placeholder="Nome da empresa" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={leadForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>E-mail</FormLabel>
                            <FormControl>
                              <Input type="email" placeholder="email@exemplo.com" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={leadForm.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Telefone</FormLabel>
                            <FormControl>
                              <Input placeholder="(00) 00000-0000" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={leadForm.control}
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
                              {leadStatuses.map(status => (
                                <SelectItem key={status.id} value={status.name}>
                                  <div className="flex items-center">
                                    <div 
                                      className="w-3 h-3 rounded-full mr-2" 
                                      style={{ backgroundColor: status.color }}
                                    />
                                    {status.name}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={leadForm.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Observações</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Adicione informações relevantes sobre este lead" 
                              className="min-h-[100px]" 
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit">Salvar Lead</Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

          {/* Dialog de edição de Lead */}
          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Editar Lead</DialogTitle>
                <DialogDescription>
                  Atualize os dados do lead no sistema.
                </DialogDescription>
              </DialogHeader>
              <Form {...editLeadForm}>
                <form onSubmit={editLeadForm.handleSubmit(handleSaveEdit)}>
                  <div className="grid gap-6 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={editLeadForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nome</FormLabel>
                            <FormControl>
                              <Input placeholder="Nome completo" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={editLeadForm.control}
                        name="company"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Empresa</FormLabel>
                            <FormControl>
                              <Input placeholder="Nome da empresa" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={editLeadForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>E-mail</FormLabel>
                            <FormControl>
                              <Input type="email" placeholder="email@exemplo.com" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={editLeadForm.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Telefone</FormLabel>
                            <FormControl>
                              <Input placeholder="(00) 00000-0000" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={editLeadForm.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione o status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {leadStatuses.map(status => (
                                <SelectItem key={status.id} value={status.name}>
                                  <div className="flex items-center">
                                    <div 
                                      className="w-3 h-3 rounded-full mr-2" 
                                      style={{ backgroundColor: status.color }}
                                    />
                                    {status.name}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={editLeadForm.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Observações</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Adicione informações relevantes sobre este lead" 
                              className="min-h-[100px]" 
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit">
                      <Save className="mr-2 h-4 w-4" />
                      Salvar Alterações
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

          <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
            {selectedLead && (
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {selectedLead.name}
                    <Badge 
                      variant="outline" 
                      style={{ 
                        backgroundColor: getStatusVariant(selectedLead.status).color,
                        color: '#fff'
                      }}
                    >
                      {selectedLead.status}
                    </Badge>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="ml-auto" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditLead(selectedLead);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </DialogTitle>
                  <DialogDescription>{selectedLead.company}</DialogDescription>
                </DialogHeader>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsList className="grid grid-cols-4 mb-4">
                    <TabsTrigger value="details">Detalhes</TabsTrigger>
                    <TabsTrigger value="tasks">Tarefas</TabsTrigger>
                    <TabsTrigger value="notes">Anotações</TabsTrigger>
                    <TabsTrigger value="opportunities">Oportunidades</TabsTrigger>
                  </TabsList>
                  <TabsContent value="details">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label>E-mail</Label>
                        <p className="text-sm">{selectedLead.email || "Não informado"}</p>
                      </div>
                      <div className="space-y-1">
                        <Label>Telefone</Label>
                        <p className="text-sm">{selectedLead.phone || "Não informado"}</p>
                      </div>
                      <div className="space-y-1">
                        <Label>Empresa</Label>
                        <p className="text-sm">{selectedLead.company || "Não informado"}</p>
                      </div>
                      <div className="space-y-1">
                        <Label>Status</Label>
                        <p className="text-sm">
                          <Badge 
                            variant="outline"
                            style={{ 
                              backgroundColor: getStatusVariant(selectedLead.status).color,
                              color: '#fff'
                            }}
                          >
                            {selectedLead.status}
                          </Badge>
                        </p>
                      </div>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="tasks">
                    <div className="space-y-4">
                      <Form {...taskForm}>
                        <form onSubmit={taskForm.handleSubmit(handleAddTask)} className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <FormField
                              control={taskForm.control}
                              name="title"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Título</FormLabel>
                                  <FormControl>
                                    <Input placeholder="Título da tarefa" {...field} />
                                  </FormControl>
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
                                        <SelectValue placeholder="Selecione" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="Pendente">Pendente</SelectItem>
                                      <SelectItem value="Em andamento">Em andamento</SelectItem>
                                      <SelectItem value="Concluído">Concluído</SelectItem>
                                      <SelectItem value="Cancelado">Cancelado</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <FormField
                            control={taskForm.control}
                            name="description"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Descrição</FormLabel>
                                <FormControl>
                                  <Textarea placeholder="Descreva a tarefa" {...field} />
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
                                <FormControl>
                                  <Input
                                    type="date"
                                    value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''}
                                    onChange={(e) => {
                                      const value = e.target.value ? new Date(e.target.value) : null;
                                      field.onChange(value);
                                    }}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <Button type="submit" className="w-full">
                            <Plus className="mr-2 h-4 w-4" />
                            Adicionar Tarefa
                          </Button>
                        </form>
                      </Form>

                      <div className="space-y-2 mt-6">
                        <h3 className="text-lg font-medium">Tarefas existentes</h3>
                        {leadTasks.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-6">
                            Nenhuma tarefa encontrada para este lead.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {leadTasks.map((task) => (
                              <Card key={task.id}>
                                <CardContent className="p-4">
                                  <div className="flex justify-between items-start">
                                    <div>
                                      <h4 className="font-medium">{task.title}</h4>
                                      <p className="text-sm text-muted-foreground">{task.description}</p>
                                      {task.due_date && (
                                        <p className="text-xs mt-1">
                                          Vencimento: {new Date(task.due_date).toLocaleDateString()}
                                        </p>
                                      )}
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <Badge variant={getTaskStatusVariant(task.status)}>{task.status}</Badge>
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button variant="ghost" size="icon">
                                            <MoreVertical className="h-4 w-4" />
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                          <DropdownMenuLabel>Ações</DropdownMenuLabel>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem onClick={() => updateTaskStatus(task.id, "Pendente")}>
                                            Marcar como Pendente
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => updateTaskStatus(task.id, "Em andamento")}>
                                            Marcar como Em andamento
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => updateTaskStatus(task.id, "Concluído")}>
                                            Marcar como Concluído
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => updateTaskStatus(task.id, "Cancelado")}>
                                            Marcar como Cancelado
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="notes">
                    <Form {...noteForm}>
                      <form onSubmit={noteForm.handleSubmit(handleSaveNote)}>
                        <FormField
                          control={noteForm.control}
                          name="content"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Anotações sobre o lead</FormLabel>
                              <FormControl>
                                <Textarea 
                                  className="min-h-[200px]" 
                                  placeholder="Adicione informações importantes sobre este lead..." 
                                  {...field} 
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <Button className="mt-4">Salvar Anotações</Button>
                      </form>
                    </Form>
                  </TabsContent>

                  <TabsContent value="opportunities">
                    <p className="text-sm text-muted-foreground text-center py-6">
                      Nenhuma oportunidade encontrada para este lead.
                    </p>
                    <Button className="w-full">
                      <Plus className="mr-2 h-4 w-4" />
                      Adicionar Oportunidade
                    </Button>
                  </TabsContent>
                </Tabs>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
                    Fechar
                  </Button>
                </DialogFooter>
              </DialogContent>
            )}
          </Dialog>
        </div>
      </div>

      {/* Tabs e Filtros */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0">
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">Todos</TabsTrigger>
            {leadStatuses.map(status => (
              <TabsTrigger key={status.id} value={status.name.toLowerCase().replace(/\s+/g, '-')}>
                {status.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Button variant="outline" size="sm">
          <Filter className="h-4 w-4 mr-2" />
          Filtros
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-0">
          <CardTitle>Lista de Leads</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer" onClick={() => handleSort("name")}>
                  <div className="flex items-center">
                    Nome
                    <SortIcon field="name" />
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleSort("company")}>
                  <div className="flex items-center">
                    Empresa
                    <SortIcon field="company" />
                  </div>
                </TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Nenhum lead encontrado com os critérios de busca
                  </TableCell>
                </TableRow>
              ) : (
                filteredLeads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell 
                      className="cursor-pointer hover:underline"
                      onClick={() => handleViewLead(lead)}
                    >
                      {lead.name}
                    </TableCell>
                    <TableCell>{lead.company || "-"}</TableCell>
                    <TableCell>{lead.email || "-"}</TableCell>
                    <TableCell>{lead.phone || "-"}</TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline"
                        style={{ 
                          backgroundColor: getStatusVariant(lead.status).color,
                          color: '#fff'
                        }}
                      >
                        {lead.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Ações</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            handleEditLead(lead);
                          }}>
                            <Edit className="h-4 w-4 mr-2" />
                            Editar Lead
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            handleViewLead(lead);
                            setActiveTab("tasks");
                          }}>
                            <Plus className="h-4 w-4 mr-2" />
                            Adicionar Tarefa
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <UserPlus className="h-4 w-4 mr-2" />
                            Adicionar Oportunidade
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <FileText className="h-4 w-4 mr-2" />
                            Converter para Cliente
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

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
    </div>
  );
};

export default Leads;
