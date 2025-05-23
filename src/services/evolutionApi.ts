import { supabase } from "@/integrations/supabase/client";

export interface EvolutionInstance {
  instanceName: string;
  instanceId: string;
  status: "open" | "close" | "connecting";
  qrcode?: {
    base64: string;
    code: string;
  };
  serverUrl: string;
  apiKey: string;
}

export interface EvolutionMessage {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  };
  message: {
    conversation?: string;
    extendedTextMessage?: {
      text: string;
    };
  };
  messageTimestamp: number;
  status: string;
  pushName: string;
}

export interface EvolutionContact {
  id: string;
  pushName: string;
  remoteJid: string;
  profilePictureUrl?: string;
}

export interface EvolutionApiConfig {
  id: string;
  name: string;
  api_url: string;
  global_key: string;
  is_active: boolean;
}

class EvolutionApiService {
  private baseUrl: string = "";
  private apiKey: string = "";

  setCredentials(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.apiKey = apiKey;
  }

  private getHeaders() {
    return {
      "Content-Type": "application/json",
      "apikey": this.apiKey,
    };
  }

  // Métodos para gerenciar configurações no banco de dados
  async saveConfig(name: string, api_url: string, global_key: string): Promise<EvolutionApiConfig | null> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      
      const { data, error } = await supabase
        .from("evolution_api_configs")
        .insert({
          name,
          api_url,
          global_key,
          user_id: user.id
        })
        .select()
        .single();
        
      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Erro ao salvar configuração:", error);
      return null;
    }
  }

  async getActiveConfig(): Promise<EvolutionApiConfig | null> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      
      const { data, error } = await supabase
        .from("evolution_api_configs")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
        
      if (error) {
        if (error.code === "PGRST116") { // Nenhum resultado encontrado
          return null;
        }
        throw error;
      }
      
      return data;
    } catch (error) {
      console.error("Erro ao obter configuração ativa:", error);
      return null;
    }
  }

  async updateConfig(id: string, updates: Partial<EvolutionApiConfig>): Promise<EvolutionApiConfig | null> {
    try {
      const { data, error } = await supabase
        .from("evolution_api_configs")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
        
      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Erro ao atualizar configuração:", error);
      return null;
    }
  }

  async deleteConfig(id: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from("evolution_api_configs")
        .delete()
        .eq("id", id);
        
      if (error) throw error;
      return true;
    } catch (error) {
      console.error("Erro ao excluir configuração:", error);
      return false;
    }
  }

  async setActiveConfig(id: string): Promise<boolean> {
    try {
      // Primeiro, desativa todas as configurações do usuário
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      
      await supabase
        .from("evolution_api_configs")
        .update({ is_active: false })
        .eq("user_id", user.id);
      
      // Depois, ativa apenas a configuração específica
      const { error } = await supabase
        .from("evolution_api_configs")
        .update({ is_active: true })
        .eq("id", id);
        
      if (error) throw error;
      return true;
    } catch (error) {
      console.error("Erro ao definir configuração ativa:", error);
      return false;
    }
  }

  async getAllConfigs(): Promise<EvolutionApiConfig[]> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      
      const { data, error } = await supabase
        .from("evolution_api_configs")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
        
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("Erro ao listar configurações:", error);
      return [];
    }
  }

  // Criar uma nova instância
  async createInstance(instanceName: string, webhookUrl?: string): Promise<EvolutionInstance> {
    console.log(`Creating instance: ${instanceName} with URL: ${this.baseUrl}/instance/create`);
    
    const requestBody = {
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      webhook: webhookUrl || "",
      webhook_by_events: !!webhookUrl,
      events: [
        "APPLICATION_STARTUP",
        "QRCODE_UPDATED", 
        "MESSAGES_UPSERT",
        "MESSAGES_UPDATE",
        "SEND_MESSAGE",
        "CONTACTS_UPDATE",
        "PRESENCE_UPDATE",
        "CHATS_UPDATE",
        "CONNECTION_UPDATE"
      ]
    };
    
    console.log("Request payload:", JSON.stringify(requestBody, null, 2));
    
    try {
      const response = await fetch(`${this.baseUrl}/instance/create`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(requestBody),
      });

      console.log("Create instance response status:", response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Error response:", errorText);
        
        // Verificar se o erro é porque a instância já existe
        if (errorText.includes("already exists") || errorText.includes("já existe")) {
          console.log("Instance already exists, this is OK");
          return {
            instanceName,
            instanceId: instanceName,
            status: "close",
            serverUrl: this.baseUrl,
            apiKey: this.apiKey,
          };
        }
        
        throw new Error(`Erro ao criar instância: ${errorText}`);
      }

      const data = await response.json();
      console.log("Create instance response:", data);
      
      return {
        instanceName,
        instanceId: data.instance?.instanceId || instanceName,
        status: "close",
        serverUrl: this.baseUrl,
        apiKey: this.apiKey,
        ...data
      };
    } catch (error) {
      console.error("Error creating instance:", error);
      throw error;
    }
  }

  // Conectar instância (gerar QR code)
  async connectInstance(instanceName: string): Promise<{ qrcode?: { base64: string; code: string }; status: string }> {
    console.log(`Connecting to instance: ${instanceName} at URL: ${this.baseUrl}/instance/connect/${instanceName}`);
    
    try {
      const response = await fetch(`${this.baseUrl}/instance/connect/${instanceName}`, {
        method: "GET",
        headers: this.getHeaders(),
      });

      console.log("Connect instance response status:", response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Connect instance error response:", errorText);
        throw new Error(`Erro ao conectar instância: ${errorText}`);
      }

      const data = await response.json();
      console.log("Connect instance response data:", data);
      return data;
    } catch (error) {
      console.error("Error connecting to instance:", error);
      throw error;
    }
  }

  // Obter status da instância
  async getInstanceStatus(instanceName: string): Promise<{ instance: { state: string; status: string } }> {
    console.log(`Getting status for instance: ${instanceName}`);
    
    const response = await fetch(`${this.baseUrl}/instance/connectionState/${instanceName}`, {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Get status error response:", errorText);
      throw new Error(`Erro ao obter status da instância: ${errorText}`);
    }

    const data = await response.json();
    console.log("Instance status response:", data);
    return data;
  }

  async getQRCode(instanceName: string): Promise<{ qrcode: { base64: string; code: string } }> {
    const response = await fetch(`${this.baseUrl}/instance/qrcode/${instanceName}`, {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro ao obter QR code: ${errorText}`);
    }

    return await response.json();
  }

  async listInstances(): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/instance/fetchInstances`, {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro ao listar instâncias: ${errorText}`);
    }

    const data = await response.json();
    return data.instances || [];
  }

  async getChats(instanceName: string): Promise<EvolutionContact[]> {
    const response = await fetch(`${this.baseUrl}/chat/findChats/${instanceName}`, {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro ao obter conversas: ${errorText}`);
    }

    return await response.json();
  }

  async getMessages(instanceName: string, remoteJid: string, limit: number = 50): Promise<EvolutionMessage[]> {
    const response = await fetch(`${this.baseUrl}/chat/findMessages/${instanceName}`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        where: {
          owner: remoteJid
        },
        limit
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro ao obter mensagens: ${errorText}`);
    }

    const data = await response.json();
    return data.messages || [];
  }

  async sendMessage(instanceName: string, remoteJid: string, message: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/message/sendText/${instanceName}`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        number: remoteJid,
        textMessage: {
          text: message
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro ao enviar mensagem: ${errorText}`);
    }

    return await response.json();
  }

  async deleteInstance(instanceName: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/instance/delete/${instanceName}`, {
      method: "DELETE",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro ao deletar instância: ${errorText}`);
    }
  }

  async logoutInstance(instanceName: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/instance/logout/${instanceName}`, {
      method: "DELETE",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro ao fazer logout da instância: ${errorText}`);
    }
  }
}

export const evolutionApi = new EvolutionApiService();
