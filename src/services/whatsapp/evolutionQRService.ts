
import { evolutionApi } from "../evolutionApi";
import { connectionDatabaseService } from "./connectionDatabaseService";

export const evolutionQRService = {
  getEvolutionQRCode: async (instanceName: string) => {
    try {
      console.log("Obtendo QR Code para instância:", instanceName);
      
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Nenhuma configuração ativa encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      
      const qrResult = await evolutionApi.getInstanceQrCode(instanceName);
      console.log("Resultado do QR Code:", qrResult);
      
      if (qrResult && typeof qrResult === 'string') {
        console.log("QR Code obtido com sucesso");
        
        // Atualizar conexão existente ou criar nova
        const existingConnection = await connectionDatabaseService.getConnectionByInstanceName(instanceName);
        
        if (existingConnection?.id) {
          await connectionDatabaseService.updateConnection(existingConnection.id, {
            status: "awaiting_scan",
            qr_code: qrResult
          });
        } else {
          await connectionDatabaseService.saveConnection({
            name: instanceName,
            type: "evolution",
            status: "awaiting_scan",
            instance_name: instanceName,
            config_data: { instanceName },
            qr_code: qrResult
          });
        }
        
        return {
          success: true,
          qrCode: qrResult,
          status: "awaiting_scan"
        };
      } else {
        const status = await evolutionApi.getInstanceStatus(instanceName);
        if (status?.instance?.state === "open") {
          // Atualizar status para conectado
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
        }
        throw new Error("QR Code não foi gerado e instância não está conectada");
      }
      
    } catch (error) {
      console.error("Erro ao obter QR code Evolution:", error);
      throw error;
    }
  }
};
