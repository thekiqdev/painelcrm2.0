import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KanbanSquare, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useNavigate } from "react-router-dom";

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

// Initial example funnels with different types
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

// Example deals data
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

const Funnel = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<FunnelType>("clients");
  const [funnels, setFunnels] = useState<SalesFunnel[]>(initialFunnels);
  const [deals, setDeals] = useState<Deal[]>(initialDeals);
  const [activeFunnelId, setActiveFunnelId] = useState<string>(funnels[0]?.id || "");

  // Filtrar funis pelo tipo ativo
  const funnelsByType = funnels.filter(f => f.type === activeTab);
  const activeFunnel = funnels.find(f => f.id === activeFunnelId) || funnels[0];

  const handleViewFunnelDetails = (funnelId: string) => {
    navigate(`/funnel/${funnelId}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold">Funil de Vendas</h1>

        <div className="flex flex-col sm:flex-row gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Novo Funil
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[550px]">
              <DialogHeader>
                <DialogTitle>Criar Novo Funil</DialogTitle>
                <DialogDescription>
                  Preencha os detalhes para criar um novo funil
                </DialogDescription>
              </DialogHeader>
              <form>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">Título</Label>
                      <Input id="title" placeholder="Ex: Funil de Vendas" required />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="description">Descrição</Label>
                      <Textarea id="description" placeholder="Descreva o funil..." />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline">
                    Cancelar
                  </Button>
                  <Button type="submit">Criar Funil</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Tabs para tipos de funis */}
      <Tabs defaultValue="clients" onValueChange={(value) => setActiveTab(value as FunnelType)}>
        <TabsList className="mb-4">
          <TabsTrigger value="clients">Clientes</TabsTrigger>
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="proposals">Propostas</TabsTrigger>
          <TabsTrigger value="contracts">Contratos</TabsTrigger>
        </TabsList>

        {/* Conteúdo para todos os tipos de funis */}
        <TabsContent value="clients" className="space-y-4">
          <FunnelsList 
            funnels={funnelsByType} 
            activeFunnelId={activeFunnelId}
            setActiveFunnelId={setActiveFunnelId}
            handleViewFunnelDetails={handleViewFunnelDetails}
            filteredDeals={deals.filter(deal => deal.funnelId === activeFunnelId)}
          />
        </TabsContent>
        <TabsContent value="leads" className="space-y-4">
          <FunnelsList 
            funnels={funnelsByType} 
            activeFunnelId={activeFunnelId}
            setActiveFunnelId={setActiveFunnelId}
            handleViewFunnelDetails={handleViewFunnelDetails}
            filteredDeals={deals.filter(deal => deal.funnelId === activeFunnelId)}
          />
        </TabsContent>
        <TabsContent value="proposals" className="space-y-4">
          <FunnelsList 
            funnels={funnelsByType} 
            activeFunnelId={activeFunnelId}
            setActiveFunnelId={setActiveFunnelId}
            handleViewFunnelDetails={handleViewFunnelDetails}
            filteredDeals={deals.filter(deal => deal.funnelId === activeFunnelId)}
          />
        </TabsContent>
        <TabsContent value="contracts" className="space-y-4">
          <FunnelsList 
            funnels={funnelsByType} 
            activeFunnelId={activeFunnelId}
            setActiveFunnelId={setActiveFunnelId}
            handleViewFunnelDetails={handleViewFunnelDetails}
            filteredDeals={deals.filter(deal => deal.funnelId === activeFunnelId)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

// Componente separado para lista de funis
interface FunnelsListProps {
  funnels: SalesFunnel[];
  activeFunnelId: string;
  setActiveFunnelId: (id: string) => void;
  handleViewFunnelDetails: (id: string) => void;
  filteredDeals: Deal[];
}

const FunnelsList = ({ 
  funnels, 
  activeFunnelId, 
  setActiveFunnelId, 
  handleViewFunnelDetails,
  filteredDeals
}: FunnelsListProps) => {
  if (funnels.length === 0) {
    return (
      <div className="bg-muted rounded-md flex items-center justify-center p-10">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-medium mb-2">Nenhum funil encontrado</h2>
          <p className="text-muted-foreground mb-4">
            Você ainda não tem nenhum funil deste tipo. Crie um funil para começar a organizar seus negócios.
          </p>
          <Button onClick={() => document.querySelector<HTMLButtonElement>('[data-set-new-funnel-dialog]')?.click()}>
            <Plus className="mr-2 h-4 w-4" />
            Criar Novo Funil
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-muted rounded-md p-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
        <h2 className="text-lg font-semibold">Selecione um funil</h2>
        <span className="text-sm text-muted-foreground">{funnels.length} funis disponíveis</span>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {funnels.map((funnel) => {
          return (
            <Card 
              key={funnel.id} 
              className={`cursor-pointer transition-all ${activeFunnelId === funnel.id ? 'border-primary shadow-md' : 'hover:shadow-md'}`}
              onClick={() => {
                setActiveFunnelId(funnel.id);
                handleViewFunnelDetails(funnel.id);
              }}
            >
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-md">{funnel.name}</CardTitle>
                    {funnel.isDefault && <Badge className="mt-1">Padrão</Badge>}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-2">{funnel.description}</p>
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Estágios: {funnel.stages.length}</span>
                    <span>Negócios: {filteredDeals.length}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center mt-3 text-xs text-muted-foreground">
                  <span>Criado em {funnel.createdAt}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default Funnel;
