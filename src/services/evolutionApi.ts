
const EVOLUTION_API_BASE_URL = 'https://api.evolution.com.br'; // URL base padrão

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
  private baseUrl: string = '';
  private globalKey: string = '';

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

  // Métodos para configuração
  async getActiveConfig() {
    // Buscar configuração ativa do banco de dados ou localStorage
    const savedConfig = localStorage.getItem('evolution_config');
    if (savedConfig) {
      return JSON.parse(savedConfig);
    }
    return null;
  }

  async saveConfig(name: string, apiUrl: string, globalKey: string) {
    // Salvar configuração no localStorage por enquanto
    const config = {
      id: `config_${Date.now()}`,
      name,
      api_url: apiUrl,
      global_key: globalKey,
      is_active: true,
      user_id: 'current_user',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    localStorage.setItem('evolution_config', JSON.stringify(config));
    this.setCredentials(apiUrl, globalKey);
    return config;
  }

  async getAllConfigs(): Promise<EvolutionApiConfig[]> {
    // Por enquanto retornar apenas a configuração ativa do localStorage
    const activeConfig = await this.getActiveConfig();
    return activeConfig ? [activeConfig] : [];
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
