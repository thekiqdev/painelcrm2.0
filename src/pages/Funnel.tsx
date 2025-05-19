
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
import { Plus, MoreHorizontal, Calendar, DollarSign, Edit, Trash2, Move, KanbanSquare } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

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

type FunnelRule = {
  id: string;
  name: string;
  funnelId: string;
  condition: string;
  action: string;
  destinationStageId?: string;
  destinationFunnelId?: string;
}

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
  },
  {
    id: "funnel-4",
    name: "Funil de Contratos",
    description: "Funil para gerenciar contratos",
    type: "contracts",
    isDefault: false,
    createdAt: "15/07/2023",
    stages: [
      { id: "stage-18", name: "Novo", color: "bg-blue-500", order: 0, funnelId: "funnel-4" },
      { id: "stage-19", name: "Em Elaboração", color: "bg-purple-500", order: 1, funnelId: "funnel-4" },
      { id: "stage-20", name: "Enviado", color: "bg-amber-500", order: 2, funnelId: "funnel-4" },
      { id: "stage-21", name: "Assinado", color: "bg-emerald-500", order: 3, funnelId: "funnel-4" },
      { id: "stage-22", name: "Cancelado", color: "bg-red-500", order: 4, funnelId: "funnel-4" }
    ]
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
  },
];

const initialRules: FunnelRule[] = [
  {
    id: "rule-1",
    name: "Lead qualificado para Cliente",
    funnelId: "funnel-2",
    condition: "stage equals stage-10",
    action: "move to funnel",
    destinationFunnelId: "funnel-1"
  },
  {
    id: "rule-2",
    name: "Cliente com proposta aceita",
    funnelId: "funnel-3",
    condition: "stage equals stage-16",
    action: "move to stage",
    destinationStageId: "stage-4",
    destinationFunnelId: "funnel-1"
  }
];

// Definição do esquema de validação para novos funis
const funnelFormSchema = z.object({
  name: z.string().min(1, "Nome do funil é obrigatório"),
  description: z.string().optional(),
  type: z.enum(["clients", "leads", "proposals", "contracts"], {
    required_error: "Por favor, selecione um tipo de funil",
  }),
  isDefault: z.boolean().default(false),
});

// Definição do esquema de validação para estágios
const stageFormSchema = z.object({
  name: z.string().min(1, "Nome do estágio é obrigatório"),
  color: z.string().min(1, "Cor é obrigatória"),
});

// Definição do esquema de validação para regras
const ruleFormSchema = z.object({
  name: z.string().min(1, "Nome da regra é obrigatório"),
  condition: z.string().min(1, "Condição é obrigatória"),
  action: z.enum(["move to stage", "move to funnel"], {
    required_error: "Por favor, selecione uma ação",
  }),
  destinationStageId: z.string().optional(),
  destinationFunnelId: z.string().optional(),
});

const availableColors = [
  { name: "Azul", value: "bg-blue-500" },
  { name: "Roxo", value: "bg-purple-500" },
  { name: "Âmbar", value: "bg-amber-500" },
  { name: "Verde", value: "bg-green-500" },
  { name: "Verde Esmeralda", value: "bg-emerald-500" },
  { name: "Vermelho", value: "bg-red-500" },
  { name: "Rosa", value: "bg-pink-500" },
  { name: "Laranja", value: "bg-orange-500" },
  { name: "Cinza", value: "bg-gray-500" },
  { name: "Azul Claro", value: "bg-sky-500" },
];

