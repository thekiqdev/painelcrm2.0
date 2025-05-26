import { getActiveConfig } from "../config";

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
    return this.createInstance(instanceName, instanceApiKey);
  }

  async getQRCode(instanceName: string, instanceApiKey?: string) {
    return this.getInstanceQrCode(instanceName, instanceApiKey);
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
