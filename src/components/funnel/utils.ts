
import { FunnelStage, SalesFunnel, Client } from "./types";
import * as funnelsService from "@/services/funnels";

// Re-exportar tipos e funções do serviço
export type { FunnelData, StageData } from "@/services/funnels";
export { fetchFunnels, createFunnel, updateFunnel, deleteFunnel, updateClientStage } from "@/services/funnels";

// Função para mapear dados da API para nossa interface SalesFunnel (mantida para compatibilidade)
// Nota: Renomeada de mapSupabaseToSalesFunnel para manter compatibilidade com código existente
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

// Alias para manter compatibilidade (agora mapeia dados da API PostgreSQL)
export const mapApiToSalesFunnel = mapSupabaseToSalesFunnel;

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
  // TODO: Implementar lógica para salvar regra na API
  return true;
};

export const handleRemoveRule = (ruleId: string) => {
  console.log("Removendo regra:", ruleId);
  // TODO: Implementar lógica para remover regra na API
  return true;
};

// updateClientStage já está exportado do serviço de funnels
