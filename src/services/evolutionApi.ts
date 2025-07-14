import { Config } from "@/components/settings/types";

class EvolutionApi {
  private baseUrl: string = "";
  private apiKey: string | null = null;
  private activeConfig: Config | null = null;

  constructor() {
    // Carregar as credenciais do localStorage ao inicializar
    this.loadCredentials();
  }

  setCredentials(baseUrl: string, apiKey: string | null) {
    console.log("EvolutionApi: Definindo credenciais:", { baseUrl, apiKey });
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    
    // Salvar as credenciais no localStorage
    localStorage.setItem('evolutionApiBaseUrl', baseUrl);
    if (apiKey) {
      localStorage.setItem('evolutionApiKey', apiKey);
    } else {
      localStorage.removeItem('evolutionApiKey');
    }
  }

  loadCredentials() {
    const baseUrl = localStorage.getItem('evolutionApiBaseUrl');
    const apiKey = localStorage.getItem('evolutionApiKey');
    
    if (baseUrl) {
      console.log("EvolutionApi: Carregando credenciais do localStorage:", { baseUrl, apiKey });
      this.baseUrl = baseUrl;
      this.apiKey = apiKey;
    }
  }

  async setActiveConfig(config: Config) {
    this.activeConfig = config;
  }

  async getActiveConfig(): Promise<Config | null> {
    return this.activeConfig;
  }

  async getInstanceStatus(instanceName: string) {
    try {
      console.log(`Obtendo status da instância: ${instanceName}`);
      const response = await fetch(`${this.baseUrl}/instance/info/${instanceName}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.apiKey || ''
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Erro HTTP ${response.status}:`, errorText);
        throw new Error(`Erro HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log("Resposta da API:", data);
      return data;
    } catch (error) {
      console.error("Erro ao obter status da instância:", error);
      throw error;
    }
  }

  async getQRCode(instanceName: string) {
    try {
      console.log(`Solicitando QR Code para instância: ${instanceName}`);
      
      // Usar o endpoint correto da documentação: /instance/connect/{instanceName}
      const response = await fetch(`${this.baseUrl}/instance/connect/${instanceName}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.apiKey || ''
        }
      });

      console.log(`Status da resposta QR Code: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Erro HTTP ${response.status}:`, errorText);
        throw new Error(`Erro HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log("Resposta completa da API para QR Code:", data);

      // Verificar se a resposta contém o QR code em base64
      if (data.base64) {
        return {
          success: true,
          qrcode: {
            base64: data.base64
          },
          status: data.status || "connecting"
        };
      }

      // Se não tem base64, mas tem qrcode
      if (data.qrcode) {
        return {
          success: true,
          qrcode: data.qrcode,
          status: data.status || "connecting"
        };
      }

      // Se já está conectado
      if (data.status === "open" || data.instance?.state === "open") {
        return {
          success: true,
          status: "connected",
          message: "Instância já conectada"
        };
      }

      // Resposta inesperada
      console.warn("Resposta inesperada da API:", data);
      return {
        success: false,
        error: "Formato de resposta inesperado da API"
      };

    } catch (error) {
      console.error("Erro ao obter QR code:", error);
      throw error;
    }
  }

  async deleteInstance(instanceName: string) {
    try {
      console.log(`Deletando instância: ${instanceName}`);
      const response = await fetch(`${this.baseUrl}/instance/delete/${instanceName}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.apiKey || ''
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Erro HTTP ${response.status}:`, errorText);
        throw new Error(`Erro HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log("Resposta da API ao deletar instância:", data);
      return data;
    } catch (error) {
      console.error("Erro ao deletar instância:", error);
      throw error;
    }
  }
}

export const evolutionApi = new EvolutionApi();
