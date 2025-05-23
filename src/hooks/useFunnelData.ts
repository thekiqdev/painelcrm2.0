
import { useState, useEffect } from "react";
import { FunnelType, SalesFunnel, Deal } from "@/components/funnel/types";
import { fetchFunnels, createFunnel } from "@/components/funnel/utils";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

// Example deals data for development/testing
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

export function useFunnelData() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<FunnelType>("clients");
  const [funnels, setFunnels] = useState<SalesFunnel[]>([]);
  const [deals] = useState<Deal[]>(initialDeals);
  const [activeFunnelId, setActiveFunnelId] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  
  // New funnel form state
  const [newFunnelName, setNewFunnelName] = useState("");
  const [newFunnelDesc, setNewFunnelDesc] = useState("");
  const [newFunnelType, setNewFunnelType] = useState<FunnelType>("clients");
  const [newFunnelSource, setNewFunnelSource] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user) { // Só carrega os funis se o usuário estiver autenticado
      loadFunnels();
    } else {
      setIsLoading(false);
    }
  }, [user]); // Adicionado user como dependência

  const loadFunnels = async () => {
    if (!user) {
      console.log("Não carregando funis pois não há usuário autenticado");
      return;
    }
    
    setIsLoading(true);
    try {
      console.log("Iniciando carregamento de funis");
      const result = await fetchFunnels();
      
      if (result.success && result.data) {
        console.log(`Funis carregados com sucesso: ${result.data.length} funis encontrados`);
        setFunnels(result.data);
        // Set active funnel to the first one if available
        if (result.data.length > 0) {
          setActiveFunnelId(result.data[0].id);
        }
      } else {
        console.error("Erro no resultado da busca de funis:", result.error);
        toast.error("Erro ao carregar funis: " + (result.error?.message || "Erro desconhecido"));
      }
    } catch (error: any) {
      console.error("Error loading funnels:", error);
      toast.error("Erro ao carregar funis: " + (error?.message || "Erro desconhecido"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewFunnelDetails = (funnelId: string) => {
    navigate(`/funnel/${funnelId}`);
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
      console.log("Iniciando criação de funil:", {
        name: newFunnelName,
        type: newFunnelType,
        source: newFunnelSource || undefined
      });
      
      // Create the new funnel
      const result = await createFunnel(
        {
          name: newFunnelName,
          description: newFunnelDesc,
          type: newFunnelType,
          is_default: false, // Changed from isDefault to is_default
          source: newFunnelSource || undefined,
        },
        defaultStages
      );
      
      if (result.success && result.data) {
        console.log("Funil criado com sucesso:", result.data);
        // First update state
        setFunnels([...funnels, result.data]);
        setActiveFunnelId(result.data.id);
        setActiveTab(result.data.type as FunnelType);
        
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
        console.error("Erro ao criar funil:", result.error);
        toast.error("Erro ao criar o funil: " + (result.error?.message || "Tente novamente."));
      }
    } catch (error: any) {
      console.error("Error creating funnel:", error);
      toast.error("Erro ao criar o funil: " + (error?.message || "Tente novamente."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    activeTab,
    setActiveTab,
    funnels,
    deals,
    activeFunnelId,
    setActiveFunnelId,
    dialogOpen,
    setDialogOpen,
    isLoading,
    newFunnelName,
    setNewFunnelName,
    newFunnelDesc,
    setNewFunnelDesc,
    newFunnelType,
    setNewFunnelType,
    newFunnelSource,
    setNewFunnelSource,
    isSubmitting,
    handleViewFunnelDetails,
    handleCreateFunnel
  };
}
