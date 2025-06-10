
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
            message: "Instância já está conectada!"
          };
        }
        
        // Se está em estado de inicialização, aguardar um pouco
        if (status?.instance?.state === "starting") {
          console.log("Instância está iniciando, aguardando...");
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
      } catch (statusError) {
        console.log("Erro ao verificar status inicial, tentando criar/conectar:", statusError);
      }
      
      // Tentar conectar a instância primeiro (caso ela exista mas não esteja conectada)
      try {
        console.log("Tentando conectar instância...");
        await evolutionApi.connectInstance(instanceName);
        
        // Aguardar um momento após conectar
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (connectError) {
        console.log("Erro ao conectar instância ou instância não existe:", connectError);
      }
      
      // Agora tentar obter QR code com retry
      let attempts = 0;
      const maxAttempts = 5;
      
      while (attempts < maxAttempts) {
        try {
          attempts++;
          console.log(`Tentativa ${attempts} de obter QR Code...`);
          
          // Verificar status antes de tentar obter QR
          const currentStatus = await evolutionApi.getInstanceStatus(instanceName);
          console.log(`Status na tentativa ${attempts}:`, currentStatus);
          
          // Se conectou durante as tentativas
          if (currentStatus?.instance?.state === "open") {
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
              message: "Instância conectada com sucesso!"
            };
          }
          
          // Se está no estado correto para gerar QR (close significa desconectada mas pronta)
          if (currentStatus?.instance?.state === "close" || currentStatus?.instance?.state === "connecting") {
            const qrResult = await evolutionApi.getQRCode(instanceName);
            console.log("Resultado do QR Code:", qrResult);
            
            if (qrResult && qrResult.qrcode) {
              let qrCodeData = null;
              
              // Verificar se o QR code está em base64 ou texto
              if (qrResult.qrcode.base64) {
                qrCodeData = qrResult.qrcode.base64;
              } else if (qrResult.qrcode.code) {
                qrCodeData = qrResult.qrcode.code;
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
          }
          
          // Se não obteve QR code, aguardar antes da próxima tentativa
          if (attempts < maxAttempts) {
            console.log(`Aguardando ${3 + attempts} segundos antes da próxima tentativa...`);
            await new Promise(resolve => setTimeout(resolve, (3 + attempts) * 1000));
          }
          
        } catch (error) {
          console.error(`Erro na tentativa ${attempts}:`, error);
          
          // Se é erro de instância não encontrada, tentar recriar
          if (error instanceof Error && error.message.includes("not found")) {
            console.log("Instância não encontrada, pode precisar ser recriada");
            throw new Error("Instância não encontrada na Evolution API. Crie uma nova conexão.");
          }
          
          // Para outros erros, aguardar antes de tentar novamente
          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, (2 + attempts) * 1000));
          }
        }
      }
      
      // Se chegou aqui, não conseguiu obter QR code após todas as tentativas
      throw new Error(`Não foi possível gerar o QR Code após ${maxAttempts} tentativas. Verifique se a instância '${instanceName}' está ativa na Evolution API ou tente criar uma nova conexão.`);
      
    } catch (error) {
      console.error("Erro ao obter QR code Evolution:", error);
      throw error;
    }
  }
};
