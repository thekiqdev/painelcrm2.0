
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, ChevronRight, Plus, Settings } from "lucide-react";
import RuleForm from "@/components/funnel/RuleForm";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Definição de tipos
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

type Rule = {
  id: string;
  type: "date" | "status" | "source";
  operator: string;
  value: string | Date;
};

// Mock de dados para exemplo
const initialFunnel: SalesFunnel = {
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
};

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
  }
];

const FunnelDetails: React.FC = () => {
  const { funnelId } = useParams<{ funnelId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("kanban");
  const [funnel, setFunnel] = useState<SalesFunnel | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [leadStatuses, setLeadStatuses] = useState<any[]>([]);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);

  // Opções de fontes para leads (poderia vir do banco de dados)
  const sourcesOptions = [
    "Direto", 
    "Website", 
    "Indicação", 
    "Google", 
    "Facebook", 
    "Instagram", 
    "LinkedIn", 
    "Email Marketing",
    "WhatsApp",
    "Outro"
  ];

  // Carregar dados do funil
  useEffect(() => {
    if (funnelId) {
      // Aqui poderia fazer uma requisição ao backend
      // Por enquanto estamos usando dados mock
      if (funnelId === "funnel-1") {
        setFunnel(initialFunnel);
        setDeals(initialDeals);
      }
      
      // Carregar status de leads do Supabase
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

      fetchLeadStatuses();
      
      // Simular carregamento de regras (no futuro isso viria do banco de dados)
      setRules([
        {
          id: "rule-1",
          type: "status",
          operator: "equals",
          value: "Novo"
        }
      ]);
    }
  }, [funnelId]);

  const handleSaveRule = (rule: Rule) => {
    setRules([...rules, rule]);
    toast.success("Regra adicionada com sucesso!");
  };

  const handleRemoveRule = (id: string) => {
    setRules(rules.filter(rule => rule.id !== id));
    toast.success("Regra removida com sucesso!");
  };

  // Aplicar regras automaticamente (simulação)
  useEffect(() => {
    if (rules.length > 0 && funnel?.type === "leads") {
      toast.info("Regras aplicadas automaticamente");
      // Aqui seria a lógica para aplicar as regras nos leads
      console.log("Aplicando regras automaticamente:", rules);
    }
  }, [rules, funnel?.type]);

  if (!funnel) {
    return (
      <div className="flex items-center justify-center h-64">
        <p>Carregando detalhes do funil...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate("/funnel")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">{funnel.name}</h1>
          {funnel.isDefault && <Badge>Padrão</Badge>}
        </div>

        <div className="flex gap-2">
          <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Settings className="h-4 w-4 mr-2" />
                Configurações
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Configurações do Funil</DialogTitle>
              </DialogHeader>
              <Tabs defaultValue="general" className="mt-4">
                <TabsList>
                  <TabsTrigger value="general">Geral</TabsTrigger>
                  <TabsTrigger value="stages">Estágios</TabsTrigger>
                  <TabsTrigger value="rules">Regras</TabsTrigger>
                </TabsList>
                
                <TabsContent value="general" className="space-y-4 pt-4">
                  <h3 className="text-lg font-medium">Informações Gerais</h3>
                  <p>Configure as informações básicas do funil</p>
                </TabsContent>
                
                <TabsContent value="stages" className="space-y-4 pt-4">
                  <h3 className="text-lg font-medium">Estágios do Funil</h3>
                  <p>Configure os estágios do seu funil</p>
                </TabsContent>
                
                <TabsContent value="rules" className="pt-4">
                  <RuleForm 
                    leadStatuses={leadStatuses}
                    sourcesOptions={sourcesOptions}
                    onSaveRule={handleSaveRule}
                    existingRules={rules}
                    onRemoveRule={handleRemoveRule}
                  />
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>
          
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar Negócio
          </Button>
        </div>
      </div>

      <p className="text-muted-foreground">{funnel.description}</p>

      {/* Tabs */}
      <Tabs defaultValue={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="kanban">Kanban</TabsTrigger>
          <TabsTrigger value="list">Lista</TabsTrigger>
        </TabsList>

        <TabsContent value="kanban" className="space-y-6">
          {/* Visão Kanban */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {funnel.stages.slice(0, 3).map((stage) => (
              <Card key={stage.id}>
                <CardHeader className={`${stage.color} text-white rounded-t-lg py-2 px-3`}>
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-sm">{stage.name}</CardTitle>
                    <Badge variant="outline" className="text-white border-white">
                      {deals.filter(d => d.stage === stage.id).length}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-2 space-y-2">
                  {deals
                    .filter(deal => deal.stage === stage.id)
                    .map(deal => (
                      <Card key={deal.id} className="cursor-pointer hover:shadow-md">
                        <CardContent className="p-3">
                          <p className="font-medium">{deal.title}</p>
                          <div className="flex justify-between items-center text-xs text-muted-foreground mt-2">
                            <span>{deal.client}</span>
                            <span>{deal.amount}</span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="list" className="space-y-4">
          {/* Visão de Lista */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="py-3 px-4 text-left font-medium">Título</th>
                      <th className="py-3 px-4 text-left font-medium">Cliente</th>
                      <th className="py-3 px-4 text-left font-medium">Valor</th>
                      <th className="py-3 px-4 text-left font-medium">Estágio</th>
                      <th className="py-3 px-4 text-left font-medium">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deals.map((deal) => {
                      const stage = funnel.stages.find(s => s.id === deal.stage);
                      return (
                        <tr key={deal.id} className="border-b hover:bg-muted/50 cursor-pointer">
                          <td className="py-3 px-4">{deal.title}</td>
                          <td className="py-3 px-4">{deal.client}</td>
                          <td className="py-3 px-4">{deal.amount}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${stage?.color}`} />
                              {stage?.name}
                            </div>
                          </td>
                          <td className="py-3 px-4">{deal.dueDate}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FunnelDetails;
