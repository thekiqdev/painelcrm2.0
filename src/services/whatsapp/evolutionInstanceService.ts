
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
      
      // Salvar conexão no banco de dados imediatamente após criação bem-sucedida
      const savedConnection = await connectionDatabaseService.saveConnection({
        name: instanceName,
        type: "evolution",
        status: "created", // Status inicial: criada mas não conectada
        instance_name: instanceName,
        phone_number: phoneNumber,
        webhook_url: webhookUrl,
        config_data: {
          instanceName,
          phoneNumber,
          webhookUrl
        }
      });
      
      console.log("Conexão salva no banco após criação:", savedConnection);
      
      // Aguardar um momento para a instância ser inicializada
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Tentar obter o QR code (não crítico)
      try {
        const qrResult = await evolutionApi.getQRCode(instanceName);
        console.log("QR Code obtido:", qrResult);
        
        if (qrResult && qrResult.qrcode && qrResult.qrcode.base64) {
          // Atualizar conexão com QR code
          if (savedConnection?.id) {
            await connectionDatabaseService.updateConnection(savedConnection.id, {
              status: "awaiting_scan",
              qr_code: qrResult.qrcode.base64
            });
          }
          
          return {
            success: true,
            qrCode: qrResult.qrcode.base64,
            status: "awaiting_scan",
            connectionId: savedConnection?.id
          };
        }
      } catch (qrError) {
        console.log("Erro ao obter QR Code inicial (não crítico):", qrError);
      }
      
      // Se não conseguiu obter QR code, verificar se já está conectada
      try {
        const status = await evolutionApi.getInstanceStatus(instanceName);
        console.log("Status da instância:", status);
        
        if (status?.instance?.state === "open") {
          // Atualizar para conectado
          if (savedConnection?.id) {
            await connectionDatabaseService.updateConnection(savedConnection.id, {
              status: "connected"
            });
          }
          
          return {
            success: true,
            status: "connected",
            connectionId: savedConnection?.id
          };
        }
      } catch (statusError) {
        console.error("Erro ao verificar status:", statusError);
      }
      
      // Instância criada e salva, mas sem QR code - isso é OK
      return {
        success: true,
        status: "created",
        message: "Instância criada com sucesso. Use o botão 'Gerar QR Code' para conectar.",
        connectionId: savedConnection?.id
      };
      
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
