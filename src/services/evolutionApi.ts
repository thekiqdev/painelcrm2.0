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

  // Função para formatar o número de telefone
  private formatPhoneNumber(phoneNumber: string): string {
    // Remove todos os caracteres não numéricos
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    // Se não começar com código do país, adiciona 55 (Brasil)
    if (!cleanNumber.startsWith('55') && cleanNumber.length <= 11) {
      return `55${cleanNumber}`;
    }
    
    return cleanNumber;
  }

  // Criar uma nova instância com os parâmetros corretos da documentação
  async createInstance(instanceName: string, phoneNumber: string, webhookUrl?: string): Promise<EvolutionInstance> {
    const formattedNumber = this.formatPhoneNumber(phoneNumber);
    
    console.log("Criando instância com dados:", {
      instanceName,
      formattedNumber,
      webhookUrl
    });
    
    const response = await fetch(`${this.baseUrl}/instance/create`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        instanceName,
        token: this.apiKey,
        qrcode: true,
        number: formattedNumber,
        integration: "WHATSAPP-BAILEYS",
        webhook: webhookUrl || "",
        webhook_by_events: true,
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
        ],
        reject_call: false,
        msg_call: "",
        groups_ignore: false,
        always_online: false,
        read_messages: false,
        read_status: false,
        websocket_enabled: false,
        websocket_events: [],
        rabbitmq_enabled: false,
        rabbitmq_events: [],
        sqs_enabled: false,
        sqs_events: []
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Erro detalhado ao criar instância:", errorText);
      throw new Error(`Erro ao criar instância: ${errorText}`);
    }

    const data = await response.json();
    console.log("Resposta da criação de instância:", data);
    
    return {
      instanceName,
      instanceId: data.instance?.instanceId || instanceName,
      status: "close",
      serverUrl: this.baseUrl,
      apiKey: this.apiKey,
      ...data
    };
  }

  // Conectar instância (gerar QR code)
  async connectInstance(instanceName: string): Promise<{ qrcode?: { base64: string; code: string }; status: string }> {
    console.log("Tentando conectar instância:", instanceName);
    
    const response = await fetch(`${this.baseUrl}/instance/connect/${instanceName}`, {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Erro ao conectar instância:", errorText);
      throw new Error(`Erro ao conectar instância: ${errorText}`);
    }

    const data = await response.json();
    console.log("Resposta da conexão de instância:", data);
    
    // Se não retornou QR code, tentar obter diretamente
    if (!data.qrcode?.base64) {
      console.log("QR code não encontrado na resposta, tentando endpoint específico...");
      try {
        const qrResponse = await this.getQRCode(instanceName);
        if (qrResponse.qrcode?.base64) {
          return {
            qrcode: qrResponse.qrcode,
            status: "connecting"
          };
        }
      } catch (qrError) {
        console.error("Erro ao obter QR code específico:", qrError);
      }
    }
    
    return data;
  }

  // Obter status da instância
  async getInstanceStatus(instanceName: string): Promise<{ instance: { state: string; status: string } }> {
    const response = await fetch(`${this.baseUrl}/instance/connectionState/${instanceName}`, {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro ao obter status da instância: ${errorText}`);
    }

    return await response.json();
  }

  // Obter QR code da instância
  async getQRCode(instanceName: string): Promise<{ qrcode: { base64: string; code: string } }> {
    console.log("Obtendo QR code para instância:", instanceName);
    
    const response = await fetch(`${this.baseUrl}/instance/qrcode/${instanceName}`, {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Erro ao obter QR code:", errorText);
      throw new Error(`Erro ao obter QR code: ${errorText}`);
    }

    const data = await response.json();
    console.log("Resposta do QR code:", data);
    return data;
  }

  // Listar todas as instâncias
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

  // Listar conversas
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

  // Obter mensagens de uma conversa
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

  // Enviar mensagem
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

  // Deletar instância
  async deleteInstance(instanceName: string): Promise<void> {
    console.log(`Deletando instância: ${instanceName}`);
    
    const response = await fetch(`${this.baseUrl}/instance/delete/${instanceName}`, {
      method: "DELETE",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Erro ao deletar instância:", errorText);
      throw new Error(`Erro ao deletar instância: ${errorText}`);
    }

    console.log(`Instância ${instanceName} deletada com sucesso`);
  }

  // Logout da instância
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
