
import { evolutionApi } from "../evolutionApi";
import { connectionDatabaseService } from "./connectionDatabaseService";

export const evolutionQRService = {
  getEvolutionQRCode: async (instanceName: string) => {
    try {
      console.log("Obtendo QR Code para instância:", instanceName);
      
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Nenhuma configuração ativa encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      
      // Primeiro verificar se a instância já está conectada
      try {
        const status = await evolutionApi.getInstanceStatus(instanceName);
        console.log("Status atual da instância:", status);
        
        if (status?.instance?.state === "open") {
          // Instância já conectada
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
            message: "Instância já está conectada!"
          };
        }
      } catch (statusError) {
        console.log("Erro ao verificar status inicial:", statusError);
      }
      
      // Tentar obter QR code com retry
      let attempts = 0;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts) {
        try {
          attempts++;
          console.log(`Tentativa ${attempts} de obter QR Code...`);
          
          const qrResult = await evolutionApi.getQRCode(instanceName);
          console.log("Resultado do QR Code:", qrResult);
          
          if (qrResult && qrResult.qrcode && qrResult.qrcode.base64) {
            console.log("QR Code obtido com sucesso");
            
            // Atualizar conexão existente
            const existingConnection = await connectionDatabaseService.getConnectionByInstanceName(instanceName);
            
            if (existingConnection?.id) {
              await connectionDatabaseService.updateConnection(existingConnection.id, {
                status: "awaiting_scan",
                qr_code: qrResult.qrcode.base64
              });
            }
            
            return {
              success: true,
              qrCode: qrResult.qrcode.base64,
              status: "awaiting_scan",
              message: "QR Code gerado com sucesso!"
            };
          } else {
            console.log("QR Code não disponível na resposta");
            
            // Se não há QR code, verificar novamente o status
            const status = await evolutionApi.getInstanceStatus(instanceName);
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
                message: "Instância já está conectada!"
              };
            }
          }
          
          // Aguardar antes da próxima tentativa
          if (attempts < maxAttempts) {
            console.log("Aguardando 2 segundos antes da próxima tentativa...");
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          
        } catch (error) {
          console.error(`Erro na tentativa ${attempts}:`, error);
          
          // Se não é a última tentativa, aguardar antes de tentar novamente
          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }
      
      // Se chegou aqui, não conseguiu obter QR code
      throw new Error("Não foi possível gerar o QR Code após várias tentativas. Verifique se a instância está ativa na Evolution API.");
      
    } catch (error) {
      console.error("Erro ao obter QR code Evolution:", error);
      throw error;
    }
  }
};
