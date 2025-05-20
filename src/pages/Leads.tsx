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

// Dados de exemplo - apenas leads
const leads = [
  {
    id: "LD-001",
    name: "Maria Oliveira",
    company: "Construtora XYZ",
    email: "maria@xyz.com",
    phone: "(11) 91234-5678",
    status: "Novo",
  },
  {
    id: "LD-002",
    name: "Ana Pereira",
    company: "Consultoria Global",
    email: "ana@consultoriaglobal.com",
    phone: "(31) 98877-6655",
    status: "Em contato",
  },
  {
    id: "LD-003",
    name: "Paulo Henrique",
    company: "Tech Digital",
    email: "paulo@techdigital.com",
    phone: "(21) 98765-4321",
    status: "Qualificado",
  },
  {
    id: "LD-004",
    name: "Julia Mendes",
    company: "Arquitetura JM",
    email: "julia@arquiteturajm.com",
    phone: "(41) 97654-3210",
    status: "Novo",
  }
];

const Leads = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [sortField, setSortField] = useState("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const handleSort = (field: string) => {
    if (field === sortField) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortedLeads = [...leads].sort((a: any, b: any) => {
    if (sortDirection === "asc") {
      return a[sortField] > b[sortField] ? 1 : -1;
    } else {
      return a[sortField] < b[sortField] ? 1 : -1;
    }
  });

  const filteredLeads = sortedLeads.filter((lead) => {
    return (
      lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.email.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const handleViewLead = (lead: any) => {
    setSelectedLead(lead);
    setIsViewDialogOpen(true);
  };

  const handleAddLead = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Lead adicionado com sucesso!");
    setIsAddDialogOpen(false);
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (field !== sortField) return null;
    return sortDirection === "asc" ? <ArrowUp className="ml-1 h-4 w-4" /> : <ArrowDown className="ml-1 h-4 w-4" />;
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "Novo": return "outline";
      case "Em contato": return "secondary";
      case "Qualificado": return "default";
      case "Perdido": return "destructive";
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
              <form onSubmit={handleAddLead}>
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
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="status">Status</Label>
                      <Select defaultValue="new">
                        <SelectTrigger id="status">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">Novo</SelectItem>
                          <SelectItem value="contacted">Em contato</SelectItem>
                          <SelectItem value="qualified">Qualificado</SelectItem>
                          <SelectItem value="lost">Perdido</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Observações</Label>
                    <Textarea id="notes" placeholder="Adicione informações relevantes sobre este lead" />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit">Salvar Lead</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
            {selectedLead && (
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {selectedLead.name}
                    <Badge variant="outline">Lead</Badge>
                  </DialogTitle>
                  <DialogDescription>{selectedLead.company}</DialogDescription>
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
                        <p className="text-sm">{selectedLead.email}</p>
                      </div>
                      <div className="space-y-1">
                        <Label>Telefone</Label>
                        <p className="text-sm">{selectedLead.phone}</p>
                      </div>
                      <div className="space-y-1">
                        <Label>Empresa</Label>
                        <p className="text-sm">{selectedLead.company}</p>
                      </div>
                      <div className="space-y-1">
                        <Label>Status</Label>
                        <p className="text-sm">
                          <Badge variant={getStatusVariant(selectedLead.status)}>
                            {selectedLead.status}
                          </Badge>
                        </p>
                      </div>
                    </div>
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
                  <TabsContent value="tasks">
                    <p className="text-sm text-muted-foreground text-center py-6">
                      Nenhuma tarefa encontrada para este lead.
                    </p>
                    <Button className="w-full">
                      <Plus className="mr-2 h-4 w-4" />
                      Adicionar Tarefa
                    </Button>
                  </TabsContent>
                  <TabsContent value="notes">
                    <Textarea className="mb-4" placeholder="Adicione uma nota sobre este lead..." />
                    <Button>Salvar Nota</Button>
                  </TabsContent>
                </Tabs>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
                    Fechar
                  </Button>
                  <Button>Editar Lead</Button>
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
            <TabsTrigger value="new">Novos</TabsTrigger>
            <TabsTrigger value="contacted">Em contato</TabsTrigger>
            <TabsTrigger value="qualified">Qualificados</TabsTrigger>
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
                  <TableRow key={lead.id} className="cursor-pointer" onClick={() => handleViewLead(lead)}>
                    <TableCell>{lead.name}</TableCell>
                    <TableCell>{lead.company}</TableCell>
                    <TableCell>{lead.email}</TableCell>
                    <TableCell>{lead.phone}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(lead.status)}>
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
