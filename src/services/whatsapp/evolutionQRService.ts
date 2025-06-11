
import { evolutionApi } from "../evolutionApi";
import { connectionDatabaseService } from "./connectionDatabaseService";

export const evolutionQRService = {
  getEvolutionQRCode: async (instanceName: string) => {
    try {
      console.log("Obtendo QR Code para instância:", instanceName);
      
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Nenhuma configuração ativa encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      
      // Primeiro verificar se a instância existe e seu status atual
      try {
        const status = await evolutionApi.getInstanceStatus(instanceName);
        console.log("Status atual da instância:", status);
        
        // Se já está conectada, retornar sucesso
        if (status?.instance?.state === "open") {
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
        console.log("Erro ao verificar status inicial:", statusError);
        // Se erro 404, a instância não existe
        if (statusError instanceof Error && statusError.message.includes("404")) {
          throw new Error("Instância não encontrada na Evolution API. Crie uma nova conexão.");
        }
      }
      
      // Tentar obter QR code
      console.log("Solicitando QR Code...");
      const qrResult = await evolutionApi.getQRCode(instanceName);
      console.log("Resultado do QR Code:", qrResult);
      
      if (qrResult.success && qrResult.status === "connected") {
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
          message: "Instância já está conectada!"
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
          console.log("QR Code obtido com sucesso");
          
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
      throw new Error("Não foi possível gerar o QR Code. Verifique se a instância está ativa na Evolution API.");
      
    } catch (error) {
      console.error("Erro ao obter QR code Evolution:", error);
      throw error;
    }
  }
};
