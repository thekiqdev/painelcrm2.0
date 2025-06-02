
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
    try {
      console.log("Verificando configuração no localStorage...");
      
      // Buscar configuração ativa do localStorage
      const savedConfig = localStorage.getItem('evolution_config');
      console.log("Raw localStorage data:", savedConfig);
      
      if (savedConfig) {
        const config = JSON.parse(savedConfig);
        console.log("Configuração parseada:", config);
        
        // Verificar se a configuração tem os campos necessários e não está vazia
        if (config && 
            typeof config.api_url === 'string' && config.api_url.trim() !== '' &&
            typeof config.global_key === 'string' && config.global_key.trim() !== '') {
          
          console.log("Configuração válida encontrada:", {
            name: config.name,
            api_url: config.api_url,
            has_global_key: !!config.global_key
          });
          
          return config;
        } else {
          console.log("Configuração inválida ou incompleta:", {
            has_api_url: !!config?.api_url,
            api_url_length: config?.api_url?.length || 0,
            has_global_key: !!config?.global_key,
            global_key_length: config?.global_key?.length || 0
          });
        }
      } else {
        console.log("Nenhuma configuração encontrada no localStorage");
      }
      
      return null;
    } catch (error) {
      console.error("Erro ao obter configuração ativa:", error);
      return null;
    }
  }

  async saveConfig(name: string, apiUrl: string, globalKey: string) {
    try {
      // Validar dados antes de salvar
      if (!name || !apiUrl || !globalKey) {
        throw new Error("Todos os campos são obrigatórios");
      }
      
      // Limpar dados de entrada
      const cleanApiUrl = apiUrl.trim();
      const cleanGlobalKey = globalKey.trim();
      const cleanName = name.trim();
      
      console.log("Salvando configuração:", {
        name: cleanName,
        api_url: cleanApiUrl,
        global_key: cleanGlobalKey.substring(0, 8) + "..." // Log apenas parte da chave
      });
      
      // Salvar configuração no localStorage
      const config = {
        id: `config_${Date.now()}`,
        name: cleanName,
        api_url: cleanApiUrl,
        global_key: cleanGlobalKey,
        is_active: true,
        user_id: 'current_user',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      localStorage.setItem('evolution_config', JSON.stringify(config));
      console.log("Configuração salva com sucesso:", {
        id: config.id,
        name: config.name,
        api_url: config.api_url
      });
      
      // Definir credenciais imediatamente
      this.setCredentials(cleanApiUrl, cleanGlobalKey);
      
      return config;
    } catch (error) {
      console.error("Erro ao salvar configuração:", error);
      throw error;
    }
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
