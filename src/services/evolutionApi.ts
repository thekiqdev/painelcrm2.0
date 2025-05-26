import { getActiveConfig, getAllConfigs, saveConfig, updateConfig, deleteConfig, setActiveConfig, type EvolutionApiConfig } from "../config";

export interface EvolutionConfig {
  id: string;
  api_url: string;
  global_key: string;
  instance_name: string;
}

export interface EvolutionContact {
  id: string;
  remoteJid: string;
  pushName?: string;
  profilePictureUrl?: string;
  profilePicUrl?: string;
  unreadMessages?: number;
  unreadCount?: number;
}

export interface EvolutionMessage {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
    participant?: string;
  };
  message: {
    conversation?: string;
    extendedTextMessage?: {
      text: string;
    };
  };
  messageTimestamp: number;
}

class EvolutionAPI {
  private baseUrl: string = "";
  private globalKey: string = "";

  constructor() {
    this.loadConfig();
  }

  private async loadConfig() {
    try {
      const config = await getActiveConfig();
      if (config) {
        this.setCredentials(config.api_url, config.global_key);
      } else {
        console.warn("Nenhuma configuração ativa encontrada.");
      }
    } catch (error) {
      console.error("Erro ao carregar a configuração:", error);
    }
  }

  // Função utilitária para extrair o número do WhatsApp do remoteJid
  private extractWhatsAppNumber(remoteJid: string): string {
    console.log("Extraindo número do remoteJid:", remoteJid);
    
    // Se já é um número limpo, retorna como está
    if (/^\d+$/.test(remoteJid)) {
      return remoteJid;
    }
    
    // Para contatos individuais: 5511999999999@s.whatsapp.net
    if (remoteJid.includes('@s.whatsapp.net')) {
      const number = remoteJid.split('@')[0];
      console.log("Número extraído de contato individual:", number);
      return number;
    }
    
    // Para grupos: mantém o remoteJid original pois grupos usam IDs diferentes
    if (remoteJid.includes('@g.us')) {
      console.log("É um grupo, mantendo remoteJid original:", remoteJid);
      return remoteJid;
    }
    
    // Fallback: retorna como está
    console.log("Formato não reconhecido, mantendo original:", remoteJid);
    return remoteJid;
  }

  setCredentials(baseUrl: string, globalKey: string) {
    this.baseUrl = baseUrl;
    this.globalKey = globalKey;
    console.log("Credenciais Evolution API configuradas:", { baseUrl, hasKey: !!globalKey });
  }

  // Métodos de configuração
  async getActiveConfig(): Promise<EvolutionApiConfig | null> {
    try {
      return await getActiveConfig();
    } catch (error) {
      console.error("Erro ao obter configuração ativa:", error);
      return null;
    }
  }

  async getAllConfigs(): Promise<EvolutionApiConfig[]> {
    try {
      return await getAllConfigs();
    } catch (error) {
      console.error("Erro ao obter todas as configurações:", error);
      return [];
    }
  }

  async saveConfig(name: string, apiUrl: string, globalKey: string): Promise<EvolutionApiConfig | null> {
    try {
      return await saveConfig(name, apiUrl, globalKey);
    } catch (error) {
      console.error("Erro ao salvar configuração:", error);
      throw error;
    }
  }

  async updateConfig(id: string, updates: Partial<EvolutionApiConfig>): Promise<EvolutionApiConfig | null> {
    try {
      return await updateConfig(id, updates);
    } catch (error) {
      console.error("Erro ao atualizar configuração:", error);
      throw error;
    }
  }

  async deleteConfig(id: string): Promise<boolean> {
    try {
      return await deleteConfig(id);
    } catch (error) {
      console.error("Erro ao deletar configuração:", error);
      throw error;
    }
  }

  async setActiveConfig(id: string): Promise<boolean> {
    try {
      const result = await setActiveConfig(id);
      if (result) {
        // Recarregar configuração após definir como ativa
        await this.loadConfig();
      }
      return result;
    } catch (error) {
      console.error("Erro ao definir configuração ativa:", error);
      throw error;
    }
  }

