
import { supabase } from "@/integrations/supabase/client";

export interface EvolutionApiConfig {
  id: string;
  name: string;
  api_url: string;
  global_key: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const getActiveConfig = async (): Promise<EvolutionApiConfig | null> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error("Usuário não autenticado ao buscar configuração ativa");
      return null;
    }

    const { data, error } = await supabase
      .from('evolution_api_configs')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        console.log("Nenhuma configuração ativa encontrada");
        return null;
      }
      console.error("Erro ao buscar configuração ativa:", error);
      return null;
    }

    return data;
  } catch (error) {
    console.error("Erro ao obter configuração ativa:", error);
    return null;
  }
};

export const getAllConfigs = async (): Promise<EvolutionApiConfig[]> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error("Usuário não autenticado ao buscar configurações");
      return [];
    }

    const { data, error } = await supabase
      .from('evolution_api_configs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Erro ao buscar configurações:", error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("Erro ao obter configurações:", error);
    return [];
  }
};

export const saveConfig = async (name: string, apiUrl: string, globalKey: string): Promise<EvolutionApiConfig | null> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error("Usuário não autenticado ao salvar configuração");
      throw new Error("Usuário não autenticado");
    }

    const { data, error } = await supabase
      .from('evolution_api_configs')
      .insert({
        user_id: user.id,
        name,
        api_url: apiUrl,
        global_key: globalKey,
        is_active: false
      })
      .select()
      .single();

    if (error) {
      console.error("Erro ao salvar configuração:", error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error("Erro ao salvar configuração:", error);
    throw error;
  }
};

export const updateConfig = async (id: string, updates: Partial<EvolutionApiConfig>): Promise<EvolutionApiConfig | null> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error("Usuário não autenticado ao atualizar configuração");
      throw new Error("Usuário não autenticado");
    }

    const { data, error } = await supabase
      .from('evolution_api_configs')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error("Erro ao atualizar configuração:", error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error("Erro ao atualizar configuração:", error);
    throw error;
  }
};

export const deleteConfig = async (id: string): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error("Usuário não autenticado ao deletar configuração");
      throw new Error("Usuário não autenticado");
    }

    const { error } = await supabase
      .from('evolution_api_configs')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error("Erro ao deletar configuração:", error);
      throw error;
    }

    return true;
  } catch (error) {
    console.error("Erro ao deletar configuração:", error);
    throw error;
  }
};

export const setActiveConfig = async (id: string): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error("Usuário não autenticado ao definir configuração ativa");
      throw new Error("Usuário não autenticado");
    }

    // Primeiro, desativar todas as configurações
    await supabase
      .from('evolution_api_configs')
      .update({ is_active: false })
      .eq('user_id', user.id);

    // Depois, ativar a configuração selecionada
    const { error } = await supabase
      .from('evolution_api_configs')
      .update({ is_active: true })
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error("Erro ao definir configuração ativa:", error);
      throw error;
    }

    return true;
  } catch (error) {
    console.error("Erro ao definir configuração ativa:", error);
    throw error;
  }
};
