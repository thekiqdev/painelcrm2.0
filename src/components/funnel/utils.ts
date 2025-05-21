
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
    // Format the date correctly for display in Brazilian format
    const today = new Date();
    const formattedDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

    // Insert the funnel into Supabase
    const { data: funnelData, error: funnelError } = await supabase
      .from('sales_funnels')
      .insert({
        name: funnel.name,
        description: funnel.description,
        type: funnel.type,
        is_default: funnel.isDefault,
        source: funnel.source || null
      })
      .select('id')
      .single();

    if (funnelError || !funnelData) {
      console.error("Error creating funnel:", funnelError);
      return { success: false, error: funnelError };
    }

    // Insert stages with the new funnel ID
    const stagesToInsert = stages.map((stage, index) => ({
      name: stage.name,
      color: stage.color,
      funnel_id: funnelData.id,
      order_position: index
    }));

    const { data: stagesData, error: stagesError } = await supabase
      .from('funnel_stages')
      .insert(stagesToInsert)
      .select();

    if (stagesError) {
      console.error("Error creating funnel stages:", stagesError);
      return { success: false, error: stagesError };
    }

    // Construct the response similar to the frontend format
    const newFunnel: SalesFunnel = {
      id: funnelData.id,
      name: funnel.name,
      description: funnel.description || '',
      type: funnel.type,
      isDefault: funnel.isDefault,
      createdAt: formattedDate,
      source: funnel.source,
      stages: stagesData.map((stage) => ({
        id: stage.id,
        name: stage.name,
        color: stage.color,
        order: stage.order_position,
        funnelId: stage.funnel_id
      }))
    };
    
    console.log("Created new funnel:", newFunnel);
    return { success: true, data: newFunnel };
  } catch (error) {
    console.error("Error creating funnel:", error);
    return { success: false, error };
  }
};

// Fetch all funnels from Supabase
export const fetchFunnels = async () => {
  try {
    // Fetch funnels
    const { data: funnelsData, error: funnelsError } = await supabase
      .from('sales_funnels')
      .select('*')
      .order('created_at', { ascending: false });

    if (funnelsError) {
      console.error("Error fetching funnels:", funnelsError);
      return { success: false, error: funnelsError };
    }

    // Fetch all stages
    const { data: stagesData, error: stagesError } = await supabase
      .from('funnel_stages')
      .select('*')
      .order('order_position', { ascending: true });

    if (stagesError) {
      console.error("Error fetching funnel stages:", stagesError);
      return { success: false, error: stagesError };
    }

    // Format the funnels with their stages
    const funnels: SalesFunnel[] = funnelsData.map(funnel => {
      const createdDate = new Date(funnel.created_at);
      const formattedDate = `${String(createdDate.getDate()).padStart(2, '0')}/${String(createdDate.getMonth() + 1).padStart(2, '0')}/${createdDate.getFullYear()}`;
      
      return {
        id: funnel.id,
        name: funnel.name,
        description: funnel.description || '',
        type: funnel.type as any, // Cast to the correct type
        isDefault: funnel.is_default,
        createdAt: formattedDate,
        source: funnel.source,
        stages: stagesData
          .filter(stage => stage.funnel_id === funnel.id)
          .map(stage => ({
            id: stage.id,
            name: stage.name,
            color: stage.color,
            order: stage.order_position,
            funnelId: stage.funnel_id
          }))
      };
    });

    return { success: true, data: funnels };
  } catch (error) {
    console.error("Error fetching funnels:", error);
    return { success: false, error };
  }
};

// Update funnel in Supabase
export const updateFunnel = async (funnel: SalesFunnel) => {
  try {
    const { error: funnelError } = await supabase
      .from('sales_funnels')
      .update({
        name: funnel.name,
        description: funnel.description,
        type: funnel.type,
        is_default: funnel.isDefault,
        source: funnel.source,
        updated_at: new Date().toISOString()
      })
      .eq('id', funnel.id);

    if (funnelError) {
      console.error("Error updating funnel:", funnelError);
      return { success: false, error: funnelError };
    }

    // We could update stages here if needed, but for now we'll just return success
    return { success: true };
  } catch (error) {
    console.error("Error updating funnel:", error);
    return { success: false, error };
  }
};

// Filter clients by date range
export const filterClientsByDateRange = async (
  startDate: Date | null,
  endDate: Date | null,
  source: string | null = null
) => {
  try {
    let query = supabase.from('clients').select('*');
    
    if (startDate) {
      query = query.gte('created_at', startDate.toISOString());
    }
    
    if (endDate) {
      query = query.lte('created_at', endDate.toISOString());
    }
    
    if (source) {
      query = query.eq('source', source);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error("Error filtering clients:", error);
      return { success: false, error };
    }
    
    return { success: true, data };
  } catch (error) {
    console.error("Error filtering clients:", error);
    return { success: false, error };
  }
};
