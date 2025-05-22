// Precisamos criar este arquivo se não existir ou atualizar se existir
// para garantir que todas as operações de funnel filtrem por user_id
import { supabase } from "@/integrations/supabase/client";
import { withUserId } from "@/utils/auth-helpers";

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
    return { success: true, data };
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
    
    return { success: true, data: completeFunnel };
  } catch (error: any) {
    console.error("Erro ao criar funil:", error.message);
    return { success: false, error };
  }
};

// Adicione mais funções conforme necessário
