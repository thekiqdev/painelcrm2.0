
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Plus, MoreHorizontal, Calendar, DollarSign, Edit, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Deal = {
  id: string;
  title: string;
  client: string;
  amount: string;
  probability: number;
  dueDate: string;
  stage: string;
  funnelId: string;
};

type SalesFunnel = {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
  createdAt: string;
};

// Exemplo de lista de funis de vendas
const initialFunnels: SalesFunnel[] = [
  {
    id: "funnel-1",
    name: "Funil Padrão",
    description: "Funil de vendas padrão",
    isDefault: true,
    createdAt: "15/05/2023"
  },
  {
    id: "funnel-2",
    name: "Campanha Website",
    description: "Funil para leads da campanha de website",
    isDefault: false,
    createdAt: "20/06/2023"
  },
  {
    id: "funnel-3",
    name: "Black Friday",
    description: "Funil de vendas para a Black Friday",
    isDefault: false,
    createdAt: "01/10/2023"
  }
];

// Exemplo de lista de negócios
const initialDeals: Deal[] = [
  {
    id: "D001",
    title: "Implementação de Sistema ERP",
    client: "ABC Tecnologia",
    amount: "R$ 58.000,00",
    probability: 20,
    dueDate: "15/06/2023",
    stage: "lead",
    funnelId: "funnel-1"
  },
  {
    id: "D002",
    title: "Projeto de Marketing Digital",
    client: "Construtora XYZ",
    amount: "R$ 25.000,00",
    probability: 50,
    dueDate: "28/06/2023",
    stage: "lead",
    funnelId: "funnel-1"
  },
  {
    id: "D003",
    title: "Consultoria Estratégica",
    client: "Lima & Associados",
    amount: "R$ 45.000,00",
    probability: 75,
    dueDate: "10/07/2023",
    stage: "qualification",
    funnelId: "funnel-1"
  },
  {
    id: "D004",
    title: "Renovação de Licenças",
    client: "Tech Solutions",
    amount: "R$ 12.500,00",
    probability: 90,
    dueDate: "30/06/2023",
    stage: "proposal",
    funnelId: "funnel-1"
  },
  {
    id: "D005",
    title: "Desenvolvimento de Website",
    client: "Consultoria Global",
    amount: "R$ 35.000,00",
    probability: 60,
    dueDate: "15/07/2023",
    stage: "negotiation",
    funnelId: "funnel-2"
  },
  {
    id: "D006",
    title: "Expansão de Servidor",
    client: "Supermercados Sul",
    amount: "R$ 18.000,00",
    probability: 95,
    dueDate: "01/07/2023",
    stage: "closed",
    funnelId: "funnel-2"
  },
  {
    id: "D007",
    title: "Promoção Black Friday",
    client: "Loja Virtual",
    amount: "R$ 30.000,00",
    probability: 80,
    dueDate: "25/11/2023",
    stage: "lead",
    funnelId: "funnel-3"
  },
];

const stages = [
  { id: "lead", name: "Prospecção", color: "bg-blue-500" },
  { id: "qualification", name: "Qualificação", color: "bg-purple-500" },
  { id: "proposal", name: "Proposta", color: "bg-amber-500" },
  { id: "negotiation", name: "Negociação", color: "bg-green-500" },
  { id: "closed", name: "Fechado", color: "bg-emerald-500" },
  { id: "lost", name: "Perdido", color: "bg-red-500" },
];

