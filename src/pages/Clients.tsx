import React, { useState } from "react";
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

// Dados de exemplo - apenas clientes (sem leads)
const clients = [
  {
    id: "CL-001",
    name: "João Silva",
    company: "ABC Tecnologia",
    email: "joao@abctech.com",
    phone: "(11) 98765-4321",
    status: "Ativo",
    group: "Tecnologia"
  },
  {
    id: "CL-003",
    name: "Carlos Santos",
    company: "Supermercados Sul",
    email: "carlos@sulmercados.com",
    phone: "(21) 99876-5432",
    status: "Ativo",
    group: "Varejo"
  },
  {
    id: "CL-005",
    name: "Roberto Almeida",
    company: "Tech Solutions",
    email: "roberto@techsolutions.com",
    phone: "(41) 99988-7766",
    status: "Inativo",
    group: "Tecnologia"
  },
  {
    id: "CL-006",
    name: "Fernanda Lima",
    company: "Lima & Associados",
    email: "fernanda@limaassociados.com",
    phone: "(51) 97766-5544",
    status: "Ativo",
    group: "Serviços"
  }
];

// Dados de grupos de clientes
const clientGroups = [
  "Tecnologia",
  "Varejo",
  "Serviços",
  "Saúde",
  "Educação",
  "Outro"
];

const ITEMS_PER_PAGE = 2; // For demonstration purposes, using a small number

const Clients = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [sortField, setSortField] = useState("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [activeTab, setActiveTab] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [newClientGroup, setNewClientGroup] = useState("");

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
    ? filteredByStatus.filter(client => client.group === selectedGroup)
    : filteredByStatus;

  // Finally apply search term
  const filteredClients = filteredByGroup.filter((client) => {
    return (
      client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.email.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  // Sort the filtered clients
  const sortedClients = [...filteredClients].sort((a: any, b: any) => {
    if (sortDirection === "asc") {
      return a[sortField] > b[sortField] ? 1 : -1;
    } else {
      return a[sortField] < b[sortField] ? 1 : -1;
    }
  });

  // Apply pagination
  const totalPages = Math.ceil(sortedClients.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedClients = sortedClients.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const handleViewClient = (client: any) => {
    setSelectedClient(client);
    setIsViewDialogOpen(true);
  };

  const handleAddClient = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Cliente adicionado com sucesso!");
    setIsAddDialogOpen(false);
  };

  const handleUpdateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedClient && newClientGroup) {
      // In a real app, this would update the database
      toast.success(`Grupo do cliente ${selectedClient.name} alterado para ${newClientGroup}`);
    }
    setIsViewDialogOpen(false);
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

  return (
    <div className="space-y-6">
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
                      <Input id="name" placeholder="Nome completo" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="company">Empresa</Label>
                      <Input id="company" placeholder="Nome da empresa" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">E-mail</Label>
                      <Input id="email" type="email" placeholder="email@exemplo.com" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Telefone</Label>
                      <Input id="phone" placeholder="(00) 00000-0000" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="status">Status</Label>
                      <Select defaultValue="active">
                        <SelectTrigger id="status">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Ativo</SelectItem>
                          <SelectItem value="inactive">Inativo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="group">Grupo</Label>
                      <Select defaultValue="none">
                        <SelectTrigger id="group">
                          <SelectValue placeholder="Selecione um grupo" />
                        </SelectTrigger>
                        <SelectContent>
                          {clientGroups.map(group => (
                            <SelectItem key={group} value={group}>{group}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Observações</Label>
                    <Textarea id="notes" placeholder="Adicione informações relevantes sobre este cliente" />
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
                                  <SelectItem key={group} value={group}>{group}</SelectItem>
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
                    <Button className="w-full">
                      <Plus className="mr-2 h-4 w-4" />
                      Adicionar Tarefa
                    </Button>
                  </TabsContent>
                  <TabsContent value="notes">
                    <Textarea className="mb-4" placeholder="Adicione uma nota sobre este cliente..." />
                    <Button>Salvar Nota</Button>
                  </TabsContent>
                </Tabs>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
                    Fechar
                  </Button>
                  <Button>Editar Cliente</Button>
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
          <Select value={selectedGroup || "all"} onValueChange={(value) => setSelectedGroup(value === "all" ? null : value)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filtrar por grupo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os grupos</SelectItem>
              {clientGroups.map(group => (
                <SelectItem key={group} value={group}>{group}</SelectItem>
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
                    <TableCell>{client.company}</TableCell>
                    <TableCell>{client.email}</TableCell>
                    <TableCell>{client.phone}</TableCell>
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
