
import { evolutionApi } from "./evolutionApi";
import { toast } from "sonner";

export interface ConnectionConfig {
  id: string;
  name: string;
  type: "evolution" | "webjs" | "qrcode";
  status: "created" | "connecting" | "connected" | "disconnected";
  configData: {
    instanceName: string;
    phoneNumber: string;
    serverUrl?: string;
  };
  createdAt: string;
}

class WhatsAppConnectionManager {
  private connections: ConnectionConfig[] = [];
  private storageKey = 'whatsapp_connections';

  constructor() {
    this.loadConnections();
  }

  // Carregar conexões do localStorage
  loadConnections(): ConnectionConfig[] {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        this.connections = JSON.parse(stored);
      }
    } catch (error) {
      console.error("Erro ao carregar conexões:", error);
      this.connections = [];
    }
    return this.connections;
  }

  // Salvar conexões no localStorage
  saveConnections(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.connections));
    } catch (error) {
      console.error("Erro ao salvar conexões:", error);
    }
  }

  // Obter todas as conexões
  getConnections(): ConnectionConfig[] {
    return this.connections;
  }

  // Criar nova conexão
  async createConnection(name: string, phoneNumber: string): Promise<{
    success: boolean;
    connection?: ConnectionConfig;
    error?: string;
  }> {
    try {
      const config = await evolutionApi.getActiveConfig();
      if (!config) {
        throw new Error("Configuração da Evolution API não encontrada");
      }

      evolutionApi.setCredentials(config.api_url, config.global_key);

      const cleanPhoneNumber = phoneNumber.replace(/\D/g, '');
      const cleanConnectionName = name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const instanceName = `${cleanConnectionName}_${cleanPhoneNumber}`;

      // Tentar criar instância
      try {
        await evolutionApi.createInstance(instanceName, cleanPhoneNumber);
      } catch (createError: any) {
        // Se já existe, continuar normalmente
        if (!createError.message?.includes("already exists") && !createError.message?.includes("já existe")) {
          throw createError;
        }
      }

      const newConnection: ConnectionConfig = {
        id: `conn_${Date.now()}`,
        name,
        type: "evolution",
        status: "created",
        configData: {
          instanceName,
          phoneNumber: cleanPhoneNumber,
          serverUrl: config.api_url
        },
        createdAt: new Date().toISOString()
      };

      this.connections.push(newConnection);
      this.saveConnections();

      return { success: true, connection: newConnection };
    } catch (error) {
      console.error("Erro ao criar conexão:", error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Erro desconhecido" 
      };
    }
  }

  // Obter QR Code para uma conexão
  async getQRCode(connectionId: string): Promise<{
    success: boolean;
    qrCode?: string;
    error?: string;
  }> {
    try {
      const connection = this.connections.find(c => c.id === connectionId);
      if (!connection) {
        throw new Error("Conexão não encontrada");
      }

      const config = await evolutionApi.getActiveConfig();
      if (!config) {
        throw new Error("Configuração não encontrada");
      }

      evolutionApi.setCredentials(config.api_url, config.global_key);

      // Verificar se já está conectado
      try {
        const status = await evolutionApi.getInstanceStatus(connection.configData.instanceName);
        if (status.instance.state === "open") {
          this.updateConnectionStatus(connectionId, "connected");
          return { success: true, qrCode: "already_connected" };
        }
      } catch (statusError) {
        console.log("Verificando status da instância...");
      }

      // Obter QR code
      const qrResult = await evolutionApi.getQRCode(connection.configData.instanceName);
      
      if (qrResult?.qrcode?.base64) {
        this.updateConnectionStatus(connectionId, "connecting");
        return { success: true, qrCode: qrResult.qrcode.base64 };
      } else {
        throw new Error("Não foi possível gerar o QR code");
      }

    } catch (error) {
      console.error("Erro ao obter QR code:", error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Erro desconhecido" 
      };
    }
  }

  // Verificar status de conexão
  async checkConnectionStatus(connectionId: string): Promise<{
    success: boolean;
    status?: string;
    error?: string;
  }> {
    try {
      const connection = this.connections.find(c => c.id === connectionId);
      if (!connection) {
        throw new Error("Conexão não encontrada");
      }

      const config = await evolutionApi.getActiveConfig();
      if (!config) {
        throw new Error("Configuração não encontrada");
      }

      evolutionApi.setCredentials(config.api_url, config.global_key);
      const status = await evolutionApi.getInstanceStatus(connection.configData.instanceName);

      if (status.instance.state === "open") {
        this.updateConnectionStatus(connectionId, "connected");
        return { success: true, status: "connected" };
      } else {
        return { success: true, status: status.instance.state };
      }

    } catch (error) {
      console.error("Erro ao verificar status:", error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Erro desconhecido" 
      };
    }
  }

  // Atualizar status da conexão
  updateConnectionStatus(connectionId: string, status: ConnectionConfig['status']): void {
    const index = this.connections.findIndex(c => c.id === connectionId);
    if (index !== -1) {
      this.connections[index].status = status;
      this.saveConnections();
    }
  }

  // Deletar conexão
  async deleteConnection(connectionId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const connection = this.connections.find(c => c.id === connectionId);
      if (!connection) {
        throw new Error("Conexão não encontrada");
      }

      // Deletar instância na API Evolution
      if (connection.type === "evolution") {
        const config = await evolutionApi.getActiveConfig();
        if (config) {
          evolutionApi.setCredentials(config.api_url, config.global_key);
          try {
            await evolutionApi.deleteInstance(connection.configData.instanceName);
          } catch (deleteError) {
            console.log("Instância pode já ter sido deletada ou não existir");
          }
        }
      }

      // Remover da lista local
      this.connections = this.connections.filter(c => c.id !== connectionId);
      this.saveConnections();

      return { success: true };
    } catch (error) {
      console.error("Erro ao deletar conexão:", error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Erro desconhecido" 
      };
    }
  }
}

// Instância singleton
export const whatsappConnectionManager = new WhatsAppConnectionManager();