const Funnel = () => {
  const [deals, setDeals] = useState<Deal[]>(initialDeals);
  const [funnels, setFunnels] = useState<SalesFunnel[]>(initialFunnels);
  const [isNewDealDialogOpen, setIsNewDealDialogOpen] = useState(false);
  const [isNewFunnelDialogOpen, setIsNewFunnelDialogOpen] = useState(false);
  const [isEditFunnelDialogOpen, setIsEditFunnelDialogOpen] = useState(false);
  const [activeFunnelId, setActiveFunnelId] = useState("funnel-1");
  const [editingFunnel, setEditingFunnel] = useState<SalesFunnel | null>(null);

  const activeFunnel = funnels.find(f => f.id === activeFunnelId) || funnels[0];

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, dealId: string) => {
    e.dataTransfer.setData("dealId", dealId);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, stage: string) => {
    e.preventDefault();
    const dealId = e.dataTransfer.getData("dealId");
    
    setDeals(prev => 
      prev.map(deal => {
        if (deal.id === dealId) {
          toast.success(`Negócio movido para ${stages.find(s => s.id === stage)?.name}`);
          return { ...deal, stage };
        }
        return deal;
      })
    );
  };

  const handleAddNewDeal = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Novo negócio adicionado com sucesso!");
    setIsNewDealDialogOpen(false);
  };

  const handleAddNewFunnel = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Aqui você adicionaria o código para salvar o novo funil
    const newFunnel: SalesFunnel = {
      id: `funnel-${funnels.length + 1}`,
      name: "Novo Funil", // Substituir por valores do formulário
      description: "Descrição do novo funil",
      isDefault: false,
      createdAt: new Date().toLocaleDateString('pt-BR')
    };
    
    setFunnels(prev => [...prev, newFunnel]);
    setActiveFunnelId(newFunnel.id);
    toast.success("Novo funil criado com sucesso!");
    setIsNewFunnelDialogOpen(false);
  };

  const handleEditFunnel = (funnel: SalesFunnel) => {
    setEditingFunnel(funnel);
    setIsEditFunnelDialogOpen(true);
  };

  const handleSaveEditedFunnel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFunnel) return;
    
    setFunnels(prev => 
      prev.map(f => f.id === editingFunnel.id ? editingFunnel : f)
    );
    
    toast.success("Funil atualizado com sucesso!");
    setIsEditFunnelDialogOpen(false);
  };

  const handleDeleteFunnel = (funnelId: string) => {
    // Não permite excluir o funil padrão
    const funnelToDelete = funnels.find(f => f.id === funnelId);
    if (funnelToDelete?.isDefault) {
      toast.error("Não é possível excluir o funil padrão");
      return;
    }

    setFunnels(prev => prev.filter(f => f.id !== funnelId));
    
    // Se o funil ativo for excluído, muda para o funil padrão
    if (activeFunnelId === funnelId) {
      const defaultFunnel = funnels.find(f => f.isDefault);
      if (defaultFunnel) setActiveFunnelId(defaultFunnel.id);
    }
    
    toast.success("Funil excluído com sucesso");
  };

  // Filtra negócios pelo funil ativo
  const filteredDeals = deals.filter(deal => deal.funnelId === activeFunnelId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold">Funil de Vendas</h1>

        <div className="flex flex-col sm:flex-row gap-2">
          <Dialog open={isNewFunnelDialogOpen} onOpenChange={setIsNewFunnelDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                Novo Funil
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[450px]">
              <DialogHeader>
                <DialogTitle>Criar Novo Funil</DialogTitle>
                <DialogDescription>
                  Configure um novo funil de vendas para sua campanha ou segmento de clientes.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddNewFunnel}>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome do Funil</Label>
                    <Input id="name" placeholder="Ex: Campanha de Email" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Descrição</Label>
                    <Textarea id="description" placeholder="Descrição ou objetivo deste funil" />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsNewFunnelDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit">Criar Funil</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={isEditFunnelDialogOpen} onOpenChange={setIsEditFunnelDialogOpen}>
            {editingFunnel && (
              <DialogContent className="sm:max-w-[450px]">
                <DialogHeader>
                  <DialogTitle>Editar Funil</DialogTitle>
                  <DialogDescription>
                    Modifique as configurações do funil selecionado.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSaveEditedFunnel}>
                  <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-name">Nome do Funil</Label>
                      <Input 
                        id="edit-name" 
                        value={editingFunnel.name} 
                        onChange={e => setEditingFunnel({...editingFunnel, name: e.target.value})}
                        required 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-description">Descrição</Label>
                      <Textarea 
                        id="edit-description" 
                        value={editingFunnel.description}
                        onChange={e => setEditingFunnel({...editingFunnel, description: e.target.value})}
                      />
                    </div>
                    {!editingFunnel.isDefault && (
                      <div className="space-y-2">
                        <Label htmlFor="isDefault">Definir como padrão</Label>
                        <Select 
                          value={editingFunnel.isDefault ? "yes" : "no"}
                          onValueChange={(value) => setEditingFunnel({
                            ...editingFunnel, 
                            isDefault: value === "yes"
                          })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="yes">Sim</SelectItem>
                            <SelectItem value="no">Não</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsEditFunnelDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit">Salvar Alterações</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            )}
          </Dialog>

          <Dialog open={isNewDealDialogOpen} onOpenChange={setIsNewDealDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Novo Negócio
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[550px]">
              <DialogHeader>
                <DialogTitle>Adicionar Novo Negócio</DialogTitle>
                <DialogDescription>
                  Preencha os detalhes do novo negócio/oportunidade
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddNewDeal}>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">Título</Label>
                      <Input id="title" placeholder="Ex: Implementação de Sistema" required />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="client">Cliente</Label>
                      <Select required>
                        <SelectTrigger id="client">
                          <SelectValue placeholder="Selecione um cliente" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="client1">ABC Tecnologia</SelectItem>
                          <SelectItem value="client2">Construtora XYZ</SelectItem>
                          <SelectItem value="client3">Supermercados Sul</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="amount">Valor</Label>
                      <Input id="amount" placeholder="R$ 0,00" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dueDate">Data Estimada</Label>
                      <Input id="dueDate" type="date" required />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="stage">Estágio</Label>
                      <Select defaultValue="lead">
                        <SelectTrigger id="stage">
                          <SelectValue placeholder="Selecione o estágio" />
                        </SelectTrigger>
                        <SelectContent>
                          {stages.map((stage) => (
                            <SelectItem key={stage.id} value={stage.id}>
                              {stage.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="probability">Probabilidade (%)</Label>
                      <Input id="probability" type="number" min="0" max="100" defaultValue="50" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="funnel">Funil</Label>
                      <Select defaultValue={activeFunnelId}>
                        <SelectTrigger id="funnel">
                          <SelectValue placeholder="Selecione o funil" />
                        </SelectTrigger>
                        <SelectContent>
                          {funnels.map((funnel) => (
                            <SelectItem key={funnel.id} value={funnel.id}>
                              {funnel.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Observações</Label>
                    <Textarea id="notes" placeholder="Detalhes sobre esta oportunidade..." />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsNewDealDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit">Adicionar</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Seletor de Funis */}
      <div className="flex flex-col space-y-4">
        <div className="bg-muted rounded-md p-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
            <h2 className="text-lg font-semibold">Selecione um funil de vendas</h2>
            <span className="text-sm text-muted-foreground">{funnels.length} funis disponíveis</span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {funnels.map((funnel) => (
              <Card 
                key={funnel.id} 
                className={`cursor-pointer transition-all ${activeFunnelId === funnel.id ? 'border-crm-primary shadow-md' : 'hover:shadow-md'}`}
                onClick={() => setActiveFunnelId(funnel.id)}
              >
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-md">{funnel.name}</CardTitle>
                      {funnel.isDefault && <Badge className="mt-1">Padrão</Badge>}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Ações do Funil</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleEditFunnel(funnel)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Editar Funil
                        </DropdownMenuItem>
                        {!funnel.isDefault && (
                          <DropdownMenuItem 
                            onClick={() => handleDeleteFunnel(funnel.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Excluir Funil
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-2">{funnel.description}</p>
                  <div className="flex justify-between items-center mt-3 text-xs text-muted-foreground">
                    <span>Criado em {funnel.createdAt}</span>
                    <span>{filteredDeals.length} negócios</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* Título do funil ativo */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-3">
        <div>
          <h2 className="text-xl font-semibold">{activeFunnel?.name}</h2>
          <p className="text-sm text-muted-foreground">{activeFunnel?.description}</p>
        </div>
        <Badge variant="outline" className="mt-2 sm:mt-0">
          {filteredDeals.length} negócios
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="grid grid-cols-1 lg:grid-cols-6 gap-4">
          {stages.map((stage) => {
            const stageDeals = filteredDeals.filter((deal) => deal.stage === stage.id);
            const stageTotal = stageDeals.reduce((sum, deal) => {
              const amount = parseFloat(deal.amount.replace("R$ ", "").replace(".", "").replace(",", "."));
              return sum + amount;
            }, 0);
            
            return (
              <Card 
                key={stage.id}
                className="col-span-1"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, stage.id)}
              >
                <CardHeader className={`${stage.color} text-white p-3 rounded-t-lg flex flex-row items-center justify-between`}>
                  <div>
                    <CardTitle className="text-sm font-medium">{stage.name}</CardTitle>
                    <p className="text-xs opacity-90">{stageDeals.length} negócios</p>
                  </div>
                  <Badge variant="secondary" className="bg-white/20 hover:bg-white/30 text-white">
                    R$ {stageTotal.toLocaleString('pt-BR')}
                  </Badge>
                </CardHeader>
                <CardContent className="p-3 max-h-[60vh] overflow-y-auto">
                  {stageDeals.length === 0 ? (
                    <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-md">
                      Nenhum negócio neste estágio
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {stageDeals.map((deal) => (
                        <div
                          key={deal.id}
                          className="bg-white rounded-lg border shadow-sm p-3 cursor-move hover:shadow-md transition-shadow"
                          draggable
                          onDragStart={(e) => handleDragStart(e, deal.id)}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-medium text-sm">{deal.title}</h3>
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </div>
                          <p className="text-sm text-gray-500 mb-2">{deal.client}</p>
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center">
                              <DollarSign className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                              <span>{deal.amount}</span>
                            </div>
                            <div className="flex items-center">
                              <Calendar className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                              <span>{deal.dueDate}</span>
                            </div>
                          </div>
                          <div className="mt-3 flex items-center justify-between">
                            <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-green-500 rounded-full"
                                style={{ width: `${deal.probability}%` }}
                              />
                            </div>
                            <span className="text-xs">{deal.probability}%</span>
                          </div>
                          <div className="mt-3 flex items-center">
                            <Avatar className="h-6 w-6 mr-1">
                              <div className="bg-blue-500 h-full w-full flex items-center justify-center text-xs font-medium text-white">CS</div>
                            </Avatar>
                            <span className="text-xs text-muted-foreground">Carlos Silva</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Funnel;
