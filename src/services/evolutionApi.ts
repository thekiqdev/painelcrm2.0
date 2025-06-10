import { Config } from "@/types";

interface InstanceStatus {
  instance: {
    state: string;
  };
}

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
}

export const evolutionApi = new EvolutionApiService();
