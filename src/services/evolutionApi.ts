import { getActiveConfig, getAllConfigs, saveConfig, updateConfig, deleteConfig, setActiveConfig } from "../config";

// Types for Evolution API
export interface EvolutionMessage {
  key: {
    id: string;
    remoteJid: string;
    fromMe: boolean;
    participant?: string;
  };
  message?: {
    conversation?: string;
    extendedTextMessage?: {
      text: string;
    };
    imageMessage?: {
      caption?: string;
      url?: string;
    };
    videoMessage?: {
      caption?: string;
      url?: string;
    };
    audioMessage?: {
      url?: string;
    };
    documentMessage?: {
      title?: string;
      fileName?: string;
      url?: string;
    };
  };
  messageTimestamp: number;
  status?: string;
}

export interface EvolutionContact {
  id: string;
  remoteJid: string;
  pushName?: string;
  profilePictureUrl?: string;
  unreadMessages?: number;
}

export interface EvolutionInstance {
  instanceName: string;
  status: string;
  serverUrl?: string;
  apikey?: string;
  qrcode?: {
    pairingCode?: string;
    code?: string;
    base64?: string;
  };
}

export interface EvolutionApiConfig {
  id: string;
  name: string;
  api_url: string;
  global_key: string;
  is_active: boolean;
}

export interface CreateInstanceResponse {
  instance: {
    instanceName: string;
    status: string;
  };
  hash: {
    apikey: string;
  };
  qrcode?: {
    pairingCode?: string;
    code?: string;
    base64?: string;
  };
  webhook?: string;
}

export interface ApiResponse<T = any> {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
}

class EvolutionAPI {
  private baseUrl: string = "";
  private globalKey: string = "";

