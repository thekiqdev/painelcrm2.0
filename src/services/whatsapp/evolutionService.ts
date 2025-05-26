
import { supabase } from "@/integrations/supabase/client";
import { evolutionApi } from "../evolutionApi";
import { connectionDatabaseService } from "./connectionDatabaseService";

export const evolutionService = {
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
      
      if (result?.qrcode) {
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
          qr_code: result.qrcode
        });
        
        return {
          success: true,
          qrCode: result.qrcode,
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
        return await this.getEvolutionQRCode(instanceName);
      }
      
    } catch (error) {
      console.error("Erro ao criar instância Evolution:", error);
      throw error;
    }
  },

  getEvolutionQRCode: async (instanceName: string) => {
    try {
      console.log("Obtendo QR Code para instância:", instanceName);
      
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Nenhuma configuração ativa encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      
      const qrResult = await evolutionApi.getQRCode(instanceName);
      console.log("Resultado do QR Code:", qrResult);
      
      if (qrResult?.qrcode?.base64) {
        console.log("QR Code obtido com sucesso");
        
        // Atualizar conexão existente ou criar nova
        const existingConnection = await connectionDatabaseService.getConnectionByInstanceName(instanceName);
        
        if (existingConnection) {
          await connectionDatabaseService.updateConnection(existingConnection.id, {
            status: "awaiting_scan",
            qr_code: qrResult.qrcode.base64
          });
        } else {
          await connectionDatabaseService.saveConnection({
            name: instanceName,
            type: "evolution",
            status: "awaiting_scan",
            instance_name: instanceName,
            config_data: { instanceName },
            qr_code: qrResult.qrcode.base64
          });
        }
        
        return {
          success: true,
          qrCode: qrResult.qrcode.base64,
          status: "awaiting_scan"
        };
      } else {
        const status = await evolutionApi.getInstanceStatus(instanceName);
        if (status?.instance?.state === "open") {
          // Atualizar status para conectado
          const existingConnection = await connectionDatabaseService.getConnectionByInstanceName(instanceName);
          if (existingConnection) {
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
  },

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
        if (existingConnection) {
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
        if (existingConnection) {
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
  },

  // Novo método para encontrar a instância conectada correta
  findConnectedInstance: async () => {
    try {
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Nenhuma configuração ativa encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      
      // Obter todas as instâncias disponíveis
      const instances = await evolutionApi.getAllInstances();
      console.log("Instâncias disponíveis:", instances);
      
      // Verificar se instances existe e é um array antes de iterar
      if (!instances || !Array.isArray(instances)) {
        console.log("Nenhuma instância encontrada ou formato inválido");
        return null;
      }
      
      // Procurar por uma instância conectada
      for (const instance of instances) {
        try {
          // Verificar se instance e instanceName existem com optional chaining
          if (!instance?.instanceName) {
            console.log("Instância com dados inválidos encontrada, pulando...");
            continue;
          }
          
          const status = await evolutionApi.getInstanceStatus(instance.instanceName);
          if (status?.instance?.state === "open") {
            console.log(`Instância conectada encontrada: ${instance.instanceName}`);
            return {
              instanceName: instance.instanceName,
              apikey: instance?.apikey || null
            };
          }
        } catch (statusError) {
          console.log(`Erro ao verificar status da instância ${instance.instanceName}:`, statusError);
          continue;
        }
      }
      
      console.log("Nenhuma instância conectada encontrada");
      return null;
    } catch (error) {
      console.error("Erro ao procurar instância conectada:", error);
      return null;
    }
  },

  // Novo método para obter conversas com apikey da instância
  getEvolutionChats: async (instanceName: string, instanceApiKey?: string) => {
    try {
      console.log("Obtendo conversas Evolution API:", instanceName);
      
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Nenhuma configuração ativa encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      
      return await evolutionApi.getChats(instanceName, instanceApiKey);
    } catch (error) {
      console.error("Erro ao obter conversas Evolution:", error);
      throw error;
    }
  },

  getEvolutionMessages: async (instanceName: string, remoteJid: string, instanceApiKey?: string) => {
    try {
      console.log("Obtendo mensagens Evolution API:", instanceName, remoteJid);
      
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Nenhuma configuração ativa encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      
      return await evolutionApi.getMessages(instanceName, remoteJid, 50, instanceApiKey);
    } catch (error) {
      console.error("Erro ao obter mensagens Evolution:", error);
      throw error;
    }
  },

  sendEvolutionMessage: async (instanceName: string, remoteJid: string, message: string, instanceApiKey?: string) => {
    try {
      console.log("Enviando mensagem Evolution API:", instanceName, remoteJid);
      
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Nenhuma configuração ativa encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      
      return await evolutionApi.sendMessage(instanceName, remoteJid, message, instanceApiKey);
    } catch (error) {
      console.error("Erro ao enviar mensagem Evolution:", error);
      throw error;
    }
  }
};
