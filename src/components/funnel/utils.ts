
// Precisamos criar este arquivo se não existir ou atualizar se existir
// para garantir que todas as operações de funnel filtrem por user_id
import { supabase } from "@/integrations/supabase/client";
import { withUserId } from "@/utils/auth-helpers";
import { FunnelStage, SalesFunnel, Client } from "./types";

// Interface para os dados do funil
export interface FunnelData {
  name: string;
  description?: string;
  type: string;
  isDefault: boolean;
  source?: string;
}

// Interface para os dados de estágios do funil
export interface StageData {
  name: string;
  color: string;
}

// Função para mapear dados do Supabase para nossa interface SalesFunnel
export const mapSupabaseToSalesFunnel = (data: any[]): SalesFunnel[] => {
  if (!data || !Array.isArray(data)) return [];
  
  return data.map(item => ({
    id: item.id,
    name: item.name,
    description: item.description || '',
    type: item.type,
    isDefault: item.is_default || false,
    createdAt: item.created_at,
    source: item.source || undefined,
    stages: Array.isArray(item.stages) ? item.stages.map((stage: any) => ({
      id: stage.id,
      name: stage.name,
      color: stage.color,
      order: stage.order_position,
      funnelId: stage.funnel_id
    })) : []
  }));
};

// Buscar funis do usuário atual
export const fetchFunnels = async () => {
  try {
    const { data: session } = await supabase.auth.getSession();
    
    if (!session.session?.user?.id) {
      return { success: false, error: "Usuário não autenticado", data: [] };
    }
    
    const userId = session.session.user.id;
    
    const { data, error } = await supabase
      .from("sales_funnels")
      .select("*, stages:funnel_stages(*)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return { success: true, data: mapSupabaseToSalesFunnel(data) };
  } catch (error: any) {
    console.error("Erro ao buscar funis:", error.message);
    return { success: false, error, data: [] };
  }
};

// Criar um novo funil com estágios
export const createFunnel = async (funnelData: FunnelData, stages: StageData[]) => {
  try {
    // Adicionar user_id aos dados do funil
    const dataWithUserId = await withUserId(funnelData);
    if (!dataWithUserId) {
      throw new Error("Usuário não autenticado");
    }
    
    // Inserir o funil
    const { data: newFunnel, error: funnelError } = await supabase
      .from("sales_funnels")
      .insert(dataWithUserId)
      .select()
      .single();

    if (funnelError) throw funnelError;
    
    // Inserir os estágios
    if (stages.length > 0 && newFunnel) {
      const stagesWithMetadata = stages.map((stage, index) => ({
        funnel_id: newFunnel.id,
        name: stage.name,
        color: stage.color,
        order_position: index
      }));
      
      // Adicionar user_id a cada estágio
      const stagesWithUserId = [];
      
      for (const stage of stagesWithMetadata) {
        const stageWithUserId = await withUserId(stage);
        if (stageWithUserId) {
          stagesWithUserId.push(stageWithUserId);
        }
      }
      
      const { error: stagesError } = await supabase
        .from("funnel_stages")
        .insert(stagesWithUserId);

      if (stagesError) throw stagesError;
    }
    
    // Buscar o funil completo com os estágios
    const { data: completeFunnel, error: fetchError } = await supabase
      .from("sales_funnels")
      .select("*, stages:funnel_stages(*)")
      .eq("id", newFunnel.id)
      .single();
      
    if (fetchError) throw fetchError;
    
    return { 
      success: true, 
      data: mapSupabaseToSalesFunnel([completeFunnel])[0]
    };
  } catch (error: any) {
    console.error("Erro ao criar funil:", error.message);
    return { success: false, error };
  }
};

// Funções para gerenciar eventos de drag and drop
export const handleDragOver = (e: React.DragEvent) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
};

export const handleDrop = (e: React.DragEvent, stageId: string) => {
  e.preventDefault();
  const clientId = e.dataTransfer.getData("clientId");
  return { clientId, stageId };
};

// Funções para gerenciar tags de clientes
export const handleAddTagToClient = (client: Client, tagId: string): Client => {
  const newTags = client.tags ? [...client.tags, tagId] : [tagId];
  return { ...client, tags: newTags };
};

export const handleRemoveTagFromClient = (client: Client, tagId: string): Client => {
  const newTags = client.tags ? client.tags.filter(id => id !== tagId) : [];
  return { ...client, tags: newTags };
};

// Funções para gerenciar regras
export interface Rule {
  id: string;
  name: string;
  conditions: any[];
  actions: any[];
}

export const handleSaveRule = (rule: Rule) => {
  console.log("Salvando regra:", rule);
  // Implementar lógica para salvar regra no Supabase
  return true;
};

export const handleRemoveRule = (ruleId: string) => {
  console.log("Removendo regra:", ruleId);
  // Implementar lógica para remover regra do Supabase
  return true;
};

// Função para atualizar o estágio de um cliente
export const updateClientStage = async (clientId: string, stageId: string) => {
  try {
    const { data, error } = await supabase
      .from("clients")
      .update({ funnel_stage: stageId })
      .eq("id", clientId);
      
    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error("Erro ao atualizar estágio do cliente:", error.message);
    return { success: false, error };
  }
};
