import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Calendar, Filter } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useNavigate } from "react-router-dom";
import FunnelsList from "@/components/funnel/FunnelsList";
import { createFunnel, fetchFunnels } from "@/components/funnel/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";

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

type FunnelType = "clients" | "leads" | "proposals" | "contracts";

type SalesFunnel = {
  id: string;
  name: string;
  description: string;
  type: FunnelType;
  isDefault: boolean;
  createdAt: string;
  source?: string;
  stages: {
    id: string;
    name: string;
    color: string;
    order: number;
    funnelId: string;
  }[];
};

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

// List of source options - fixing the empty value issue here
const sourceOptions = [
  { value: "all", label: "Todas as fontes" },  // Changed from empty string to "all"
  { value: "Website", label: "Website" },
  { value: "Indicação", label: "Indicação" },
  { value: "Mídia Social", label: "Mídia Social" },
  { value: "Email Marketing", label: "Email Marketing" },
  { value: "Google", label: "Google" },
  { value: "Evento", label: "Evento" },
  { value: "Outros", label: "Outros" }
];

const Funnel = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<FunnelType>("clients");
  const [funnels, setFunnels] = useState<SalesFunnel[]>([]);
  const [deals, setDeals] = useState<Deal[]>(initialDeals);
  const [activeFunnelId, setActiveFunnelId] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth(); // Adicionando o uso do contexto de autenticação
  
  // Date range filter
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  
  // Updated the initial selectedSource value to match our new "all" value
  const [selectedSource, setSelectedSource] = useState<string>("all");
  
  // New funnel form state
  const [newFunnelName, setNewFunnelName] = useState("");
  const [newFunnelDesc, setNewFunnelDesc] = useState("");
  const [newFunnelType, setNewFunnelType] = useState<FunnelType>("clients");
  const [newFunnelSource, setNewFunnelSource] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user) { // Só carrega os funis se o usuário estiver autenticado
      loadFunnels();
    }
  }, [user]); // Adicionado user como dependência

  const loadFunnels = async () => {
    if (!user) return; // Não carrega se não houver usuário
    
    setIsLoading(true);
    try {
      const result = await fetchFunnels();
      if (result.success && result.data) {
        setFunnels(result.data);
        // Set active funnel to the first one if available
        if (result.data.length > 0) {
          setActiveFunnelId(result.data[0].id);
        }
      } else {
        toast.error("Erro ao carregar funis");
      }
    } catch (error) {
      console.error("Error loading funnels:", error);
      toast.error("Erro ao carregar funis");
    } finally {
      setIsLoading(false);
    }
  };

  // Filtrar funis pelo tipo ativo
  const funnelsByType = funnels.filter(f => f.type === activeTab);
  const activeFunnel = funnels.find(f => f.id === activeFunnelId) || (funnels.length > 0 ? funnels[0] : null);

  const handleViewFunnelDetails = (funnelId: string) => {
    navigate(`/funnel/${funnelId}`);
  };

  // Handle date filter changes
  const handleDateFilter = () => {
    // Implementation would filter clients based on date range
    toast.info(`Filtrando por data: ${startDate ? format(startDate, 'dd/MM/yyyy') : 'Início'} até ${endDate ? format(endDate, 'dd/MM/yyyy') : 'Hoje'}`);
  };

  // Updated handler to handle the "all" value instead of empty string
  const handleSourceFilter = (source: string) => {
    setSelectedSource(source);
    toast.info(`Filtrando por fonte: ${source === "all" ? 'Todas' : source}`);
  };

  // Handle form submission
  const handleCreateFunnel = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast.error("Você precisa estar logado para criar um funil");
      return;
    }
    
    if (!newFunnelName.trim()) {
      toast.error("O nome do funil é obrigatório");
      return;
    }
    
    setIsSubmitting(true);
    
    // Define default stages based on funnel type
    let defaultStages = [];
    
    if (newFunnelType === "clients") {
      defaultStages = [
        { name: "Prospecção", color: "bg-blue-500" },
        { name: "Qualificação", color: "bg-purple-500" },
        { name: "Proposta", color: "bg-amber-500" },
        { name: "Negociação", color: "bg-green-500" },
        { name: "Fechado", color: "bg-emerald-500" },
        { name: "Perdido", color: "bg-red-500" }
      ];
    } else if (newFunnelType === "leads") {
      defaultStages = [
        { name: "Novo Lead", color: "bg-blue-500" },
        { name: "Contato", color: "bg-purple-500" },
        { name: "Qualificado", color: "bg-green-500" },
        { name: "Convertido", color: "bg-emerald-500" },
        { name: "Rejeitado", color: "bg-red-500" }
      ];
    } else if (newFunnelType === "proposals") {
      defaultStages = [
        { name: "Nova", color: "bg-blue-500" },
        { name: "Em Elaboração", color: "bg-purple-500" },
        { name: "Enviada", color: "bg-amber-500" },
        { name: "Em Análise", color: "bg-green-500" },
        { name: "Aceita", color: "bg-emerald-500" },
        { name: "Recusada", color: "bg-red-500" }
      ];
    } else if (newFunnelType === "contracts") {
      defaultStages = [
        { name: "Novo Contrato", color: "bg-blue-500" },
        { name: "Em Elaboração", color: "bg-purple-500" },
        { name: "Em Análise", color: "bg-amber-500" },
        { name: "Assinatura", color: "bg-green-500" },
        { name: "Concluído", color: "bg-emerald-500" },
        { name: "Cancelado", color: "bg-red-500" }
      ];
    }
    
    try {
      // Create the new funnel
      const result = await createFunnel(
        {
          name: newFunnelName,
          description: newFunnelDesc,
          type: newFunnelType,
          isDefault: false,
          source: newFunnelSource || undefined,
        },
        defaultStages
      );
      
      if (result.success && result.data) {
        // First update state
        const updatedFunnels = [...funnels, result.data];
        setFunnels(updatedFunnels);
        setActiveFunnelId(result.data.id);
        setActiveTab(result.data.type);
        
        // Reset form and close dialog
        setNewFunnelName("");
        setNewFunnelDesc("");
        setNewFunnelSource("");
        setDialogOpen(false);
        
        // Show success message
        toast.success("Funil criado com sucesso!");
        
        // Then navigate
        setTimeout(() => {
          navigate(`/funnel/${result.data.id}`);
        }, 300);
      } else {
        toast.error("Erro ao criar o funil. Tente novamente.");
      }
    } catch (error) {
      console.error("Error creating funnel:", error);
      toast.error("Erro ao criar o funil. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold">Funil de Vendas</h1>

        <div className="flex flex-col sm:flex-row gap-2">
          {/* Filters */}
          <div className="flex gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <Calendar className="h-4 w-4 mr-2" />
                  Filtrar por Data
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <div className="p-4 space-y-4">
                  <div>
                    <Label>Data Inicial</Label>
                    <CalendarComponent
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      locale={ptBR}
                      className="rounded-md border mt-2"
                    />
                  </div>
                  <div>
                    <Label>Data Final</Label>
                    <CalendarComponent
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      locale={ptBR}
                      className="rounded-md border mt-2"
                    />
                  </div>
                  <Button className="w-full" onClick={handleDateFilter}>Aplicar Filtro</Button>
                </div>
              </PopoverContent>
            </Popover>

            <Select value={selectedSource} onValueChange={handleSourceFilter}>
              <SelectTrigger className="w-[180px]">
                <div className="flex items-center">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Fonte" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {sourceOptions.map(option => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-set-new-funnel-dialog>
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
              <form onSubmit={handleCreateFunnel}>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">Título</Label>
                      <Input 
                        id="title" 
                        placeholder="Ex: Funil de Vendas" 
                        value={newFunnelName}
                        onChange={(e) => setNewFunnelName(e.target.value)}
                        required 
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="type">Tipo</Label>
                      <Select 
                        value={newFunnelType} 
                        onValueChange={(value) => setNewFunnelType(value as FunnelType)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="clients">Clientes</SelectItem>
                          <SelectItem value="leads">Leads</SelectItem>
                          <SelectItem value="proposals">Propostas</SelectItem>
                          <SelectItem value="contracts">Contratos</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="source">Fonte</Label>
                      <Select 
                        value={newFunnelSource} 
                        onValueChange={(value) => setNewFunnelSource(value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a fonte" />
                        </SelectTrigger>
                        <SelectContent>
                          {sourceOptions.slice(1).map(option => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="description">Descrição</Label>
                      <Textarea 
                        id="description" 
                        placeholder="Descreva o funil..." 
                        value={newFunnelDesc}
                        onChange={(e) => setNewFunnelDesc(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setDialogOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={isSubmitting || !newFunnelName.trim()}
                  >
                    {isSubmitting ? 'Criando...' : 'Criar Funil'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Tabs para tipos de funis */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as FunnelType)}>
        <TabsList className="mb-4">
          <TabsTrigger value="clients">Clientes</TabsTrigger>
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="proposals">Propostas</TabsTrigger>
          <TabsTrigger value="contracts">Contratos</TabsTrigger>
        </TabsList>

        {/* Loading state */}
        {isLoading ? (
          <div className="bg-muted rounded-md p-8 flex items-center justify-center">
            <p className="text-muted-foreground">Carregando funis...</p>
          </div>
        ) : (
          <>
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
          </>
        )}
      </Tabs>
    </div>
  );
};

export default Funnel;
