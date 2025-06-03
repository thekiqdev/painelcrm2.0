const EVOLUTION_API_BASE_URL = 'https://evo.painelcrm.com';
const EVOLUTION_API_KEY = '429683C4C977415CAAFCCE10F7D57E11';

export interface EvolutionApiConfig {
  id: string;
  name: string;
  api_url: string;
  global_key: string;
  is_active: boolean;
  user_id: string;
  created_at: string;
  updated_at: string;
}

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

export class EvolutionAPI {
  private baseUrl: string = EVOLUTION_API_BASE_URL;
  private globalKey: string = EVOLUTION_API_KEY;

  constructor() {
    // Configurar automaticamente as credenciais pré-definidas
    this.setCredentials(EVOLUTION_API_BASE_URL, EVOLUTION_API_KEY);
  }

  setCredentials(baseUrl: string, globalKey: string) {
    // Remover barra final se existir
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    this.globalKey = globalKey;
    console.log("Credenciais Evolution definidas:", { baseUrl: this.baseUrl });
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}) {
    if (!this.baseUrl || !this.globalKey) {
      throw new Error('Credenciais da Evolution API não configuradas');
    }

    const url = `${this.baseUrl}${endpoint}`;
    console.log("Fazendo requisição para:", url);

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.globalKey,
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Erro na API Evolution:", { status: response.status, data });
      throw new Error(`Erro na API: ${response.status} - ${JSON.stringify(data)}`);
    }

    return data;
  }

  // Criar instância
  async createInstance(instanceName: string, phoneNumber?: string) {
    console.log("Criando instância:", { instanceName, phoneNumber });
    
    const payload: any = {
      instanceName,
      integration: "WHATSAPP-BAILEYS"
    };

    if (phoneNumber) {
      payload.number = phoneNumber;
    }

    return this.makeRequest('/instance/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // Obter QR Code da instância
  async getQRCode(instanceName: string) {
    console.log("Obtendo QR Code para:", instanceName);
    return this.makeRequest(`/instance/connect/${instanceName}`);
  }

  // Verificar status da instância
  async getInstanceStatus(instanceName: string) {
    console.log("Verificando status da instância:", instanceName);
    return this.makeRequest(`/instance/connectionState/${instanceName}`);
  }

  // Deletar instância
  async deleteInstance(instanceName: string) {
    console.log("Deletando instância:", instanceName);
    return this.makeRequest(`/instance/delete/${instanceName}`, {
      method: 'DELETE',
    });
  }

  // Buscar conversas
  async findChats(instanceName: string) {
    console.log("Buscando conversas para:", instanceName);
    return this.makeRequest(`/chat/findChats/${instanceName}`);
  }

  // Buscar mensagens
  async findMessages(instanceName: string, remoteJid: string) {
    console.log("Buscando mensagens para:", { instanceName, remoteJid });
    return this.makeRequest(`/chat/findMessages/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        where: {
          key: {
            remoteJid: remoteJid
          }
        }
      }),
    });
  }

  // Enviar mensagem
  async sendMessage(instanceName: string, remoteJid: string, message: string) {
    console.log("Enviando mensagem:", { instanceName, remoteJid, message });
    return this.makeRequest(`/message/sendText/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        number: remoteJid,
        text: message,
      }),
    });
  }

  // Métodos para configuração - agora retornam a configuração padrão
  async getActiveConfig() {
    try {
      console.log("Retornando configuração pré-definida...");
      
      // Retornar sempre a configuração pré-definida
      const defaultConfig = {
        id: 'default_config',
        name: 'Evolution API Padrão',
        api_url: EVOLUTION_API_BASE_URL,
        global_key: EVOLUTION_API_KEY,
        is_active: true,
        user_id: 'system',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      console.log("Configuração padrão ativa:", {
        name: defaultConfig.name,
        api_url: defaultConfig.api_url,
        has_global_key: !!defaultConfig.global_key
      });
      
      return defaultConfig;
    } catch (error) {
      console.error("Erro ao obter configuração ativa:", error);
      return null;
    }
  }

  async saveConfig(name: string, apiUrl: string, globalKey: string) {
    try {
      console.log("Salvando configuração personalizada:", {
        name,
        api_url: apiUrl,
        global_key: globalKey.substring(0, 8) + "..."
      });
      
      // Salvar configuração personalizada no localStorage se fornecida
      const config = {
        id: `config_${Date.now()}`,
        name: name,
        api_url: apiUrl,
        global_key: globalKey,
        is_active: true,
        user_id: 'current_user',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      localStorage.setItem('evolution_config', JSON.stringify(config));
      console.log("Configuração personalizada salva com sucesso");
      
      // Atualizar credenciais se diferentes das padrão
      if (apiUrl !== EVOLUTION_API_BASE_URL || globalKey !== EVOLUTION_API_KEY) {
        this.setCredentials(apiUrl, globalKey);
      }
      
      return config;
    } catch (error) {
      console.error("Erro ao salvar configuração:", error);
      throw error;
    }
  }

  async getAllConfigs(): Promise<EvolutionApiConfig[]> {
    // Verificar se há configuração personalizada
    const savedConfig = localStorage.getItem('evolution_config');
    if (savedConfig) {
      try {
        const customConfig = JSON.parse(savedConfig);
        return [customConfig];
      } catch (error) {
        console.error("Erro ao carregar configuração personalizada:", error);
      }
    }
    
    // Retornar configuração padrão
    const defaultConfig = await this.getActiveConfig();
    return defaultConfig ? [defaultConfig] : [];
  }

  async setActiveConfig(configId: string) {
    // Por enquanto apenas log, pois usamos localStorage
    console.log("Definindo configuração ativa:", configId);
  }

  async updateConfig(configId: string, updates: Partial<EvolutionApiConfig>) {
    const config = await this.getActiveConfig();
    if (config && config.id === configId) {
      const updatedConfig = { ...config, ...updates, updated_at: new Date().toISOString() };
      localStorage.setItem('evolution_config', JSON.stringify(updatedConfig));
      if (updates.api_url && updates.global_key) {
        this.setCredentials(updates.api_url, updates.global_key);
      }
      return updatedConfig;
    }
    throw new Error('Configuração não encontrada');
  }

  async deleteConfig(configId: string) {
    const config = await this.getActiveConfig();
    if (config && config.id === configId) {
      localStorage.removeItem('evolution_config');
      return true;
    }
    throw new Error('Configuração não encontrada');
  }
}

export const evolutionApi = new EvolutionAPI();
