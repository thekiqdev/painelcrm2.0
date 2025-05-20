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
import { Search, Plus, FileText, MoreVertical, UserPlus, ArrowDown, ArrowUp, Filter } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// Opções para quantidade de itens por página
const itemsPerPageOptions = [10, 25, 50, 100];

const Clients = () => {
  const [clients, setClients] = useState<any[]>([]);
  const [clientGroups, setClientGroups] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [sortField, setSortField] = useState("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [activeTab, setActiveTab] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [newClientGroup, setNewClientGroup] = useState("");
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [isLoading, setIsLoading] = useState(true);
  const [noteContent, setNoteContent] = useState("");
  
  // New client data state
  const [newClient, setNewClient] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    status: "Ativo",
    group_id: "",
    notes: ""
  });
  
  // Edited client state (for edit mode)
  const [editedClient, setEditedClient] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    status: "",
    group_id: "",
    notes: ""
  });

  // Carregar clientes e grupos do Supabase
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Carregar grupos de clientes
        const { data: groupsData, error: groupsError } = await supabase
          .from("client_groups")
          .select("*")
          .order("name");

        if (groupsError) throw groupsError;
        setClientGroups(groupsData || []);

        // Carregar clientes
        const { data: clientsData, error: clientsError } = await supabase
          .from("clients")
          .select(`
            *,
            client_groups (id, name)
          `);

        if (clientsError) throw clientsError;
        
        // Formatar os dados dos clientes
        const formattedClients = clientsData?.map(client => ({
          id: client.id,
          name: client.name,
          company: client.company,
          email: client.email,
          phone: client.phone,
          status: client.status,
          group: client.client_groups?.name || "",
          group_id: client.group_id,
          notes: client.notes
        }));

        setClients(formattedClients || []);
      } catch (error) {
        console.error("Erro ao carregar dados:", error);
        toast.error("Erro ao carregar os dados. Tente novamente.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

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

  // Apply pagination with dynamic itemsPerPage
  const totalPages = Math.ceil(sortedClients.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedClients = sortedClients.slice(startIndex, startIndex + itemsPerPage);

  const handleViewClient = (client: any) => {
    setSelectedClient(client);
    setNewClientGroup(client.group_id || "");
    setNoteContent(client.notes || "");
    setIsEditMode(false);
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
        notes: selectedClient.notes || ""
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
        const { error } = await supabase
          .from("clients")
          .update({
            name: editedClient.name,
            company: editedClient.company,
            email: editedClient.email,
            phone: editedClient.phone,
            status: editedClient.status,
            group_id: editedClient.group_id || null,
            notes: editedClient.notes
          })
          .eq("id", selectedClient.id);
          
        if (error) throw error;
        
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
              notes: editedClient.notes
            };
          }
          return client;
        });
        
        setClients(updatedClients);
        setSelectedClient({
          ...selectedClient,
          name: editedClient.name,
          company: editedClient.company,
          email: editedClient.email,
          phone: editedClient.phone,
          status: editedClient.status,
          group_id: editedClient.group_id,
          group: clientGroups.find(g => g.id === editedClient.group_id)?.name || "",
          notes: editedClient.notes
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
      // Inserir novo cliente no Supabase
      const { data, error } = await supabase
        .from("clients")
        .insert({
          name: newClient.name,
          company: newClient.company,
          email: newClient.email,
          phone: newClient.phone,
          status: newClient.status,
          group_id: newClient.group_id || null,
          notes: newClient.notes
        })
        .select(`
          *,
          client_groups (id, name)
        `)
        .single();
      
      if (error) throw error;
      
      // Formatar o cliente adicionado
      const addedClient = {
        id: data.id,
        name: data.name,
        company: data.company,
        email: data.email,
        phone: data.phone,
        status: data.status,
        group: data.client_groups?.name || "",
        group_id: data.group_id,
        notes: data.notes
      };
      
      // Adicionar o novo cliente à lista
      setClients([...clients, addedClient]);
      
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
        notes: ""
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
        // Atualizar o grupo do cliente no Supabase
        const { error } = await supabase
          .from("clients")
          .update({ group_id: newClientGroup })
          .eq("id", selectedClient.id);
        
        if (error) throw error;
        
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
        
        // Atualizar o cliente selecionado
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
  
  const handleSaveNote = async () => {
    if (!selectedClient) return;
    
    try {
      const { error } = await supabase
        .from("clients")
        .update({ notes: noteContent })
        .eq("id", selectedClient.id);
      
      if (error) throw error;
      
      // Atualizar o cliente na lista local
      const updatedClients = clients.map(client => {
        if (client.id === selectedClient.id) {
          return { ...client, notes: noteContent };
        }
        return client;
      });
      
      setClients(updatedClients);
      
      // Atualizar o cliente selecionado
      setSelectedClient({
        ...selectedClient,
        notes: noteContent
      });
      
      toast.success("Anotação salva com sucesso!");
    } catch (error: any) {
      console.error("Erro ao salvar anotação:", error);
      toast.error(`Erro ao salvar anotação: ${error.message}`);
    }
  };
  
  // Função para criar uma nova tarefa para o cliente
  const handleAddTask = async () => {
    if (!selectedClient) return;
    
    // Aqui seria implementada a lógica para adicionar uma tarefa
    // que se integra com o sistema de tarefas do projeto
    toast.info("Funcionalidade de adicionar tarefa será implementada em breve.");
    
    // Na implementação real, essa tarefa deveria ser adicionada à tabela de tarefas
    // e relacionada ao cliente atual
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

  return (
    <div className="space-y-6">
      {/* Título e botões */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-4 sm:space-y-0">
        <h1 className="text-2xl font-bold">Clientes</h1>
        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Buscar clientes..."
              className="pl-8 w-full sm:w-[250px]"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Novo Cliente
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
                <Tabs defaultValue="details" className="w-full">
                  <TabsList className="grid grid-cols-4 mb-4">
                    <TabsTrigger value="details">Detalhes</TabsTrigger>
                    <TabsTrigger value="opportunities">Oportunidades</TabsTrigger>
                    <TabsTrigger value="tasks">Tarefas</TabsTrigger>
                    <TabsTrigger value="notes">Anotações</TabsTrigger>
                  </TabsList>
                  <TabsContent value="details">
                    {renderClientDetails()}
                  </TabsContent>
                  <TabsContent value="opportunities">
                    <p className="text-sm text-muted-foreground text-center py-6">
                      Nenhuma oportunidade encontrada para este cliente.
                    </p>
                    <Button className="w-full">
                      <Plus className="mr-2 h-4 w-4" />
                      Adicionar Oportunidade
                    </Button>
                  </TabsContent>
                  <TabsContent value="tasks">
                    <p className="text-sm text-muted-foreground text-center py-6">
                      Nenhuma tarefa encontrada para este cliente.
                    </p>
                    <Button className="w-full" onClick={handleAddTask}>
                      <Plus className="mr-2 h-4 w-4" />
                      Adicionar Tarefa
                    </Button>
                  </TabsContent>
                  <TabsContent value="notes">
                    <Textarea 
                      className="mb-4" 
                      placeholder="Adicione uma nota sobre este cliente..." 
                      value={noteContent}
                      onChange={(e) => setNoteContent(e.target.value)}
                    />
                    <Button onClick={handleSaveNote}>Salvar Nota</Button>
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
                      <Button onClick={handleEditClient}>
                        Editar Cliente
                      </Button>
                    </>
                  )}
                </DialogFooter>
              </DialogContent>
            )}
          </Dialog>
        </div>
      </div>

      {/* Tabs e Filtros */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0">
        <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">Todos</TabsTrigger>
            <TabsTrigger value="active">Ativos</TabsTrigger>
            <TabsTrigger value="inactive">Inativos</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <Select 
            value={selectedGroup || "all"} 
            onValueChange={(value) => setSelectedGroup(value === "all" ? null : value)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filtrar por grupo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os grupos</SelectItem>
              {clientGroups.map(group => (
                <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4 mr-2" />
            Mais Filtros
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-0">
          <CardTitle>Lista de Clientes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row justify-between mb-4">
            <div className="mb-2 sm:mb-0">
              <p className="text-sm text-muted-foreground">
                Mostrando {paginatedClients.length} de {filteredClients.length} clientes
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm">Mostrar</span>
              <Select 
                value={itemsPerPage.toString()} 
                onValueChange={(value) => {
                  setItemsPerPage(Number(value));
                  setCurrentPage(1); // Reset to first page when changing items per page
                }}
              >
                <SelectTrigger className="w-[80px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {itemsPerPageOptions.map(option => (
                    <SelectItem key={option} value={option.toString()}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-sm">por página</span>
            </div>
          </div>
          
          {isLoading ? (
            <div className="py-10 text-center">
              <p className="text-muted-foreground">Carregando clientes...</p>
            </div>
          ) : (
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
                  <TableHead>Grupo</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedClients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      Nenhum cliente encontrado com os critérios de busca
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedClients.map((client) => (
                    <TableRow key={client.id} className="cursor-pointer" onClick={() => handleViewClient(client)}>
                      <TableCell>{client.name}</TableCell>
                      <TableCell>{client.company || "—"}</TableCell>
                      <TableCell>{client.email || "—"}</TableCell>
                      <TableCell>{client.phone || "—"}</TableCell>
                      <TableCell>
                        <Badge 
                          variant={
                            client.status === "Ativo" ? "default" :
                            client.status === "Inativo" ? "destructive" :
                            "outline"
                          }
                        >
                          {client.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{client.group || "—"}</TableCell>
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
                              setSelectedClient(client);
                              handleEditClient();
                              setIsViewDialogOpen(true);
                            }}>
                              <FileText className="h-4 w-4 mr-2" />
                              Editar Cliente
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <UserPlus className="h-4 w-4 mr-2" />
                              Adicionar Oportunidade
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <FileText className="h-4 w-4 mr-2" />
                              Gerar Proposta
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}

          <div className="mt-4">
            <Pagination>
              <PaginationContent>
                {renderPagination()}
              </PaginationContent>
            </Pagination>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Clients;
