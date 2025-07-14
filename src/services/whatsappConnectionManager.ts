
import { connectionDatabaseService, DatabaseConnection } from "./whatsapp/connectionDatabaseService";
import { evolutionService } from "./whatsapp/evolutionService";

interface Connection {
  id: string;
  name: string;
  type: string;
  status: string;
  configData: {
    instanceName?: string;
    phoneNumber?: string;
    serverUrl?: string;
    apiKey?: string;
  };
  createdAt?: string;
}

export const whatsappConnectionManager = {
  async createConnection(instanceName: string, phoneNumber: string): Promise<{ success: boolean; connection?: Connection; error?: string }> {
    try {
      console.log("Criando conexão:", { instanceName, phoneNumber });
      
      const result = await evolutionService.createEvolutionInstance(instanceName, phoneNumber);
      
      if (result.success) {
        const connection: Connection = {
          id: result.connectionId || `conn_${Date.now()}`,
          name: instanceName,
          type: "evolution",
          status: result.status || "created",
          configData: {
            instanceName,
            phoneNumber,
          },
          createdAt: new Date().toISOString()
        };
        
        return {
          success: true,
          connection
        };
      }
      
      throw new Error("Erro ao criar instância");
    } catch (error) {
      console.error("Erro ao criar conexão:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido"
      };
    }
  },

  async generateQRCode(connectionId: string): Promise<{ success: boolean; qrCode?: string; error?: string }> {
    try {
      const connections = await connectionDatabaseService.getConnections();
      const connection = connections.find(c => c.id === connectionId);
      
      if (!connection) {
        throw new Error("Conexão não encontrada");
      }
      
      if (!connection.instance_name) {
        throw new Error("Nome da instância não encontrado na conexão");
      }
      
      console.log("Gerando QR code para instância:", connection.instance_name);
      
      const result = await evolutionService.getEvolutionQRCode(connection.instance_name);
      
      return {
        success: result.success,
        qrCode: result.qrCode,
        error: result.success ? undefined : "Erro ao gerar QR code"
      };
    } catch (error) {
      console.error("Erro ao gerar QR code:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido"
      };
    }
  },

  async getQRCode(connectionId: string): Promise<{ success: boolean; qrCode?: string; error?: string }> {
    try {
      const connections = await connectionDatabaseService.getConnections();
      const connection = connections.find(c => c.id === connectionId);
      
      if (!connection) {
        throw new Error("Conexão não encontrada");
      }
      
      if (!connection.instance_name) {
        throw new Error("Nome da instância não encontrado na conexão");
      }
      
      console.log("Obtendo QR code para instância:", connection.instance_name);
      
      const result = await evolutionService.getEvolutionQRCode(connection.instance_name);
      
      return {
        success: result.success,
        qrCode: result.qrCode,
        error: result.success ? undefined : "Erro ao obter QR code"
      };
    } catch (error) {
      console.error("Erro ao obter QR code:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido"
      };
    }
  },

  async checkConnectionStatus(connectionId: string): Promise<{ success: boolean; status?: string; error?: string }> {
    try {
      const connections = await connectionDatabaseService.getConnections();
      const connection = connections.find(c => c.id === connectionId);
      
      if (!connection) {
        throw new Error("Conexão não encontrada");
      }
      
      if (!connection.instance_name) {
        throw new Error("Nome da instância não encontrado na conexão");
      }
      
      const result = await evolutionService.checkEvolutionConnection(connection.instance_name);
      
      return {
        success: result.success,
        status: result.status,
        error: result.success ? undefined : "Erro ao verificar status"
      };
    } catch (error) {
      console.error("Erro ao verificar status:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido"
      };
    }
  },

  getConnections(): Connection[] {
    return [];
  }
};
