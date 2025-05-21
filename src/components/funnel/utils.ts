
import { Client, Rule, SalesFunnel, FunnelStage } from './types';
import { supabase } from '@/integrations/supabase/client';

// Drag and drop handlers
export const handleDragOver = (e: React.DragEvent) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
};

export const handleDrop = (e: React.DragEvent, stageId: string) => {
  e.preventDefault();
  const clientId = e.dataTransfer.getData("clientId");
  return { clientId, stageId };
};

// Client tag handlers
export const handleAddTagToClient = (client: Client, tagId: string): Client => {
  if (!client.tags) {
    return { ...client, tags: [tagId] };
  }
  
  if (client.tags.includes(tagId)) {
    return client;
  }
  
  return {
    ...client,
    tags: [...client.tags, tagId]
  };
};

export const handleRemoveTagFromClient = (client: Client, tagId: string): Client => {
  if (!client.tags || !client.tags.includes(tagId)) {
    return client;
  }
  
  return {
    ...client,
    tags: client.tags.filter(id => id !== tagId)
  };
};

// Rules handlers
export const handleSaveRule = (rule: Rule): void => {
  console.log("Save rule:", rule);
  // Here we can implement logic to save the rule to the database
};

export const handleRemoveRule = (ruleId: string): void => {
  console.log("Remove rule:", ruleId);
  // Here we can implement logic to remove the rule from the database
};

// Update client stage in Supabase
export const updateClientStage = async (clientId: string, stageId: string) => {
  try {
    const { error } = await supabase
      .from('clients')
      .update({ funnel_stage: stageId })
      .eq('id', clientId);
      
    return { success: !error, error };
  } catch (error) {
    console.error("Error updating client stage:", error);
    return { success: false, error };
  }
};

// Create a new funnel
export const createFunnel = async (funnel: Omit<SalesFunnel, "id" | "createdAt" | "stages">, stages: Omit<FunnelStage, "id" | "funnelId" | "order">[]) => {
  try {
    // Generate unique IDs
    const funnelId = `funnel-${Date.now()}`;
    const formattedDate = new Date().toLocaleDateString('pt-BR');

    // Create a new funnel with stages
    const newFunnel: SalesFunnel = {
      ...funnel,
      id: funnelId,
      createdAt: formattedDate,
      stages: stages.map((stage, index) => ({
        ...stage,
        id: `stage-${Date.now()}-${index}`,
        order: index,
        funnelId: funnelId
      }))
    };
    
    // Here we would save the funnel to the database
    // For now, we'll just console log and return the new funnel
    console.log("Created new funnel:", newFunnel);
    
    return { success: true, data: newFunnel };
  } catch (error) {
    console.error("Error creating funnel:", error);
    return { success: false, error };
  }
};
