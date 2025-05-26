
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
        
        if (existingConnection?.id) {
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
  },

  // Método para encontrar conexões ativas no banco de dados
  findActiveConnection: async () => {
    try {
      const connections = await connectionDatabaseService.getConnections();
      const activeConnection = connections.find(conn => conn.status === "connected");
      
      if (activeConnection?.instance_name) {
        console.log(`Conexão ativa encontrada: ${activeConnection.instance_name}`);
        return {
          instanceName: activeConnection.instance_name,
          apikey: null // API key será obtida da configuração global
        };
      }
      
      console.log("Nenhuma conexão ativa encontrada no banco");
      return null;
    } catch (error) {
      console.error("Erro ao procurar conexão ativa:", error);
      return null;
    }
  },

  // Novo método para obter conversas com instância do banco
  getEvolutionChats: async (instanceName?: string) => {
    try {
      let targetInstanceName = instanceName;
      
      // Se não foi fornecido instanceName, buscar no banco
      if (!targetInstanceName) {
        const activeConnection = await this.findActiveConnection();
        if (!activeConnection?.instanceName) {
          throw new Error("Nenhuma conexão ativa encontrada");
        }
        targetInstanceName = activeConnection.instanceName;
      }
      
      console.log("Obtendo conversas Evolution API:", targetInstanceName);
      
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Nenhuma configuração ativa encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      
      return await evolutionApi.getChats(targetInstanceName);
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
