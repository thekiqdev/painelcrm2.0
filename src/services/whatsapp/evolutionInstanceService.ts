
import { evolutionApi } from "../evolutionApi";
import { connectionDatabaseService } from "./connectionDatabaseService";

export const evolutionInstanceService = {
  createEvolutionInstance: async (instanceName: string, phoneNumber: string, webhookUrl?: string) => {
    try {
      console.log("Criando instância Evolution API:", instanceName);
      
      const config = await evolutionApi.getActiveConfig();
      if (!config) {
        throw new Error("Nenhuma configuração encontrada. Configure primeiro em Configurações > Configuração API.");
      }
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      
      const result = await evolutionApi.createInstance(instanceName, phoneNumber);
      console.log("Resultado da criação da instância:", result);
      
      if (result?.success && result?.data?.qrcode) {
        // Salvar conexão no banco de dados
        await connectionDatabaseService.saveConnection({
          name: instanceName,
          type: "evolution",
          status: "awaiting_scan",
          instance_name: instanceName,
          phone_number: phoneNumber,
          webhook_url: webhookUrl,
          config_data: {
            instanceName,
            phoneNumber,
            webhookUrl
          },
          qr_code: result.data.qrcode
        });
        
        return {
          success: true,
          qrCode: result.data.qrcode,
          status: "awaiting_scan"
        };
      } else {
        try {
          const status = await evolutionApi.getInstanceStatus(instanceName);
          if (status?.instance?.state === "open") {
            // Salvar conexão conectada no banco
            await connectionDatabaseService.saveConnection({
              name: instanceName,
              type: "evolution",
              status: "connected",
              instance_name: instanceName,
              phone_number: phoneNumber,
              webhook_url: webhookUrl,
              config_data: {
                instanceName,
                phoneNumber,
                webhookUrl
              }
            });
            
            return {
              success: true,
              status: "connected"
            };
          }
        } catch (statusError) {
          console.error("Erro ao verificar status:", statusError);
        }
        
        console.log("QR Code não obtido na criação, tentando obter separadamente...");
        // Import dynamically to avoid circular dependency
        const { evolutionQRService } = await import("./evolutionQRService");
        return await evolutionQRService.getEvolutionQRCode(instanceName);
      }
      
    } catch (error) {
      console.error("Erro ao criar instância Evolution:", error);
      throw error;
    }
  },

  deleteEvolutionInstance: async (instanceName: string) => {
    try {
      console.log("Deletando instância Evolution API:", instanceName);
      
      const config = await evolutionApi.getActiveConfig();
      if (!config) {
        throw new Error("Nenhuma configuração ativa encontrada");
      }
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      
      await evolutionApi.deleteInstance(instanceName);
      
      // Deletar conexão do banco de dados
      try {
        const existingConnection = await connectionDatabaseService.getConnectionByInstanceName(instanceName);
        if (existingConnection?.id) {
          await connectionDatabaseService.deleteConnection(existingConnection.id);
        }
      } catch (dbError) {
        console.log("Erro ao deletar do banco, pode não existir a conexão");
      }
      
      return {
        success: true,
        message: "Instância deletada com sucesso"
      };
      
    } catch (error) {
      console.error("Erro ao deletar instância Evolution:", error);
      throw error;
    }
  }
};
