
import { supabase } from "@/integrations/supabase/client";
import { Config, EvolutionApiConfig, EvolutionContact, EvolutionMessage, InstanceStatus } from "@/types";

class EvolutionApiService {
  private baseUrl: string = "";
  private apiKey: string = "";
  private activeConfig: Config | null = null;

  setCredentials(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  async setActiveConfig(config: Config) {
    this.activeConfig = config;
    this.setCredentials(config.api_url, config.global_key);
  }

  async getActiveConfig(): Promise<EvolutionApiConfig | null> {
    try {
      const { data: activeConfig, error } = await supabase
        .from('evolution_api_configs')
        .select('*')
        .eq('is_active', true)
        .single();

      if (error) {
        console.error("Erro ao buscar configuração ativa:", error);
        return null;
      }

      if (activeConfig) {
        this.activeConfig = activeConfig;
        this.setCredentials(activeConfig.api_url, activeConfig.global_key);
      }

      return activeConfig;
    } catch (error) {
      console.error("Erro ao obter configuração ativa:", error);
      return null;
    }
  }

  // Métodos de configuração usando Supabase
  async getAllConfigs(): Promise<EvolutionApiConfig[]> {
    try {
      const { data: configs, error } = await supabase
        .from('evolution_api_configs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Erro ao buscar configurações:", error);
        return [];
      }

      return configs || [];
    } catch (error) {
      console.error("Erro ao obter configurações:", error);
      return [];
    }
  }

  async saveConfig(name: string, apiUrl: string, globalKey: string): Promise<EvolutionApiConfig> {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Usuário não autenticado");

      // Verificar se já existe uma configuração ativa
      const { data: existingConfigs } = await supabase
        .from('evolution_api_configs')
        .select('id')
        .eq('user_id', user.user.id);

      const isFirstConfig = !existingConfigs || existingConfigs.length === 0;

      const { data: newConfig, error } = await supabase
        .from('evolution_api_configs')
        .insert({
          name,
          api_url: apiUrl,
          global_key: globalKey,
          user_id: user.user.id,
          is_active: isFirstConfig // Primeira configuração é ativa por padrão
        })
        .select()
        .single();

      if (error) {
        console.error("Erro ao salvar configuração:", error);
        throw error;
      }

      return newConfig;
    } catch (error) {
      console.error("Erro ao salvar configuração:", error);
      throw error;
    }
  }

  async updateConfig(id: string, data: Partial<EvolutionApiConfig>): Promise<EvolutionApiConfig> {
    try {
      const { data: updatedConfig, error } = await supabase
        .from('evolution_api_configs')
        .update({
          ...data,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error("Erro ao atualizar configuração:", error);
        throw error;
      }

      return updatedConfig;
    } catch (error) {
      console.error("Erro ao atualizar configuração:", error);
      throw error;
    }
  }

  async deleteConfig(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('evolution_api_configs')
        .delete()
        .eq('id', id);

      if (error) {
        console.error("Erro ao excluir configuração:", error);
        throw error;
      }
    } catch (error) {
      console.error("Erro ao excluir configuração:", error);
      throw error;
    }
  }

