
import React, { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { 
  Plus, 
  MoreHorizontal, 
  Calendar, 
  DollarSign, 
  ArrowLeft, 
  BarChart,
  KanbanSquare,
  Move
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
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

type FunnelStage = {
  id: string;
  name: string;
  color: string;
  order: number;
  funnelId: string;
};

type FunnelType = "clients" | "leads" | "proposals" | "contracts";

type SalesFunnel = {
  id: string;
  name: string;
  description: string;
  type: FunnelType;
  isDefault: boolean;
  createdAt: string;
  stages: FunnelStage[];
};

// Initial example funnels with different types - this would come from your API/database
const initialFunnels: SalesFunnel[] = [
  {
    id: "funnel-1",
    name: "Funil de Clientes Padrão",
    description: "Funil de vendas padrão para clientes",
    type: "clients",
    isDefault: true,
    createdAt: "15/05/2023",
    stages: [
      { id: "stage-1", name: "Prospecção", color: "bg-blue-500", order: 0, funnelId: "funnel-1" },
      { id: "stage-2", name: "Qualificação", color: "bg-purple-500", order: 1, funnelId: "funnel-1" },
      { id: "stage-3", name: "Proposta", color: "bg-amber-500", order: 2, funnelId: "funnel-1" },
      { id: "stage-4", name: "Negociação", color: "bg-green-500", order: 3, funnelId: "funnel-1" },
      { id: "stage-5", name: "Fechado", color: "bg-emerald-500", order: 4, funnelId: "funnel-1" },
      { id: "stage-6", name: "Perdido", color: "bg-red-500", order: 5, funnelId: "funnel-1" }
    ]
  },
  {
    id: "funnel-2",
    name: "Funil de Leads Website",
    description: "Funil para leads da campanha de website",
    type: "leads",
    isDefault: false,
    createdAt: "20/06/2023",
    stages: [
      { id: "stage-7", name: "Novo Lead", color: "bg-blue-500", order: 0, funnelId: "funnel-2" },
      { id: "stage-8", name: "Contato", color: "bg-purple-500", order: 1, funnelId: "funnel-2" },
      { id: "stage-9", name: "Qualificado", color: "bg-green-500", order: 2, funnelId: "funnel-2" },
      { id: "stage-10", name: "Convertido", color: "bg-emerald-500", order: 3, funnelId: "funnel-2" },
      { id: "stage-11", name: "Rejeitado", color: "bg-red-500", order: 4, funnelId: "funnel-2" }
    ]
  },
  {
    id: "funnel-3",
    name: "Funil de Propostas",
    description: "Funil para gerenciar propostas comerciais",
    type: "proposals",
    isDefault: false,
    createdAt: "01/07/2023",
    stages: [
      { id: "stage-12", name: "Nova", color: "bg-blue-500", order: 0, funnelId: "funnel-3" },
      { id: "stage-13", name: "Em Elaboração", color: "bg-purple-500", order: 1, funnelId: "funnel-3" },
      { id: "stage-14", name: "Enviada", color: "bg-amber-500", order: 2, funnelId: "funnel-3" },
      { id: "stage-15", name: "Em Análise", color: "bg-green-500", order: 3, funnelId: "funnel-3" },
      { id: "stage-16", name: "Aceita", color: "bg-emerald-500", order: 4, funnelId: "funnel-3" },
      { id: "stage-17", name: "Recusada", color: "bg-red-500", order: 5, funnelId: "funnel-3" }
    ]
  }
];

// Example deals data - this would come from your API/database
const initialDeals: Deal[] = [
  {
    id: "D001",
    title: "Implementação de Sistema ERP",
    client: "ABC Tecnologia",
    amount: "R$ 58.000,00",
    probability: 20,
    dueDate: "15/06/2023",
    stage: "stage-1",
    funnelId: "funnel-1"
  },
  {
    id: "D002",
    title: "Projeto de Marketing Digital",
    client: "Construtora XYZ",
    amount: "R$ 25.000,00",
    probability: 50,
    dueDate: "28/06/2023",
    stage: "stage-1",
    funnelId: "funnel-1"
  },
  {
    id: "D003",
    title: "Consultoria Estratégica",
    client: "Lima & Associados",
    amount: "R$ 45.000,00",
    probability: 75,
    dueDate: "10/07/2023",
    stage: "stage-2",
    funnelId: "funnel-1"
  },
  {
    id: "D004",
    title: "Renovação de Licenças",
    client: "Tech Solutions",
    amount: "R$ 12.500,00",
    probability: 90,
    dueDate: "30/06/2023",
    stage: "stage-3",
    funnelId: "funnel-1"
  },
  {
    id: "D005",
    title: "Desenvolvimento de Website",
    client: "Consultoria Global",
    amount: "R$ 35.000,00",
    probability: 60,
    dueDate: "15/07/2023",
    stage: "stage-4",
    funnelId: "funnel-1"
  },
  {
    id: "D006",
    title: "Expansão de Servidor",
    client: "Supermercados Sul",
    amount: "R$ 18.000,00",
    probability: 95,
    dueDate: "01/07/2023",
    stage: "stage-5",
    funnelId: "funnel-1"
  },
  {
    id: "D007",
    title: "Lead Campanha Email",
    client: "Loja Virtual",
    amount: "R$ 30.000,00",
    probability: 80,
    dueDate: "25/11/2023",
    stage: "stage-7",
    funnelId: "funnel-2"
  }
];

const FunnelDetails = () => {
  const navigate = useNavigate();
  const { funnelId } = useParams<{ funnelId: string }>();
  const [deals, setDeals] = useState<Deal[]>(initialDeals);
  const [funnel, setFunnel] = useState<SalesFunnel | null>(null);

  useEffect(() => {
    // In a real app, this would be an API call
    const selectedFunnel = initialFunnels.find(f => f.id === funnelId);
    if (selectedFunnel) {
      setFunnel(selectedFunnel);
    } else {
      // Redirect if funnel not found
      navigate('/funnel');
      toast.error("Funil não encontrado");
    }
  }, [funnelId, navigate]);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, dealId: string) => {
    e.dataTransfer.setData("dealId", dealId);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, stageId: string) => {
    e.preventDefault();
    const dealId = e.dataTransfer.getData("dealId");
    
    setDeals(prev => 
      prev.map(deal => {
        if (deal.id === dealId) {
          const stage = funnel?.stages.find(s => s.id === stageId);
          if (stage) {
            toast.success(`Negócio movido para ${stage.name}`);
            return { ...deal, stage: stageId };
          }
        }
        return deal;
      })
    );
  };

  const handleViewDeal = (dealId: string, stageId: string) => {
    if (funnel?.type === 'proposals') {
      navigate(`/funnel/${funnelId}/stage/${stageId}/proposal/${dealId}`);
    } else {
      toast.info("Visualização detalhada disponível apenas para propostas");
    }
  };

  // Filter deals for this funnel
  const filteredDeals = deals.filter(deal => deal.funnelId === funnelId);

  if (!funnel) {
    return <div className="flex items-center justify-center h-64">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigate('/funnel')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{funnel.name}</h1>
            <p className="text-sm text-muted-foreground">{funnel.description}</p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline">
            <BarChart className="mr-2 h-4 w-4" />
            Relatórios
          </Button>
          <Button variant="outline">
            <KanbanSquare className="mr-2 h-4 w-4" />
            Gerenciar Estágios
          </Button>
          <Button variant="outline">
            <Move className="mr-2 h-4 w-4" />
            Regras
          </Button>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            {funnel.type === 'proposals' ? 'Nova Proposta' : 
             funnel.type === 'leads' ? 'Novo Lead' : 'Novo Negócio'}
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {funnel.type === "clients" && "Clientes"}
            {funnel.type === "leads" && "Leads"}
            {funnel.type === "proposals" && "Propostas"}
            {funnel.type === "contracts" && "Contratos"}
          </Badge>
          <span className="text-sm text-muted-foreground">
            Criado em {funnel.createdAt}
          </span>
        </div>
        <Badge variant="outline">
          {filteredDeals.length} {funnel.type === 'proposals' ? 'propostas' : 'negócios'}
        </Badge>
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-1 gap-4">
        <div className="grid grid-cols-1 lg:grid-cols-6 gap-4">
          {funnel.stages.sort((a, b) => a.order - b.order).map((stage) => {
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
                    <p className="text-xs opacity-90">{stageDeals.length} {funnel.type === 'proposals' ? 'propostas' : 'negócios'}</p>
                  </div>
                  <div className="flex items-center">
                    <Badge variant="secondary" className="bg-white/20 hover:bg-white/30 text-white">
                      R$ {stageTotal.toLocaleString('pt-BR')}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-3 max-h-[60vh] overflow-y-auto">
                  {stageDeals.length === 0 ? (
                    <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-md">
                      Nenhum {funnel.type === 'proposals' ? 'proposta' : 'negócio'} neste estágio
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {stageDeals.map((deal) => (
                        <div
                          key={deal.id}
                          className="bg-white rounded-lg border shadow-sm p-3 cursor-move hover:shadow-md transition-shadow"
                          draggable
                          onDragStart={(e) => handleDragStart(e, deal.id)}
                          onClick={() => handleViewDeal(deal.id, stage.id)}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-medium text-sm">{deal.title}</h3>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="icon" className="h-6 w-6">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Ações</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation();
                                  handleViewDeal(deal.id, stage.id);
                                }}>
                                  Visualizar Detalhes
                                </DropdownMenuItem>
                                <DropdownMenuItem>Editar</DropdownMenuItem>
                                <DropdownMenuItem>Mover para Estágio</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive">
                                  Excluir
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
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

export default FunnelDetails;
