
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
      
      const result = await evolutionApi.createInstance(instanceName, webhookUrl);
      console.log("Resultado da criação da instância:", result);
      
      // Verificar se a instância foi criada com sucesso
      if (result?.instance?.instanceName) {
        // Aguardar um pouco antes de tentar obter o QR code
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Tentar obter QR code
        try {
          console.log("Tentando obter QR Code...");
          const qrCodeResult = await evolutionApi.getInstanceQrCode(instanceName);
          
          if (qrCodeResult) {
            // Salvar conexão no banco de dados com QR code
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
                webhookUrl,
                apikey: result.hash?.apikey
              },
              qr_code: qrCodeResult
            });
            
            return {
              success: true,
              qrCode: qrCodeResult,
              status: "awaiting_scan"
            };
          }
        } catch (qrError: any) {
          console.error("Erro ao obter QR Code:", qrError);
          
          // Se o erro é que já está conectado
          if (qrError.message?.includes("ALREADY_CONNECTED")) {
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
                webhookUrl,
                apikey: result.hash?.apikey
              }
            });
            
            return {
              success: true,
              status: "connected"
            };
          }
          
          // Verificar se a instância já está conectada
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
                  webhookUrl,
                  apikey: result.hash?.apikey
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
          
          throw qrError;
        }
      } else {
        throw new Error("Erro ao criar instância: resposta inválida da API");
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