  async setActiveConfigById(id: string): Promise<void> {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Usuário não autenticado");

      // Desativar todas as configurações do usuário
      await supabase
        .from('evolution_api_configs')
        .update({ is_active: false })
        .eq('user_id', user.user.id);

      // Ativar a configuração específica
      const { data: activeConfig, error } = await supabase
        .from('evolution_api_configs')
        .update({ is_active: true })
        .eq('id', id)
        .eq('user_id', user.user.id)
        .select()
        .single();

      if (error) {
        console.error("Erro ao ativar configuração:", error);
        throw error;
      }

      if (activeConfig) {
        this.activeConfig = activeConfig;
        this.setCredentials(activeConfig.api_url, activeConfig.global_key);
      }
    } catch (error) {
      console.error("Erro ao definir configuração ativa:", error);
      throw error;
    }
  }

  // Métodos de instância
  async createInstance(instanceName: string, number: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/instance/create`, {
        method: 'POST',
        headers: {
          'apikey': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ instanceName, number }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Erro ao criar instância:", errorText);
        throw new Error(`Erro HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log("Instância criada:", data);
      return data;
    } catch (error) {
      console.error("Erro ao criar instância:", error);
      throw error;
    }
  }

  async getInstanceStatus(instanceName: string): Promise<InstanceStatus> {
    try {
      const response = await fetch(`${this.baseUrl}/instance/status/${instanceName}`, {
        method: 'GET',
        headers: {
          'apikey': this.apiKey,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Erro ao obter status da instância:", errorText);
        throw new Error(`Erro HTTP ${response.status}: ${errorText}`);
      }

      const data: InstanceStatus = await response.json();
      console.log("Status da instância:", data);
      return data;
    } catch (error) {
      console.error("Erro ao obter status da instância:", error);
      throw error;
    }
  }

  async deleteInstance(instanceName: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/instance/delete/${instanceName}`, {
        method: 'DELETE',
        headers: {
          'apikey': this.apiKey,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Erro ao deletar instância:", errorText);
        throw new Error(`Erro HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log("Instância deletada:", data);
      return data;
    } catch (error) {
      console.error("Erro ao deletar instância:", error);
      throw error;
    }
  }

  async getQRCode(instanceName: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/instance/qr/${instanceName}`, {
        method: 'GET',
        headers: {
          'apikey': this.apiKey,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Erro ao obter QR code:", errorText);
        throw new Error(`Erro HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log("QR code obtido:", data);
      return data;
    } catch (error) {
      console.error("Erro ao obter QR code:", error);
      throw error;
    }
  }

  async getInstanceProfile(instanceName: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/instance/profile/${instanceName}`, {
        method: 'GET',
        headers: {
          'apikey': this.apiKey,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Erro ao obter perfil da instância:", errorText);
        throw new Error(`Erro HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log("Perfil da instância:", data);
      return data;
    } catch (error) {
      console.error("Erro ao obter perfil da instância:", error);
      throw error;
    }
  }

  async sendTextMessage(instanceName: string, number: string, text: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/message/sendText/${instanceName}`, {
        method: 'POST',
        headers: {
          'apikey': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ number, text }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Erro ao enviar mensagem de texto:", errorText);
        throw new Error(`Erro HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log("Mensagem de texto enviada:", data);
      return data;
    } catch (error) {
      console.error("Erro ao enviar mensagem de texto:", error);
      throw error;
    }
  }

  async sendMediaURL(instanceName: string, number: string, url: string, filename: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/message/sendMediaURL/${instanceName}`, {
        method: 'POST',
        headers: {
          'apikey': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ number, url, filename }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Erro ao enviar mídia por URL:", errorText);
        throw new Error(`Erro HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log("Mídia enviada por URL:", data);
      return data;
    } catch (error) {
      console.error("Erro ao enviar mídia por URL:", error);
      throw error;
    }
  }

  async connectInstance(instanceName: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/instance/connect/${instanceName}`, {
        method: 'GET',
        headers: {
          'apikey': this.apiKey,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Erro ao conectar instância:", errorText);
        throw new Error(`Erro HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log("Instância conectada:", data);
      return data;
    } catch (error) {
      console.error("Erro ao conectar instância:", error);
      throw error;
    }
  }

  // Métodos de chat
  async findChats(instanceName: string): Promise<EvolutionContact[]> {
    try {
      const response = await fetch(`${this.baseUrl}/chat/findChats/${instanceName}`, {
        method: 'GET',
        headers: {
          'apikey': this.apiKey,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Erro ao buscar conversas:", errorText);
        throw new Error(`Erro HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log("Conversas encontradas:", data);
      return data;
    } catch (error) {
      console.error("Erro ao buscar conversas:", error);
      throw error;
    }
  }

  async findMessages(instanceName: string, remoteJid: string): Promise<EvolutionMessage[]> {
    try {
      const response = await fetch(`${this.baseUrl}/chat/findMessages/${instanceName}`, {
        method: 'POST',
        headers: {
          'apikey': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ remoteJid }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Erro ao buscar mensagens:", errorText);
        throw new Error(`Erro HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log("Mensagens encontradas:", data);
      return data;
    } catch (error) {
      console.error("Erro ao buscar mensagens:", error);
      throw error;
    }
  }

  async sendMessage(instanceName: string, remoteJid: string, message: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/message/sendText/${instanceName}`, {
        method: 'POST',
        headers: {
          'apikey': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          number: remoteJid,
          text: message 
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Erro ao enviar mensagem:", errorText);
        throw new Error(`Erro HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log("Mensagem enviada:", data);
      return data;
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error);
      throw error;
    }
  }
}

export const evolutionApi = new EvolutionApiService();
export type { EvolutionApiConfig, EvolutionContact, EvolutionMessage, InstanceStatus };
