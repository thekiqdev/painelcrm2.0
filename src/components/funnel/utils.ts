
import { supabase } from "@/integrations/supabase/client";
import { withUserId, getUserProfiles } from "@/utils/auth-helpers";
import { FunnelStage, SalesFunnel, Client } from "./types";

// Interface para os dados do funil
export interface FunnelData {
  name: string;
  description?: string;
  type: string;
  isDefault: boolean;
  source?: string;
  profile_id?: string;
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
    profile_id: item.profile_id || undefined,
    stages: Array.isArray(item.stages) ? item.stages.map((stage: any) => ({
      id: stage.id,
      name: stage.name,
      color: stage.color,
      order: stage.order_position,
      funnelId: stage.funnel_id
    })) : []
  }));
};

// Buscar funis do usuário atual e perfis relacionados
export const fetchFunnels = async (profileId?: string) => {
  try {
    const userId = await withUserId({});
    
    if (!userId) {
      console.error("Erro ao buscar funis: Usuário não autenticado");
      return { success: false, error: "Usuário não autenticado", data: [] };
    }
    
    console.log("Buscando funis do usuário:", userId.user_id);
    
    let query = supabase
      .from("sales_funnels")
      .select("*, stages:funnel_stages(*)");
      
    if (profileId) {
      // Se tiver um profileId, busca os funis desse perfil
      console.log("Filtrando funis por perfil:", profileId);
      query = query.eq("profile_id", profileId);
    } else {
      // Caso contrário, busca os funis pessoais do usuário ou de qualquer perfil que ele tenha acesso
      const userProfiles = await getUserProfiles();
      if (userProfiles && userProfiles.length > 0) {
        const profileIds = userProfiles.map(profile => profile.id);
        console.log("Filtrando funis pelos perfis:", profileIds);
        
        // Busca os funis pessoais ou de qualquer perfil do usuário
        query = query.or(`user_id.eq.${userId.user_id},profile_id.in.(${profileIds.join(',')})`);
      } else {
        // Se não encontrar perfis, busca apenas os funis pessoais
        query = query.eq("user_id", userId.user_id);
      }
    }
    
    query = query.order("created_at", { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error("Erro ao buscar funis:", error);
      throw error;
    }
    
    console.log(`Encontrados ${data?.length || 0} funis`);
    return { success: true, data: mapSupabaseToSalesFunnel(data || []) };
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
      console.error("Erro ao criar funil: Usuário não autenticado");
      throw new Error("Usuário não autenticado");
    }
    
    console.log("Criando funil para usuário:", dataWithUserId.user_id);
    
    // Inserir o funil
    const { data: newFunnel, error: funnelError } = await supabase
      .from("sales_funnels")
      .insert(dataWithUserId)
      .select()
      .single();

    if (funnelError) {
      console.error("Erro ao inserir funil:", funnelError);
      throw funnelError;
    }
    
    if (!newFunnel || !newFunnel.id) {
      console.error("Erro: Funil criado sem ID retornado");
      throw new Error("Erro ao criar funil: ID não retornado");
    }
    
    console.log("Funil criado com sucesso:", newFunnel.id);
    
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
      
      console.log(`Inserindo ${stagesWithUserId.length} estágios para o funil ${newFunnel.id}`);
      
      const { error: stagesError } = await supabase
        .from("funnel_stages")
        .insert(stagesWithUserId);

      if (stagesError) {
        console.error("Erro ao inserir estágios:", stagesError);
        throw stagesError;
      }
    }
    
    // Buscar o funil completo com os estágios
    const { data: completeFunnel, error: fetchError } = await supabase
      .from("sales_funnels")
      .select("*, stages:funnel_stages(*)")
      .eq("id", newFunnel.id)
      .single();
      
    if (fetchError) {
      console.error("Erro ao buscar funil completo:", fetchError);
      throw fetchError;
    }
    
    console.log("Funil completo carregado com sucesso");
    
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