  async createInstance(instanceName: string, instanceApiKey?: string): Promise<any> {
    try {
      const apiKey = instanceApiKey || this.globalKey;
      if (!apiKey) throw new Error("API key não configurada");

      console.log("Criando instância:", { instanceName });

      const response = await fetch(`${this.baseUrl}/instance/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey
        },
        body: JSON.stringify({
          instanceName: instanceName
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Erro ao criar instância:", {
          status: response.status,
          statusText: response.statusText,
          errorData
        });
        throw new Error(`Erro ao criar instância: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      console.log("Instância criada com sucesso:", data);
      return data;
    } catch (error) {
      console.error("Erro ao criar instância:", error);
      throw error;
    }
  }

  async getInstanceQrCode(instanceName: string, instanceApiKey?: string): Promise<string> {
    try {
      const apiKey = instanceApiKey || this.globalKey;
      if (!apiKey) throw new Error("API key não configurada");

      console.log("Obtendo QR Code da instância:", instanceName);

      const response = await fetch(`${this.baseUrl}/instance/qr/${instanceName}`, {
        method: 'GET',
        headers: {
          'apikey': apiKey
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Erro ao obter QR Code:", {
          status: response.status,
          statusText: response.statusText,
          errorData
        });
        throw new Error(`Erro ao obter QR Code: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      console.log("QR Code recebido:", data);
      return data.qr;
    } catch (error) {
      console.error("Erro ao obter QR Code:", error);
      throw error;
    }
  }

  // Adicionar os métodos faltantes para chat
  async getChats(instanceName: string, instanceApiKey?: string): Promise<EvolutionContact[]> {
    return this.findChats(instanceName, instanceApiKey);
  }

  async getMessages(instanceName: string, remoteJid: string, limit: number = 50, instanceApiKey?: string): Promise<EvolutionMessage[]> {
    return this.findMessages(instanceName, { remoteJid, limit }, instanceApiKey);
  }

  async getQRCode(instanceName: string, instanceApiKey?: string): Promise<string> {
    return this.getInstanceQrCode(instanceName, instanceApiKey);
  }

  async deleteInstance(instanceName: string, instanceApiKey?: string): Promise<any> {
    try {
      const apiKey = instanceApiKey || this.globalKey;
      if (!apiKey) throw new Error("API key não configurada");

      console.log("Deletando instância:", { instanceName });

      const response = await fetch(`${this.baseUrl}/instance/delete/${instanceName}`, {
        method: 'DELETE',
        headers: {
          'apikey': apiKey
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Erro ao deletar instância:", {
          status: response.status,
          statusText: response.statusText,
          errorData
        });
        throw new Error(`Erro ao deletar instância: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      console.log("Instância deletada com sucesso:", data);
      return data;
    } catch (error) {
      console.error("Erro ao deletar instância:", error);
      throw error;
    }
  }

  async getInstanceStatus(instanceName: string, instanceApiKey?: string): Promise<any> {
    try {
      const apiKey = instanceApiKey || this.globalKey;
      if (!apiKey) throw new Error("API key não configurada");

      console.log("Obtendo status da instância:", instanceName);

      const response = await fetch(`${this.baseUrl}/instance/status/${instanceName}`, {
        method: 'GET',
        headers: {
          'apikey': apiKey
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Erro ao obter status da instância:", {
          status: response.status,
          statusText: response.statusText,
          errorData
        });
        throw new Error(`Erro ao obter status da instância: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      console.log("Status da instância:", data);
      return data;
    } catch (error) {
      console.error("Erro ao obter status da instância:", error);
      throw error;
    }
  }

  async logoutInstance(instanceName: string, instanceApiKey?: string): Promise<any> {
    try {
      const apiKey = instanceApiKey || this.globalKey;
      if (!apiKey) throw new Error("API key não configurada");

      console.log("Deslogando instância:", instanceName);

      const response = await fetch(`${this.baseUrl}/instance/logout/${instanceName}`, {
        method: 'POST',
        headers: {
          'apikey': apiKey
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Erro ao deslogar instância:", {
          status: response.status,
          statusText: response.statusText,
          errorData
        });
        throw new Error(`Erro ao deslogar instância: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      console.log("Instância deslogada com sucesso:", data);
      return data;
    } catch (error) {
      console.error("Erro ao deslogar instância:", error);
      throw error;
    }
  }

  async sendMessage(instanceName: string, remoteJid: string, message: string, instanceApiKey?: string): Promise<any> {
    try {
      const apiKey = instanceApiKey || this.globalKey;
      if (!apiKey) throw new Error("API key não configurada");

      console.log("Enviando mensagem:", { instanceName, remoteJid, message: message.substring(0, 50) + "..." });
      
      // Extrair o número correto para envio
      const number = this.extractWhatsAppNumber(remoteJid);
      
      const response = await fetch(`${this.baseUrl}/message/sendText/${instanceName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey
        },
        body: JSON.stringify({
          number: number,
          text: message
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Erro ao enviar mensagem:", {
          status: response.status,
          statusText: response.statusText,
          errorData
        });
        throw new Error(`Erro ao enviar mensagem: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      console.log("Mensagem enviada com sucesso:", data);
      return data;
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error);
      throw error;
    }
  }

  async findChats(instanceName: string, instanceApiKey?: string): Promise<EvolutionContact[]> {
    try {
      const apiKey = instanceApiKey || this.globalKey;
      if (!apiKey) throw new Error("API key não configurada");

      console.log("Buscando chats:", { instanceName });

      const response = await fetch(`${this.baseUrl}/chat/find/${instanceName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Erro ao buscar chats:", {
          status: response.status,
          statusText: response.statusText,
          errorData
        });
        throw new Error(`Erro ao buscar chats: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const result = await response.json();
      console.log("Chats encontrados:", result);
      return result as EvolutionContact[];
    } catch (error) {
      console.error("Erro ao buscar chats:", error);
      throw error;
    }
  }

  async findMessages(instanceName: string, data: { remoteJid: string; limit: number }, instanceApiKey?: string): Promise<EvolutionMessage[]> {
    try {
      const apiKey = instanceApiKey || this.globalKey;
      if (!apiKey) throw new Error("API key não configurada");

      console.log("Buscando mensagens:", { instanceName, remoteJid: data.remoteJid, limit: data.limit });

      const response = await fetch(`${this.baseUrl}/message/find/${instanceName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey
        },
        body: JSON.stringify({
          remoteJid: data.remoteJid,
          limit: data.limit
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Erro ao buscar mensagens:", {
          status: response.status,
          statusText: response.statusText,
          errorData
        });
        throw new Error(`Erro ao buscar mensagens: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const result = await response.json();
      console.log("Mensagens encontradas:", result);
      return result as EvolutionMessage[];
    } catch (error) {
      console.error("Erro ao buscar mensagens:", error);
      throw error;
    }
  }

  async readMessages(instanceName: string, data: { remoteJid: string }, instanceApiKey?: string): Promise<any> {
    try {
      const apiKey = instanceApiKey || this.globalKey;
      if (!apiKey) throw new Error("API key não configurada");

      console.log("Marcando mensagens como lidas:", { instanceName, remoteJid: data.remoteJid });

      const response = await fetch(`${this.baseUrl}/chat/readMessages/${instanceName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey
        },
        body: JSON.stringify({
          remoteJid: data.remoteJid
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Erro ao marcar mensagens como lidas:", {
          status: response.status,
          statusText: response.statusText,
          errorData
        });
        throw new Error(`Erro ao marcar como lidas: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const result = await response.json();
      console.log("Mensagens marcadas como lidas:", result);
      return result;
    } catch (error) {
      console.error("Erro ao marcar mensagens como lidas:", error);
      throw error;
    }
  }

  async markMessageAsUnread(instanceName: string, data: { remoteJid: string }, instanceApiKey?: string): Promise<any> {
    try {
      const apiKey = instanceApiKey || this.globalKey;
      if (!apiKey) throw new Error("API key não configurada");

      console.log("Marcando mensagens como não lidas:", { instanceName, remoteJid: data.remoteJid });

      const response = await fetch(`${this.baseUrl}/chat/markMessageAsUnread/${instanceName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey
        },
        body: JSON.stringify({
          remoteJid: data.remoteJid
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Erro ao marcar mensagens como não lidas:", {
          status: response.status,
          statusText: response.statusText,
          errorData
        });
        throw new Error(`Erro ao marcar como não lidas: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const result = await response.json();
      console.log("Mensagens marcadas como não lidas:", result);
      return result;
    } catch (error) {
      console.error("Erro ao marcar mensagens como não lidas:", error);
      throw error;
    }
  }

  async updateMessage(instanceName: string, data: { remoteJid: string; messageId: string; newContent: string }, instanceApiKey?: string): Promise<any> {
    try {
      const apiKey = instanceApiKey || this.globalKey;
      if (!apiKey) throw new Error("API key não configurada");

      console.log("Atualizando mensagem:", { instanceName, remoteJid: data.remoteJid, messageId: data.messageId });

      const response = await fetch(`${this.baseUrl}/chat/updateMessage/${instanceName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey
        },
        body: JSON.stringify({
          remoteJid: data.remoteJid,
          messageId: data.messageId,
          newContent: data.newContent
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Erro ao atualizar mensagem:", {
          status: response.status,
          statusText: response.statusText,
          errorData
        });
        throw new Error(`Erro ao atualizar mensagem: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const result = await response.json();
      console.log("Mensagem atualizada:", result);
      return result;
    } catch (error) {
      console.error("Erro ao atualizar mensagem:", error);
      throw error;
    }
  }

  async archiveChat(instanceName: string, data: { remoteJid: string; archive: boolean }, instanceApiKey?: string): Promise<any> {
    try {
      const apiKey = instanceApiKey || this.globalKey;
      if (!apiKey) throw new Error("API key não configurada");

      console.log("Arquivando conversa:", { instanceName, remoteJid: data.remoteJid, archive: data.archive });

      const response = await fetch(`${this.baseUrl}/chat/archiveChat/${instanceName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey
        },
        body: JSON.stringify({
          remoteJid: data.remoteJid,
          archive: data.archive
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Erro ao arquivar conversa:", {
          status: response.status,
          statusText: response.statusText,
          errorData
        });
        throw new Error(`Erro ao arquivar conversa: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const result = await response.json();
      console.log("Conversa arquivada:", result);
      return result;
    } catch (error) {
      console.error("Erro ao arquivar conversa:", error);
      throw error;
    }
  }

  async checkIsWhatsApp(instanceName: string, data: { number: string }, instanceApiKey?: string): Promise<any> {
    try {
      const apiKey = instanceApiKey || this.globalKey;
      if (!apiKey) throw new Error("API key não configurada");

      console.log("Verificando se é WhatsApp:", { instanceName, number: data.number });

      const response = await fetch(`${this.baseUrl}/chat/checkIsWhatsApp/${instanceName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey
        },
        body: JSON.stringify({
          number: data.number
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Erro ao verificar WhatsApp:", {
          status: response.status,
          statusText: response.statusText,
          errorData
        });
        throw new Error(`Erro ao verificar WhatsApp: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const result = await response.json();
      console.log("Verificação WhatsApp:", result);
      return result;
    } catch (error) {
      console.error("Erro ao verificar WhatsApp:", error);
      throw error;
    }
  }

  async findContacts(instanceName: string, instanceApiKey?: string): Promise<any> {
    try {
      const apiKey = instanceApiKey || this.globalKey;
      if (!apiKey) throw new Error("API key não configurada");

      console.log("Buscando contatos:", { instanceName });

      const response = await fetch(`${this.baseUrl}/chat/findContacts/${instanceName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Erro ao buscar contatos:", {
          status: response.status,
          statusText: response.statusText,
          errorData
        });
        throw new Error(`Erro ao buscar contatos: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const result = await response.json();
      console.log("Contatos encontrados:", result);
      return result;
    } catch (error) {
      console.error("Erro ao buscar contatos:", error);
      throw error;
    }
  }

  async fetchProfilePictureUrl(instanceName: string, data: { remoteJid: string }, instanceApiKey?: string): Promise<any> {
    try {
      const apiKey = instanceApiKey || this.globalKey;
      if (!apiKey) throw new Error("API key não configurada");

      console.log("Buscando foto de perfil:", { instanceName, remoteJid: data.remoteJid });

      const response = await fetch(`${this.baseUrl}/chat/fetchProfilePictureUrl/${instanceName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey
        },
        body: JSON.stringify({
          remoteJid: data.remoteJid
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Erro ao buscar foto de perfil:", {
          status: response.status,
          statusText: response.statusText,
          errorData
        });
        throw new Error(`Erro ao buscar foto de perfil: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const result = await response.json();
      console.log("Foto de perfil encontrada:", result);
      return result;
    } catch (error) {
      console.error("Erro ao buscar foto de perfil:", error);
      throw error;
    }
  }
}

export const evolutionApi = new EvolutionAPI();

// Export do tipo para compatibilidade
export type { EvolutionApiConfig };
