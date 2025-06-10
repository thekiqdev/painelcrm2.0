
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

  async getActiveConfig(): Promise<Config | null> {
    return this.activeConfig;
  }

  // Métodos de configuração (mock - precisariam de implementação real com banco de dados)
  async getAllConfigs(): Promise<EvolutionApiConfig[]> {
    // Mock implementation - na prática, isso viria do banco de dados
    const configs = localStorage.getItem('evolution_configs');
    return configs ? JSON.parse(configs) : [];
  }

  async saveConfig(name: string, apiUrl: string, globalKey: string): Promise<EvolutionApiConfig> {
    const configs = await this.getAllConfigs();
    const newConfig: EvolutionApiConfig = {
      id: Date.now().toString(),
      name,
      api_url: apiUrl,
      global_key: globalKey,
      is_active: configs.length === 0, // Primeira configuração é ativa por padrão
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const updatedConfigs = [...configs, newConfig];
    localStorage.setItem('evolution_configs', JSON.stringify(updatedConfigs));
    
    return newConfig;
  }

  async updateConfig(id: string, data: Partial<EvolutionApiConfig>): Promise<EvolutionApiConfig> {
    const configs = await this.getAllConfigs();
    const updatedConfigs = configs.map(config => 
      config.id === id 
        ? { ...config, ...data, updated_at: new Date().toISOString() }
        : config
    );
    
    localStorage.setItem('evolution_configs', JSON.stringify(updatedConfigs));
    
    const updatedConfig = updatedConfigs.find(c => c.id === id);
    if (!updatedConfig) throw new Error('Configuração não encontrada');
    
    return updatedConfig;
  }

  async deleteConfig(id: string): Promise<void> {
    const configs = await this.getAllConfigs();
    const updatedConfigs = configs.filter(config => config.id !== id);
    localStorage.setItem('evolution_configs', JSON.stringify(updatedConfigs));
  }

  async setActiveConfig(id: string): Promise<void> {
    const configs = await this.getAllConfigs();
    const updatedConfigs = configs.map(config => ({
      ...config,
      is_active: config.id === id
    }));
    
    localStorage.setItem('evolution_configs', JSON.stringify(updatedConfigs));
    
    const activeConfig = updatedConfigs.find(c => c.is_active);
    if (activeConfig) {
      this.activeConfig = activeConfig;
      this.setCredentials(activeConfig.api_url, activeConfig.global_key);
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