  setCredentials(baseUrl: string, globalKey: string) {
    // Garantir que a URL termina com /
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    this.globalKey = globalKey;
    console.log("Credenciais Evolution API configuradas:", {
      baseUrl: this.baseUrl,
      hasKey: !!globalKey
    });
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
    if (!this.baseUrl || !this.globalKey) {
      throw new Error("Credenciais da Evolution API não configuradas");
    }

    // Remover barra inicial do endpoint se existir para evitar URL dupla
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
    const url = `${this.baseUrl}${cleanEndpoint}`;
    
    console.log("Fazendo requisição para:", url);

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.globalKey,
        ...options.headers,
      },
    });

    console.log("Status da resposta:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }
      
      console.error("Erro na requisição:", {
        status: response.status,
        statusText: response.statusText,
        errorData
      });
      
      throw new Error(`Erro ${response.status}: ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    console.log("Resposta recebida:", data);
    return data;
  }

  async createInstance(instanceName: string, webhook?: string): Promise<CreateInstanceResponse> {
    try {
      console.log("Criando instância:", { instanceName, webhook });
      
      const payload: any = {
        instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS"
      };

      if (webhook) {
        payload.webhook = webhook;
        payload.webhook_by_events = false;
        payload.webhook_base64 = false;
        payload.events = [
          "APPLICATION_STARTUP",
          "QRCODE_UPDATED", 
          "MESSAGES_UPSERT",
          "MESSAGES_UPDATE",
          "MESSAGES_DELETE",
          "SEND_MESSAGE",
          "CONTACTS_SET",
          "CONTACTS_UPSERT",
          "CONTACTS_UPDATE",
          "PRESENCE_UPDATE",
          "CHATS_SET",
          "CHATS_UPSERT",
          "CHATS_UPDATE",
          "CHATS_DELETE",
          "GROUPS_UPSERT",
          "GROUP_UPDATE",
          "GROUP_PARTICIPANTS_UPDATE",
          "CONNECTION_UPDATE",
          "CALL",
          "NEW_JWT_TOKEN"
        ];
      }

      const result = await this.makeRequest('instance/create', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      return result;
    } catch (error) {
      console.error("Erro ao criar instância:", error);
      throw error;
    }
  }

  async getInstanceQrCode(instanceName: string): Promise<string> {
    try {
      console.log("Obtendo QR Code da instância:", instanceName);
      
      const result = await this.makeRequest(`instance/qr/${instanceName}`, {
        method: 'GET',
      });

      // A Evolution API pode retornar o QR code de diferentes formas
      if (typeof result === 'string') {
        return result;
      }
      
      if (result?.qrcode?.base64) {
        return result.qrcode.base64;
      }
      
      if (result?.qrcode) {
        return result.qrcode;
      }
      
      if (result?.base64) {
        return result.base64;
      }

      throw new Error("QR Code não encontrado na resposta");
    } catch (error) {
      console.error("Erro ao obter QR Code:", error);
      throw new Error(`Erro ao obter QR Code: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  async getInstanceStatus(instanceName: string): Promise<any> {
    try {
      console.log("Verificando status da instância:", instanceName);
      
      const result = await this.makeRequest(`instance/connectionState/${instanceName}`, {
        method: 'GET',
      });

      return result;
    } catch (error) {
      console.error("Erro ao obter status:", error);
      throw error;
    }
  }

  async deleteInstance(instanceName: string): Promise<any> {
    try {
      console.log("Deletando instância:", instanceName);
      
      const result = await this.makeRequest(`instance/delete/${instanceName}`, {
        method: 'DELETE',
      });

      return result;
    } catch (error) {
      console.error("Erro ao deletar instância:", error);
      throw error;
    }
  }

  async findChats(instanceName: string): Promise<EvolutionContact[]> {
    try {
      console.log("Buscando conversas da instância:", instanceName);
      
      const result = await this.makeRequest(`chat/findChats/${instanceName}`, {
        method: 'GET',
      });

      // A Evolution API retorna um array de chats diretamente
      if (Array.isArray(result)) {
        return result;
      }

      // Se a resposta tem um campo data com os chats
      if (result?.data && Array.isArray(result.data)) {
        return result.data;
      }

      // Se não encontrou chats, retorna array vazio
      console.log("Nenhuma conversa encontrada");
      return [];
    } catch (error) {
      console.error("Erro ao buscar conversas:", error);
      throw error;
    }
  }

  async findMessages(instanceName: string, params: { remoteJid: string; limit?: number }, instanceApiKey?: string): Promise<EvolutionMessage[]> {
    try {
      console.log("Buscando mensagens:", { instanceName, params });
      
      const queryParams = new URLSearchParams({
        remoteJid: params.remoteJid,
        limit: (params.limit || 50).toString()
      });

      const headers: Record<string, string> = {};
      if (instanceApiKey) {
        headers['apikey'] = instanceApiKey;
      }

      const result = await this.makeRequest(`chat/findMessages/${instanceName}?${queryParams}`, {
        method: 'GET',
        headers,
      });

      if (Array.isArray(result)) {
        return result;
      }

      if (result?.data && Array.isArray(result.data)) {
        return result.data;
      }

      return [];
    } catch (error) {
      console.error("Erro ao buscar mensagens:", error);
      throw error;
    }
  }

  async sendMessage(instanceName: string, remoteJid: string, message: string, instanceApiKey?: string): Promise<any> {
    try {
      console.log("Enviando mensagem:", { instanceName, remoteJid, message: message.substring(0, 50) });
      
      const headers: Record<string, string> = {};
      if (instanceApiKey) {
        headers['apikey'] = instanceApiKey;
      }

      const result = await this.makeRequest(`message/sendText/${instanceName}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          number: remoteJid,
          text: message,
        }),
      });

      return result;
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error);
      throw error;
    }
  }

  async readMessages(instanceName: string, params: { remoteJid: string }, instanceApiKey?: string): Promise<any> {
    try {
      const headers: Record<string, string> = {};
      if (instanceApiKey) {
        headers['apikey'] = instanceApiKey;
      }

      const result = await this.makeRequest(`chat/readMessages/${instanceName}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(params),
      });

      return result;
    } catch (error) {
      console.error("Erro ao marcar mensagens como lidas:", error);
      throw error;
    }
  }

  async markMessageAsUnread(instanceName: string, params: { remoteJid: string }, instanceApiKey?: string): Promise<any> {
    try {
      const headers: Record<string, string> = {};
      if (instanceApiKey) {
        headers['apikey'] = instanceApiKey;
      }

      const result = await this.makeRequest(`chat/markMessageAsUnread/${instanceName}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(params),
      });

      return result;
    } catch (error) {
      console.error("Erro ao marcar mensagens como não lidas:", error);
      throw error;
    }
  }

  async updateMessage(instanceName: string, params: { remoteJid: string; messageId: string; newContent: string }, instanceApiKey?: string): Promise<any> {
    try {
      const headers: Record<string, string> = {};
      if (instanceApiKey) {
        headers['apikey'] = instanceApiKey;
      }

      const result = await this.makeRequest(`message/updateMessage/${instanceName}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(params),
      });

      return result;
    } catch (error) {
      console.error("Erro ao atualizar mensagem:", error);
      throw error;
    }
  }

  async archiveChat(instanceName: string, params: { remoteJid: string; archive: boolean }, instanceApiKey?: string): Promise<any> {
    try {
      const headers: Record<string, string> = {};
      if (instanceApiKey) {
        headers['apikey'] = instanceApiKey;
      }

      const result = await this.makeRequest(`chat/archiveChat/${instanceName}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(params),
      });

      return result;
    } catch (error) {
      console.error("Erro ao arquivar/desarquivar conversa:", error);
      throw error;
    }
  }

  async checkIsWhatsApp(instanceName: string, params: { number: string }, instanceApiKey?: string): Promise<any> {
    try {
      const headers: Record<string, string> = {};
      if (instanceApiKey) {
        headers['apikey'] = instanceApiKey;
      }

      const result = await this.makeRequest(`chat/whatsappNumbers/${instanceName}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(params),
      });

      return result;
    } catch (error) {
      console.error("Erro ao verificar se é WhatsApp:", error);
      throw error;
    }
  }

  async findContacts(instanceName: string, instanceApiKey?: string): Promise<any> {
    try {
      const headers: Record<string, string> = {};
      if (instanceApiKey) {
        headers['apikey'] = instanceApiKey;
      }

      const result = await this.makeRequest(`chat/findContacts/${instanceName}`, {
        method: 'GET',
        headers,
      });

      return result;
    } catch (error) {
      console.error("Erro ao buscar contatos:", error);
      throw error;
    }
  }

  async fetchProfilePictureUrl(instanceName: string, params: { remoteJid: string }, instanceApiKey?: string): Promise<any> {
    try {
      const headers: Record<string, string> = {};
      if (instanceApiKey) {
        headers['apikey'] = instanceApiKey;
      }

      const result = await this.makeRequest(`chat/fetchProfilePictureUrl/${instanceName}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(params),
      });

      return result;
    } catch (error) {
      console.error("Erro ao buscar foto de perfil:", error);
      throw error;
    }
  }

  // Configuration management methods
  async getAllConfigs() {
    try {
      return await getAllConfigs();
    } catch (error) {
      console.error("Erro ao obter todas as configurações:", error);
      throw error;
    }
  }

  async saveConfig(name: string, apiUrl: string, globalKey: string) {
    try {
      return await saveConfig(name, apiUrl, globalKey);
    } catch (error) {
      console.error("Erro ao salvar configuração:", error);
      throw error;
    }
  }

  async updateConfig(id: string, updates: Partial<EvolutionApiConfig>) {
    try {
      return await updateConfig(id, updates);
    } catch (error) {
      console.error("Erro ao atualizar configuração:", error);
      throw error;
    }
  }

  async deleteConfig(id: string) {
    try {
      return await deleteConfig(id);
    } catch (error) {
      console.error("Erro ao deletar configuração:", error);
      throw error;
    }
  }

  async setActiveConfig(id: string) {
    try {
      return await setActiveConfig(id);
    } catch (error) {
      console.error("Erro ao definir configuração ativa:", error);
      throw error;
    }
  }

  async getActiveConfig() {
    try {
      return await getActiveConfig();
    } catch (error) {
      console.error("Erro ao obter configuração ativa:", error);
      throw error;
    }
  }
}

export const evolutionApi = new EvolutionAPI();
