import { getActiveConfig, getAllConfigs, saveConfig, updateConfig, deleteConfig, setActiveConfig } from "../config";

// Types for Evolution API
export interface EvolutionMessage {
  key: {
    id: string;
    fromMe: boolean;
    remoteJid: string;
  };
  message?: {
    conversation?: string;
    extendedTextMessage?: {
      text: string;
    };
  };
  messageTimestamp: number;
}

export interface EvolutionContact {
  id: string;
  remoteJid: string;
  pushName?: string;
  profilePictureUrl?: string;
  unreadMessages?: number;
}

class EvolutionAPI {
  private baseUrl: string = "";
  private globalKey: string = "";

  async loadConfig() {
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
  extractWhatsAppNumber(remoteJid: string): string {
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

  async getActiveConfig() {
    try {
      return await getActiveConfig();
    } catch (error) {
      console.error("Erro ao obter configuração ativa:", error);
      return null;
    }
  }

  // Alias methods for compatibility
  async createInstance(instanceName: string, instanceApiKey?: string) {
    return this.createEvolutionInstance(instanceName, undefined, instanceApiKey);
  }

  async getQRCode(instanceName: string, instanceApiKey?: string) {
    return this.getInstanceQrCode(instanceName, instanceApiKey);
  }

  async deleteInstance(instanceName: string, instanceApiKey?: string) {
    return this.deleteEvolutionInstance(instanceName);
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
      return data.qr || data.qrcode || data;
    } catch (error) {
      console.error("Erro ao obter QR Code:", error);
      throw error;
    }
  }

  async getAllInstances() {
    try {
      if (!this.globalKey) throw new Error("API key não configurada");

      const response = await fetch(`${this.baseUrl}/instance/all`, {
        method: 'GET',
        headers: {
          'apikey': this.globalKey
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Erro ao obter todas as instâncias:", {
          status: response.status,
          statusText: response.statusText,
          errorData
        });
        throw new Error(`Erro ao obter todas as instâncias: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      console.log("Instâncias recebidas:", data);
      return data;
    } catch (error) {
      console.error("Erro ao obter todas as instâncias:", error);
      throw error;
    }
  }

  async createEvolutionInstance(instanceName: string, webhookUrl?: string, instanceApiKey?: string) {
    try {
      const apiKey = instanceApiKey || this.globalKey;
      if (!apiKey) throw new Error("API key não configurada");

      console.log(`Criando instância ${instanceName} com webhook ${webhookUrl}`);

      const response = await fetch(`${this.baseUrl}/instance/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey
        },
        body: JSON.stringify({
          instanceName: instanceName,
          webhook: webhookUrl || ""
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
      console.log("Resposta ao criar instância:", data);
      return { success: true, data };
    } catch (error) {
      console.error("Erro ao criar instância:", error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async deleteEvolutionInstance(instanceName: string) {
    try {
      if (!this.globalKey) throw new Error("API key não configurada");

      console.log(`Deletando instância ${instanceName}`);

      const response = await fetch(`${this.baseUrl}/instance/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.globalKey
        },
        body: JSON.stringify({
          instanceName: instanceName
        })
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
      console.log("Resposta ao deletar instância:", data);
      return { success: true, data };
    } catch (error) {
      console.error("Erro ao deletar instância:", error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async getInstanceStatus(instanceName: string) {
    try {
      if (!this.globalKey) throw new Error("API key não configurada");

      const response = await fetch(`${this.baseUrl}/instance/status?instanceName=${instanceName}`, {
        method: 'GET',
        headers: {
          'apikey': this.globalKey
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
      console.log("Status da instância recebido:", data);
      return data;
    } catch (error) {
      console.error("Erro ao obter status da instância:", error);
      throw error;
    }
  }

  async checkEvolutionConnection(instanceName: string) {
    try {
      if (!this.globalKey) throw new Error("API key não configurada");

      const response = await fetch(`${this.baseUrl}/check-connection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.globalKey
        },
        body: JSON.stringify({
          instanceName: instanceName
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Erro ao verificar conexão:", {
          status: response.status,
          statusText: response.statusText,
          errorData
        });
        throw new Error(`Erro ao verificar conexão: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      console.log("Resposta ao verificar conexão:", data);
      return data;
    } catch (error) {
      console.error("Erro ao verificar conexão:", error);
      throw error;
    }
  }

  // Chat methods
  async findChats(instanceName: string, instanceApiKey?: string): Promise<EvolutionContact[]> {
    try {
      const apiKey = instanceApiKey || this.globalKey;
      if (!apiKey) throw new Error("API key não configurada");

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
      return result;
    } catch (error) {
      console.error("Erro ao buscar chats:", error);
      throw error;
    }
  }

  // Alias for compatibility
  async getChats(instanceName: string, instanceApiKey?: string): Promise<EvolutionContact[]> {
    return this.findChats(instanceName, instanceApiKey);
  }

  async findMessages(instanceName: string, data: { remoteJid: string; limit?: number }, instanceApiKey?: string): Promise<EvolutionMessage[]> {
    try {
      const apiKey = instanceApiKey || this.globalKey;
      if (!apiKey) throw new Error("API key não configurada");

      const response = await fetch(`${this.baseUrl}/message/find/${instanceName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey
        },
        body: JSON.stringify({
          remoteJid: data.remoteJid,
          limit: data.limit || 50
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
      return result;
    } catch (error) {
      console.error("Erro ao buscar mensagens:", error);
      throw error;
    }
  }

  // Alias for compatibility
  async getMessages(instanceName: string, remoteJid: string, instanceApiKey?: string): Promise<EvolutionMessage[]> {
    return this.findMessages(instanceName, { remoteJid }, instanceApiKey);
  }

  async sendMessage(instanceName: string, remoteJid: string, message: string, instanceApiKey?: string) {
    try {
      const apiKey = instanceApiKey || this.globalKey;
      if (!apiKey) throw new Error("API key não configurada");

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

  async sendTextMessage(instanceName: string, number: string, message: string) {
    try {
      if (!this.globalKey) throw new Error("API key não configurada");

      const response = await fetch(`${this.baseUrl}/message/sendText`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.globalKey
        },
        body: JSON.stringify({
          instanceName: instanceName,
          number: number,
          textMessage: {
            text: message
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Erro ao enviar mensagem de texto:", {
          status: response.status,
          statusText: response.statusText,
          errorData
        });
        throw new Error(`Erro ao enviar mensagem de texto: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      console.log("Resposta ao enviar mensagem de texto:", data);
      return data;
    } catch (error) {
      console.error("Erro ao enviar mensagem de texto:", error);
      throw error;
    }
  }

  async sendMediaURL(instanceName: string, number: string, url: string, caption?: string) {
    try {
      if (!this.globalKey) throw new Error("API key não configurada");

      const response = await fetch(`${this.baseUrl}/message/sendMediaURL`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.globalKey
        },
        body: JSON.stringify({
          instanceName: instanceName,
          number: number,
          mediaURL: url,
          caption: caption || ""
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Erro ao enviar mídia por URL:", {
          status: response.status,
          statusText: response.statusText,
          errorData
        });
        throw new Error(`Erro ao enviar mídia por URL: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      console.log("Resposta ao enviar mídia por URL:", data);
      return data;
    } catch (error) {
      console.error("Erro ao enviar mídia por URL:", error);
      throw error;
    }
  }

  async readMessages(instanceName: string, data: { remoteJid: string }, instanceApiKey?: string) {
    try {
      const apiKey = instanceApiKey || this.globalKey;
      if (!apiKey) throw new Error("API key não configurada");

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

  async markMessageAsUnread(instanceName: string, data: { remoteJid: string }, instanceApiKey?: string) {
    try {
      const apiKey = instanceApiKey || this.globalKey;
      if (!apiKey) throw new Error("API key não configurada");

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

  async updateMessage(instanceName: string, data: { remoteJid: string; messageId: string; newContent: string }, instanceApiKey?: string) {
    try {
      const apiKey = instanceApiKey || this.globalKey;
      if (!apiKey) throw new Error("API key não configurada");

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

  async archiveChat(instanceName: string, data: { remoteJid: string; archive: boolean }, instanceApiKey?: string) {
    try {
      const apiKey = instanceApiKey || this.globalKey;
      if (!apiKey) throw new Error("API key não configurada");

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

  async checkIsWhatsApp(instanceName: string, data: { number: string }, instanceApiKey?: string) {
    try {
      const apiKey = instanceApiKey || this.globalKey;
      if (!apiKey) throw new Error("API key não configurada");

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

  async findContacts(instanceName: string, instanceApiKey?: string) {
    try {
      const apiKey = instanceApiKey || this.globalKey;
      if (!apiKey) throw new Error("API key não configurada");

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

  async fetchProfilePictureUrl(instanceName: string, data: { remoteJid: string }, instanceApiKey?: string) {
    try {
      const apiKey = instanceApiKey || this.globalKey;
      if (!apiKey) throw new Error("API key não configurada");

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
}

export const evolutionApi = new EvolutionAPI();
export type EvolutionApiConfig = {
  id: string;
  name: string;
  api_url: string;
  global_key: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
