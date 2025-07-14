
import { evolutionApi } from "../evolutionApi";
import { connectionDatabaseService } from "./connectionDatabaseService";

export const evolutionQRService = {
  getEvolutionQRCode: async (instanceName: string) => {
    try {
      console.log("evolutionQRService: Obtendo QR Code para instância:", instanceName);
      
      if (!instanceName) {
        throw new Error("Nome da instância é obrigatório");
      }
      
      const config = await evolutionApi.getActiveConfig();
      if (!config) {
        throw new Error("Nenhuma configuração ativa da Evolution API encontrada");
      }
      
      console.log("evolutionQRService: Configuração encontrada:", { 
        api_url: config.api_url,
        hasGlobalKey: !!config.global_key 
      });
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      
      // Primeiro verificar se a instância existe e seu status atual
      try {
        console.log("evolutionQRService: Verificando status da instância:", instanceName);
        const status = await evolutionApi.getInstanceStatus(instanceName);
        console.log("evolutionQRService: Status atual da instância:", status);
        
        // Se já está conectada, retornar sucesso
        if (status?.instance?.state === "open") {
          console.log("evolutionQRService: Instância já conectada");
          
          const existingConnection = await connectionDatabaseService.getConnectionByInstanceName(instanceName);
          if (existingConnection?.id) {
            await connectionDatabaseService.updateConnection(existingConnection.id, {
              status: "connected",
              qr_code: null
            });
          }
          
          return {
            success: true,
            status: "connected",
            qrCode: "already_connected",
            message: "Instância já está conectada!"
          };
        }
        
      } catch (statusError) {
        console.log("evolutionQRService: Erro ao verificar status inicial:", statusError);
        // Se erro 404, a instância não existe
        if (statusError instanceof Error && statusError.message.includes("404")) {
          throw new Error(`Instância '${instanceName}' não encontrada na Evolution API. Verifique se o nome está correto e se a instância foi criada.`);
        }
      }
      
      // Tentar obter QR code
      console.log("evolutionQRService: Solicitando QR Code para:", instanceName);
      const qrResult = await evolutionApi.getQRCode(instanceName);
      console.log("evolutionQRService: Resultado do QR Code:", qrResult);
      
      if (qrResult && qrResult.success && qrResult.status === "connected") {
        console.log("evolutionQRService: Instância conectada durante obtenção do QR");
        
        // Atualizar conexão existente
        const existingConnection = await connectionDatabaseService.getConnectionByInstanceName(instanceName);
        if (existingConnection?.id) {
          await connectionDatabaseService.updateConnection(existingConnection.id, {
            status: "connected",
            qr_code: null
          });
        }
        
        return {
          success: true,
          status: "connected",
          qrCode: "already_connected",
          message: "Instância conectada com sucesso!"
        };
      }
      
      if (qrResult && qrResult.qrcode) {
        let qrCodeData = null;
        
        // Verificar se o QR code está em base64
        if (qrResult.qrcode.base64) {
          qrCodeData = qrResult.qrcode.base64;
        } else if (typeof qrResult.qrcode === 'string') {
          qrCodeData = qrResult.qrcode;
        }
        
        if (qrCodeData) {
          console.log("evolutionQRService: QR Code obtido com sucesso");
          
          // Atualizar conexão existente
          const existingConnection = await connectionDatabaseService.getConnectionByInstanceName(instanceName);
          
          if (existingConnection?.id) {
            await connectionDatabaseService.updateConnection(existingConnection.id, {
              status: "awaiting_scan",
              qr_code: qrCodeData
            });
          }
          
          return {
            success: true,
            qrCode: qrCodeData,
            status: "awaiting_scan",
            message: "QR Code gerado com sucesso!"
          };
        }
      }
      
      // Se chegou aqui, não conseguiu obter QR code
      console.error("evolutionQRService: Não foi possível gerar QR Code");
      throw new Error(`Não foi possível gerar o QR Code para a instância '${instanceName}'. Verifique se a instância está ativa na Evolution API.`);
      
    } catch (error) {
      console.error("evolutionQRService: Erro ao obter QR code:", error);
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido ao obter QR code";
      
      return {
        success: false,
        qrCode: null,
        status: "error",
        message: errorMessage
      };
    }
  }
};
