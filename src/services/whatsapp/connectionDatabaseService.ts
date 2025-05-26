
import { supabase } from "@/integrations/supabase/client";

export interface DatabaseConnection {
  id: string;
  user_id: string;
  name: string;
  type: string;
  status: string;
  instance_name?: string;
  phone_number?: string;
  webhook_url?: string;
  config_data: any;
  qr_code?: string;
  created_at: string;
  updated_at: string;
}

export const connectionDatabaseService = {
  // Buscar todas as conexões do usuário
  async getConnections(): Promise<DatabaseConnection[]> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Usuário não autenticado");
      }

      const { data, error } = await supabase
        .from("whatsapp_connections")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Erro ao buscar conexões:", error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error("Erro ao buscar conexões:", error);
      return [];
    }
  },

  // Salvar nova conexão
  async saveConnection(connectionData: {
    name: string;
    type: string;
    status: string;
    instance_name?: string;
    phone_number?: string;
    webhook_url?: string;
    config_data?: any;
    qr_code?: string;
  }): Promise<DatabaseConnection | null> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Usuário não autenticado");
      }

      const { data, error } = await supabase
        .from("whatsapp_connections")
        .insert({
          user_id: user.id,
          name: connectionData.name,
          type: connectionData.type,
          status: connectionData.status,
          instance_name: connectionData.instance_name,
          phone_number: connectionData.phone_number,
          webhook_url: connectionData.webhook_url,
          config_data: connectionData.config_data || {},
          qr_code: connectionData.qr_code
        })
        .select()
        .single();

      if (error) {
        console.error("Erro ao salvar conexão:", error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error("Erro ao salvar conexão:", error);
      throw error;
    }
  },

  // Atualizar conexão existente
  async updateConnection(connectionId: string, updates: Partial<{
    name: string;
    status: string;
    qr_code: string;
    config_data: any;
  }>): Promise<DatabaseConnection | null> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Usuário não autenticado");
      }

      const { data, error } = await supabase
        .from("whatsapp_connections")
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq("id", connectionId)
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) {
        console.error("Erro ao atualizar conexão:", error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error("Erro ao atualizar conexão:", error);
      throw error;
    }
  },

  // Deletar conexão
  async deleteConnection(connectionId: string): Promise<boolean> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Usuário não autenticado");
      }

      const { error } = await supabase
        .from("whatsapp_connections")
        .delete()
        .eq("id", connectionId)
        .eq("user_id", user.id);

      if (error) {
        console.error("Erro ao deletar conexão:", error);
        throw error;
      }

      return true;
    } catch (error) {
      console.error("Erro ao deletar conexão:", error);
      throw error;
    }
  },

  // Buscar conexão por nome da instância
  async getConnectionByInstanceName(instanceName: string): Promise<DatabaseConnection | null> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Usuário não autenticado");
      }

      const { data, error } = await supabase
        .from("whatsapp_connections")
        .select("*")
        .eq("user_id", user.id)
        .eq("instance_name", instanceName)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error("Erro ao buscar conexão:", error);
        throw error;
      }

      return data || null;
    } catch (error) {
      console.error("Erro ao buscar conexão:", error);
      return null;
    }
  }
};
