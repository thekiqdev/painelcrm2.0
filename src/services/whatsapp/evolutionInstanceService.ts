
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
      
      // Criar a instância usando o nome exato fornecido
      const result = await evolutionApi.createInstance(instanceName, phoneNumber);
      console.log("Resultado da criação da instância:", result);
      
      // Aguardar um momento para a instância ser inicializada
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Tentar obter o QR code
      try {
        const qrResult = await evolutionApi.getQRCode(instanceName);
        console.log("QR Code obtido:", qrResult);
        
        if (qrResult && qrResult.qrcode && qrResult.qrcode.base64) {
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
              webhookUrl
            },
            qr_code: qrResult.qrcode.base64
          });
          
          return {
            success: true,
            qrCode: qrResult.qrcode.base64,
            status: "awaiting_scan"
          };
        }
      } catch (qrError) {
        console.log("Erro ao obter QR Code, verificando se já está conectada:", qrError);
      }
      
      // Se não conseguiu obter QR code, verificar se já está conectada
      try {
        const status = await evolutionApi.getInstanceStatus(instanceName);
        console.log("Status da instância:", status);
        
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
      
      throw new Error("Instância criada mas não foi possível obter QR code ou verificar status");
      
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