const Funnel = () => {
  const [deals, setDeals] = useState<Deal[]>(initialDeals);
  const [funnels, setFunnels] = useState<SalesFunnel[]>(initialFunnels);
  const [rules, setRules] = useState<FunnelRule[]>(initialRules);
  const [activeTab, setActiveTab] = useState<FunnelType>("clients");
  const [isNewDealDialogOpen, setIsNewDealDialogOpen] = useState(false);
  const [isNewFunnelDialogOpen, setIsNewFunnelDialogOpen] = useState(false);
  const [isEditFunnelDialogOpen, setIsEditFunnelDialogOpen] = useState(false);
  const [isNewStageDialogOpen, setIsNewStageDialogOpen] = useState(false);
  const [isNewRuleDialogOpen, setIsNewRuleDialogOpen] = useState(false);
  const [activeFunnelId, setActiveFunnelId] = useState("funnel-1");
  const [editingFunnel, setEditingFunnel] = useState<SalesFunnel | null>(null);

  // Filtrar funis pelo tipo ativo
  const funnelsByType = funnels.filter(f => f.type === activeTab);
  const activeFunnel = funnels.find(f => f.id === activeFunnelId) || funnels[0];
  
  // Filtrar regras pelo funil ativo
  const funnelRules = rules.filter(rule => rule.funnelId === activeFunnelId);

  // Form para novo funil
  const newFunnelForm = useForm<z.infer<typeof funnelFormSchema>>({
    resolver: zodResolver(funnelFormSchema),
    defaultValues: {
      name: "",
      description: "",
      type: "clients" as const,
      isDefault: false,
    },
  });

  // Form para novo estágio
  const newStageForm = useForm<z.infer<typeof stageFormSchema>>({
    resolver: zodResolver(stageFormSchema),
    defaultValues: {
      name: "",
      color: "bg-blue-500",
    },
  });

  // Form para nova regra
  const newRuleForm = useForm<z.infer<typeof ruleFormSchema>>({
    resolver: zodResolver(ruleFormSchema),
    defaultValues: {
      name: "",
      condition: "",
      action: "move to stage" as const,
    },
  });
  
  // Monitorar mudanças na ação da regra
  const watchRuleAction = newRuleForm.watch("action");

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
          const stage = activeFunnel.stages.find(s => s.id === stageId);
          if (stage) {
            toast.success(`Negócio movido para ${stage.name}`);
            return { ...deal, stage: stageId };
          }
        }
        return deal;
      })
    );
    
    // Verificar se há regras a serem aplicadas
    const stageRules = rules.filter(rule => 
      rule.funnelId === activeFunnelId && 
      rule.condition === `stage equals ${stageId}`
    );
    
    if (stageRules.length > 0) {
      const rule = stageRules[0];  // Pega a primeira regra aplicável
      const dealToUpdate = deals.find(d => d.id === dealId);
      
      if (dealToUpdate) {
        if (rule.action === "move to funnel" && rule.destinationFunnelId) {
          const destFunnel = funnels.find(f => f.id === rule.destinationFunnelId);
          if (destFunnel) {
            const firstStage = destFunnel.stages.sort((a, b) => a.order - b.order)[0];
            if (firstStage) {
              setDeals(prev => 
                prev.map(deal => 
                  deal.id === dealId 
                    ? { ...deal, funnelId: destFunnel.id, stage: firstStage.id } 
                    : deal
                )
              );
              toast.success(`Regra aplicada: "${rule.name}". Item movido para o funil "${destFunnel.name}"`);
            }
          }
        } else if (rule.action === "move to stage" && rule.destinationStageId) {
          setDeals(prev => 
            prev.map(deal => 
              deal.id === dealId 
                ? { ...deal, stage: rule.destinationStageId || deal.stage } 
                : deal
            )
          );
          const destStage = activeFunnel.stages.find(s => s.id === rule.destinationStageId);
          if (destStage) {
            toast.success(`Regra aplicada: "${rule.name}". Item movido para o estágio "${destStage.name}"`);
          }
        }
      }
    }
  };

  const handleAddNewDeal = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Novo negócio adicionado com sucesso!");
    setIsNewDealDialogOpen(false);
  };

  const handleAddNewFunnel = (values: z.infer<typeof funnelFormSchema>) => {
    const newFunnel: SalesFunnel = {
      id: `funnel-${funnels.length + 1}`,
      name: values.name,
      description: values.description || "",
      type: values.type,
      isDefault: values.isDefault,
      createdAt: new Date().toLocaleDateString('pt-BR'),
      stages: [] // Inicialmente sem estágios
    };
    
    setFunnels(prev => [...prev, newFunnel]);
    setActiveFunnelId(newFunnel.id);
    toast.success("Novo funil criado com sucesso!");
    setIsNewFunnelDialogOpen(false);
    newFunnelForm.reset();
  };

  const handleAddNewStage = (values: z.infer<typeof stageFormSchema>) => {
    // Encontrar a maior ordem atual
    const currentStages = funnels.find(f => f.id === activeFunnelId)?.stages || [];
    const maxOrder = currentStages.length > 0
      ? Math.max(...currentStages.map(stage => stage.order))
      : -1;
    
    const newStage: FunnelStage = {
      id: `stage-${Date.now()}`,
      name: values.name,
      color: values.color,
      order: maxOrder + 1,
      funnelId: activeFunnelId
    };
    
    // Adicionar o novo estágio ao funil ativo
    setFunnels(prev => prev.map(funnel => 
      funnel.id === activeFunnelId
        ? { ...funnel, stages: [...funnel.stages, newStage] }
        : funnel
    ));
    
    toast.success(`Estágio "${values.name}" adicionado com sucesso!`);
    setIsNewStageDialogOpen(false);
    newStageForm.reset();
  };

  const handleAddNewRule = (values: z.infer<typeof ruleFormSchema>) => {
    const newRule: FunnelRule = {
      id: `rule-${Date.now()}`,
      name: values.name,
      funnelId: activeFunnelId,
      condition: values.condition,
      action: values.action,
      destinationStageId: values.destinationStageId,
      destinationFunnelId: values.destinationFunnelId
    };
    
    setRules(prev => [...prev, newRule]);
    toast.success(`Regra "${values.name}" criada com sucesso!`);
    setIsNewRuleDialogOpen(false);
    newRuleForm.reset();
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
    // Não permite excluir se for o único funil do tipo
    const funnelsOfType = funnels.filter(f => f.type === activeFunnel.type);
    if (funnelsOfType.length <= 1) {
      toast.error(`Não é possível excluir: É necessário ao menos um funil do tipo ${activeFunnel.type}`);
      return;
    }
    
    // Não permite excluir o funil padrão
    const funnelToDelete = funnels.find(f => f.id === funnelId);
    if (funnelToDelete?.isDefault) {
      toast.error("Não é possível excluir o funil padrão");
      return;
    }

    setFunnels(prev => prev.filter(f => f.id !== funnelId));
    
    // Se o funil ativo for excluído, muda para o primeiro funil do tipo atual
    if (activeFunnelId === funnelId) {
      const remainingFunnels = funnels.filter(f => f.id !== funnelId && f.type === activeTab);
      if (remainingFunnels.length > 0) {
        setActiveFunnelId(remainingFunnels[0].id);
      }
    }
    
    // Remover regras associadas ao funil
    setRules(prev => prev.filter(r => r.funnelId !== funnelId));
    
    // Mover negócios para o funil padrão do mesmo tipo
    const defaultFunnel = funnels.find(f => f.isDefault && f.type === funnelToDelete?.type);
    if (defaultFunnel) {
      setDeals(prev => 
        prev.map(deal => 
          deal.funnelId === funnelId
            ? { ...deal, funnelId: defaultFunnel.id, stage: defaultFunnel.stages[0]?.id || "" }
            : deal
        )
      );
    }
    
    toast.success("Funil excluído com sucesso");
  };

  const handleDeleteStage = (stageId: string) => {
    // Verificar se há negócios neste estágio
    const dealsInStage = deals.filter(d => d.stage === stageId);
    if (dealsInStage.length > 0) {
      toast.error("Não é possível excluir um estágio que contém negócios");
      return;
    }
    
    // Atualizar o funil removendo o estágio
    setFunnels(prev => prev.map(funnel => 
      funnel.id === activeFunnelId
        ? { ...funnel, stages: funnel.stages.filter(s => s.id !== stageId) }
        : funnel
    ));
    
    // Remover regras que mencionam este estágio
    setRules(prev => prev.filter(r => 
      r.condition !== `stage equals ${stageId}` && 
      r.destinationStageId !== stageId
    ));
    
    toast.success("Estágio excluído com sucesso");
  };

  const handleDeleteRule = (ruleId: string) => {
    setRules(prev => prev.filter(r => r.id !== ruleId));
    toast.success("Regra excluída com sucesso");
  };

  // Filtrar negócios pelo funil ativo
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
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Criar Novo Funil</DialogTitle>
                <DialogDescription>
                  Configure um novo funil para sua equipe gerenciar clientes, leads, propostas ou contratos.
                </DialogDescription>
              </DialogHeader>
              <Form {...newFunnelForm}>
                <form onSubmit={newFunnelForm.handleSubmit(handleAddNewFunnel)} className="space-y-4">
                  <FormField
                    control={newFunnelForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome do Funil</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: Campanha de Email" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={newFunnelForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Descrição (opcional)</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Descreva o propósito deste funil" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={newFunnelForm.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo de Funil</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione um tipo de funil" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="clients">Clientes</SelectItem>
                            <SelectItem value="leads">Leads</SelectItem>
                            <SelectItem value="proposals">Propostas</SelectItem>
                            <SelectItem value="contracts">Contratos</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={newFunnelForm.control}
                    name="isDefault"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Definir como padrão</FormLabel>
                          <FormDescription>
                            Este será o funil padrão para o tipo selecionado.
                          </FormDescription>
                        </div>
                        <FormControl>
                          <input
                            type="checkbox"
                            checked={field.value}
                            onChange={field.onChange}
                            className="w-4 h-4"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsNewFunnelDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit">Criar Funil</Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

          <Dialog open={isNewStageDialogOpen} onOpenChange={setIsNewStageDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <KanbanSquare className="mr-2 h-4 w-4" />
                Novo Estágio
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Adicionar Novo Estágio</DialogTitle>
                <DialogDescription>
                  Adicione um novo estágio ao funil: {activeFunnel?.name}
                </DialogDescription>
              </DialogHeader>
              <Form {...newStageForm}>
                <form onSubmit={newStageForm.handleSubmit(handleAddNewStage)} className="space-y-4">
                  <FormField
                    control={newStageForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome do Estágio</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: Primeira Reunião" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={newStageForm.control}
                    name="color"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cor</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <div className="flex items-center">
                                <div className={`w-4 h-4 rounded-full mr-2 ${field.value}`}></div>
                                <SelectValue placeholder="Selecione uma cor" />
                              </div>
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {availableColors.map(color => (
                              <SelectItem key={color.value} value={color.value}>
                                <div className="flex items-center">
                                  <div className={`w-4 h-4 rounded-full mr-2 ${color.value}`}></div>
                                  {color.name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsNewStageDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit">Adicionar Estágio</Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
          
          <Dialog open={isNewRuleDialogOpen} onOpenChange={setIsNewRuleDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Move className="mr-2 h-4 w-4" />
                Nova Regra
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Criar Nova Regra de Automação</DialogTitle>
                <DialogDescription>
                  Defina regras para mover automaticamente itens entre estágios ou funis.
                </DialogDescription>
              </DialogHeader>
              <Form {...newRuleForm}>
                <form onSubmit={newRuleForm.handleSubmit(handleAddNewRule)} className="space-y-4">
                  <FormField
                    control={newRuleForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome da Regra</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: Mover para Negociação" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={newRuleForm.control}
                    name="condition"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Quando o item estiver em</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione um estágio" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {activeFunnel?.stages.map(stage => (
                              <SelectItem key={stage.id} value={`stage equals ${stage.id}`}>
                                {stage.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={newRuleForm.control}
                    name="action"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ação</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione a ação" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="move to stage">Mover para outro estágio</SelectItem>
                            <SelectItem value="move to funnel">Mover para outro funil</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {watchRuleAction === "move to stage" && (
                    <FormField
                      control={newRuleForm.control}
                      name="destinationStageId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Estágio de destino</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione o estágio de destino" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {activeFunnel?.stages.map(stage => (
                                <SelectItem key={stage.id} value={stage.id}>
                                  {stage.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  
                  {watchRuleAction === "move to funnel" && (
                    <FormField
                      control={newRuleForm.control}
                      name="destinationFunnelId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Funil de destino</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione o funil de destino" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {funnels.map(funnel => (
                                <SelectItem key={funnel.id} value={funnel.id}>
                                  {funnel.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsNewRuleDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit">Criar Regra</Button>
                  </DialogFooter>
                </form>
              </Form>
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
                    <div className="space-y-2">
                      <Label htmlFor="edit-type">Tipo do Funil</Label>
                      <Select 
                        value={editingFunnel.type}
                        onValueChange={(value: FunnelType) => setEditingFunnel({
                          ...editingFunnel, 
                          type: value
                        })}
                        disabled={true} // Não permitir alterar o tipo após a criação
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="clients">Clientes</SelectItem>
                          <SelectItem value="leads">Leads</SelectItem>
                          <SelectItem value="proposals">Propostas</SelectItem>
                          <SelectItem value="contracts">Contratos</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">O tipo do funil não pode ser alterado após a criação.</p>
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
                      <Select defaultValue={activeFunnel?.stages[0]?.id}>
                        <SelectTrigger id="stage">
                          <SelectValue placeholder="Selecione o estágio" />
                        </SelectTrigger>
                        <SelectContent>
                          {activeFunnel?.stages.map((stage) => (
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
                          {funnels.filter(f => f.type === activeFunnel?.type).map((funnel) => (
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
            handleEditFunnel={handleEditFunnel}
            handleDeleteFunnel={handleDeleteFunnel}
            filteredDeals={filteredDeals}
          />
        </TabsContent>
        <TabsContent value="leads" className="space-y-4">
          <FunnelsList 
            funnels={funnelsByType} 
            activeFunnelId={activeFunnelId}
            setActiveFunnelId={setActiveFunnelId}
            handleEditFunnel={handleEditFunnel}
            handleDeleteFunnel={handleDeleteFunnel}
            filteredDeals={filteredDeals}
          />
        </TabsContent>
        <TabsContent value="proposals" className="space-y-4">
          <FunnelsList 
            funnels={funnelsByType} 
            activeFunnelId={activeFunnelId}
            setActiveFunnelId={setActiveFunnelId}
            handleEditFunnel={handleEditFunnel}
            handleDeleteFunnel={handleDeleteFunnel}
            filteredDeals={filteredDeals}
          />
        </TabsContent>
        <TabsContent value="contracts" className="space-y-4">
          <FunnelsList 
            funnels={funnelsByType} 
            activeFunnelId={activeFunnelId}
            setActiveFunnelId={setActiveFunnelId}
            handleEditFunnel={handleEditFunnel}
            handleDeleteFunnel={handleDeleteFunnel}
            filteredDeals={filteredDeals}
          />
        </TabsContent>
      </Tabs>

      {/* Título do funil ativo */}
      {activeFunnel && (
        <>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">{activeFunnel?.name}</h2>
                <Badge variant="outline">
                  {activeFunnel.type === "clients" && "Clientes"}
                  {activeFunnel.type === "leads" && "Leads"}
                  {activeFunnel.type === "proposals" && "Propostas"}
                  {activeFunnel.type === "contracts" && "Contratos"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{activeFunnel?.description}</p>
            </div>
            <Badge variant="outline" className="mt-2 sm:mt-0">
              {filteredDeals.length} negócios
            </Badge>
          </div>

          {/* Regras do funil ativo */}
          {funnelRules.length > 0 && (
            <div className="bg-muted/50 p-3 rounded-md">
              <h3 className="text-sm font-medium mb-2">Regras Ativas</h3>
              <div className="flex flex-wrap gap-2">
                {funnelRules.map(rule => (
                  <Badge key={rule.id} variant="outline" className="flex items-center gap-1 py-1">
                    {rule.name}
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-4 w-4 ml-1 hover:bg-transparent hover:text-destructive"
                      onClick={() => handleDeleteRule(rule.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Estágios do funil */}
          <div className="grid grid-cols-1 gap-4">
            {activeFunnel?.stages.length === 0 ? (
              <div className="flex items-center justify-center p-8 border border-dashed rounded-md">
                <div className="text-center">
                  <KanbanSquare className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                  <h3 className="text-lg font-medium">Este funil não possui estágios</h3>
                  <p className="text-muted-foreground mb-4">Adicione estágios para começar a gerenciar seus negócios</p>
                  <Button onClick={() => setIsNewStageDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar Estágio
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-6 gap-4">
                {activeFunnel?.stages.sort((a, b) => a.order - b.order).map((stage) => {
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
                        <div className="flex items-center">
                          <Badge variant="secondary" className="bg-white/20 hover:bg-white/30 text-white">
                            R$ {stageTotal.toLocaleString('pt-BR')}
                          </Badge>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 h-7 w-7">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleDeleteStage(stage.id)} className="text-destructive">
                                <Trash2 className="mr-2 h-4 w-4" />
                                Excluir Estágio
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
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
            )}
          </div>
        </>
      )}
    </div>
  );
};

// Componente separado para lista de funis
interface FunnelsListProps {
  funnels: SalesFunnel[];
  activeFunnelId: string;
  setActiveFunnelId: (id: string) => void;
  handleEditFunnel: (funnel: SalesFunnel) => void;
  handleDeleteFunnel: (id: string) => void;
  filteredDeals: Deal[];
}

const FunnelsList = ({ 
  funnels, 
  activeFunnelId, 
  setActiveFunnelId, 
  handleEditFunnel, 
  handleDeleteFunnel,
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
          const funnnelDeals = filteredDeals.filter(deal => deal.funnelId === funnel.id);
          
          return (
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
                      <Button variant="ghost" size="icon" onClick={e => e.stopPropagation()}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Ações do Funil</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        handleEditFunnel(funnel);
                      }}>
                        <Edit className="mr-2 h-4 w-4" />
                        Editar Funil
                      </DropdownMenuItem>
                      {!funnel.isDefault && (
                        <DropdownMenuItem 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFunnel(funnel.id);
                          }}
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
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Estágios: {funnel.stages.length}</span>
                    <span>Negócios: {funnnelDeals.length}</span>
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

