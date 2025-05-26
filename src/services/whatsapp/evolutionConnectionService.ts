
import { evolutionApi } from "../evolutionApi";
import { connectionDatabaseService } from "./connectionDatabaseService";

export const evolutionConnectionService = {
  checkEvolutionConnection: async (instanceName: string) => {
    try {
      console.log("Verificando status da conexão:", instanceName);
      
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Nenhuma configuração ativa encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      
      const status = await evolutionApi.getInstanceStatus(instanceName);
      console.log("Status da instância:", status);
      
      if (status?.instance?.state === "open") {
        // Atualizar status no banco de dados
        const existingConnection = await connectionDatabaseService.getConnectionByInstanceName(instanceName);
        if (existingConnection?.id) {
          await connectionDatabaseService.updateConnection(existingConnection.id, {
            status: "connected",
            qr_code: null
          });
        }
        
        return {
          success: true,
          status: "connected"
        };
      } else {
        return {
          success: false,
          status: status?.instance?.state || "unknown"
        };
      }
      
    } catch (error) {
      console.error("Erro ao verificar conexão Evolution:", error);
      throw error;
    }
  },

  findActiveConnection: async () => {
    try {
      const connections = await connectionDatabaseService.getConnections();
      if (!connections || connections.length === 0) {
        console.log("Nenhuma conexão encontrada no banco");
        return null;
      }
      
      const activeConnection = connections.find(conn => conn && conn.status === "connected");
      
      if (activeConnection?.instance_name) {
        console.log(`Conexão ativa encontrada: ${activeConnection.instance_name}`);
        return {
          instanceName: activeConnection.instance_name,
          apikey: null // API key será obtida da configuração global
        };
      }
      
      console.log("Nenhuma conexão ativa encontrada no banco");
      return null;
    } catch (error) {
      console.error("Erro ao procurar conexão ativa:", error);
      return null;
    }
  }
};
