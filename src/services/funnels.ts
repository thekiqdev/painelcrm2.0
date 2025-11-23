import { apiClient } from "@/integrations/api/client";
import { SalesFunnel, FunnelStage } from "@/components/funnel/types";

// Interface para os dados do funil
export interface FunnelData {
  name: string;
  description?: string;
  type: string;
  is_default?: boolean;
  source?: string;
  profile_id?: string;
}

// Interface para os dados de estágios do funil
export interface StageData {
  name: string;
  color: string;
}

// Função para mapear dados da API para nossa interface SalesFunnel
export const mapApiToSalesFunnel = (data: any): SalesFunnel => {
  return {
    id: data.id,
    name: data.name,
    description: data.description || '',
    type: data.type,
    isDefault: data.is_default || false,
    createdAt: data.created_at,
    source: data.source || undefined,
    profile_id: data.profile_id || undefined,
    stages: Array.isArray(data.stages) ? data.stages.map((stage: any) => ({
      id: stage.id,
      name: stage.name,
      color: stage.color,
      order: stage.order_position,
      funnelId: stage.funnel_id
    })) : []
  };
};

// Buscar funis do usuário atual
export const fetchFunnels = async (profileId?: string) => {
  try {
    const url = profileId ? `/api/funnels?profileId=${profileId}` : '/api/funnels';
    const response = await apiClient.get<any[]>(url);
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    const funnels = (response.data || []).map(funnel => {
      // Se o funnel não tiver stages, buscar separadamente
      if (!funnel.stages) {
        return mapApiToSalesFunnel(funnel);
      }
      return mapApiToSalesFunnel(funnel);
    });
    
    return { success: true, data: funnels };
  } catch (error: any) {
    console.error("Erro ao buscar funis:", error.message);
    return { success: false, error, data: [] };
  }
};

// Buscar um funil específico por ID
export const fetchFunnelById = async (id: string) => {
  try {
    const response = await apiClient.get<any>(`/api/funnels/${id}`);
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    return { 
      success: true, 
      data: mapApiToSalesFunnel(response.data || {}) 
    };
  } catch (error: any) {
    console.error("Erro ao buscar funil:", error.message);
    return { success: false, error };
  }
};

// Criar um novo funil com estágios
export const createFunnel = async (funnelData: FunnelData, stages: StageData[]) => {
  try {
    // Preparar os estágios com order_position
    const stagesWithOrder = stages.map((stage, index) => ({
      name: stage.name,
      color: stage.color,
      order_position: index
    }));

    // Criar o funil com estágios em uma única requisição
    const funnelResponse = await apiClient.post<any>('/api/funnels', {
      name: funnelData.name,
      description: funnelData.description,
      type: funnelData.type,
      source: funnelData.source,
      is_default: funnelData.is_default || false,
      profile_id: funnelData.profile_id,
      stages: stagesWithOrder
    });
    
    if (funnelResponse.error) {
      throw new Error(funnelResponse.error);
    }
    
    const newFunnel = funnelResponse.data;
    
    if (!newFunnel || !newFunnel.id) {
      throw new Error("Erro ao criar funil: ID não retornado");
    }
    
    // O backend já retorna o funil com os estágios
    return { 
      success: true, 
      data: mapApiToSalesFunnel(newFunnel)
    };
  } catch (error: any) {
    console.error("Erro ao criar funil:", error.message);
    return { success: false, error };
  }
};

// Atualizar um funil
export const updateFunnel = async (id: string, funnelData: Partial<FunnelData>) => {
  try {
    const response = await apiClient.patch<any>(`/api/funnels/${id}`, funnelData);
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    return { 
      success: true, 
      data: mapApiToSalesFunnel(response.data || {}) 
    };
  } catch (error: any) {
    console.error("Erro ao atualizar funil:", error.message);
    return { success: false, error };
  }
};

// Excluir um funil
export const deleteFunnel = async (id: string) => {
  try {
    const response = await apiClient.delete(`/api/funnels/${id}`);
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    return { success: true };
  } catch (error: any) {
    console.error("Erro ao excluir funil:", error.message);
    return { success: false, error };
  }
};

// Criar um novo estágio para um funil
export const createStage = async (funnelId: string, stageData: StageData) => {
  try {
    const response = await apiClient.post<any>(`/api/funnels/${funnelId}/stages`, {
      name: stageData.name,
      color: stageData.color,
      order_position: 0 // Será ajustado pelo backend se necessário
    });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    return { success: true, data: response.data };
  } catch (error: any) {
    console.error("Erro ao criar estágio:", error.message);
    return { success: false, error };
  }
};

// Atualizar um estágio
export const updateStage = async (stageId: string, stageData: Partial<StageData> & { order_position?: number }) => {
  try {
    const updateData: any = {};
    if (stageData.name) updateData.name = stageData.name;
    if (stageData.color) updateData.color = stageData.color;
    if (stageData.order_position !== undefined) updateData.order_position = stageData.order_position;
    
    const response = await apiClient.patch<any>(`/api/funnels/stages/${stageId}`, updateData);
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    return { success: true, data: response.data };
  } catch (error: any) {
    console.error("Erro ao atualizar estágio:", error.message);
    return { success: false, error };
  }
};

// Excluir um estágio
export const deleteStage = async (stageId: string) => {
  try {
    const response = await apiClient.delete(`/api/funnels/stages/${stageId}`);
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    return { success: true };
  } catch (error: any) {
    console.error("Erro ao excluir estágio:", error.message);
    return { success: false, error };
  }
};

// Atualizar o estágio de um cliente
export const updateClientStage = async (clientId: string, stageId: string) => {
  try {
    const response = await apiClient.patch(`/api/clients/${clientId}`, {
      funnel_stage: stageId
    });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    return { success: true, data: response.data };
  } catch (error: any) {
    console.error("Erro ao atualizar estágio do cliente:", error.message);
    return { success: false, error };
  }
};

