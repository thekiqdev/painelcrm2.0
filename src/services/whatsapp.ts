import { supabase } from "@/integrations/supabase/client";
import { evolutionApi } from "./evolutionApi";

export const whatsappService = {
  connectEvolution: async (instanceName: string) => {
    try {
      // Obter a configuração ativa da Evolution API
      const config = await evolutionApi.getActiveConfig();
      if (!config) {
        throw new Error("Nenhuma configuração da Evolution API encontrada. Configure primeiro em Configurações.");
      }
      
      console.log("Using Evolution API config:", {
        url: config.api_url,
        key: `${config.global_key.substring(0, 3)}...`,
        instanceName
      });
      
      // Configurar credenciais da Evolution API
      evolutionApi.setCredentials(config.api_url, config.global_key);
      
      // Primeiro, verificar se a instância já existe
      console.log("Checking if instance exists:", instanceName);
      let instanceExists = false;
      
      try {
        const status = await evolutionApi.getInstanceStatus(instanceName);
        console.log("Instance already exists with status:", status);
        instanceExists = true;
      } catch (error) {
        console.log("Instance does not exist, will create new one");
        instanceExists = false;
      }
      
      // Criar instância apenas se não existir
      if (!instanceExists) {
        console.log("Creating new instance:", instanceName);
        try {
          const createResult = await evolutionApi.createInstance(instanceName);
          console.log("Instance creation result:", createResult);
          
          // Aguardar um pouco para garantir que a instância foi criada
          console.log("Waiting for instance to be ready...");
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Verificar se a instância foi criada com sucesso
          let retries = 0;
          const maxRetries = 5;
          
          while (retries < maxRetries) {
            try {
              const verifyStatus = await evolutionApi.getInstanceStatus(instanceName);
              console.log(`Instance verification attempt ${retries + 1}:`, verifyStatus);
              break;
            } catch (verifyError) {
              retries++;
              console.log(`Instance verification failed, attempt ${retries}/${maxRetries}`);
              if (retries < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 2000));
              } else {
                throw new Error(`Falha ao verificar se a instância ${instanceName} foi criada após ${maxRetries} tentativas`);
              }
            }
          }
        } catch (createError) {
          console.error("Error creating instance:", createError);
          throw new Error(`Falha ao criar instância: ${createError instanceof Error ? createError.message : 'Erro desconhecido'}`);
        }
      }
      
      // Agora tentar conectar à instância
      console.log("Connecting to instance:", instanceName);
      const connectionResult = await evolutionApi.connectInstance(instanceName);
      console.log("Connection result:", connectionResult);
      
      // Salvar dados da conexão no Supabase
      const { error: dbError } = await supabase
        .from("whatsapp_connections")
        .upsert({
          user_id: (await supabase.auth.getUser()).data.user?.id,
          status: connectionResult.qrcode ? "awaiting_scan" : "connected",
          provider: "evolution",
          config_data: {
            instanceName,
            serverUrl: config.api_url,
          },
          qr_code: connectionResult.qrcode?.base64 || null,
          updated_at: new Date().toISOString()
        });
      
      if (dbError) {
        console.error("Erro ao salvar no banco:", dbError);
      }
      
      return {
        status: connectionResult.qrcode ? "connecting" : "connected",
        qrCode: connectionResult.qrcode?.base64,
        provider: "evolution",
        instanceName
      };
      
    } catch (error) {
      console.error("Erro na conexão Evolution:", error);
      throw error;
    }
  },
  
  disconnectEvolution: async (instanceName: string) => {
    try {
      const config = await evolutionApi.getActiveConfig();
      if (!config) {
        throw new Error("Nenhuma configuração da Evolution API encontrada.");
      }
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      
      try {
        // Tente fazer logout da instância
        await evolutionApi.logoutInstance(instanceName);
      } catch (error) {
        console.warn("Erro ao fazer logout da instância:", error);
        // Continue mesmo se houver erro no logout
      }
      
      // Atualize o status no banco de dados
      const { error: dbError } = await supabase
        .from("whatsapp_connections")
        .update({
          status: "disconnected",
          updated_at: new Date().toISOString()
        })
        .eq("user_id", (await supabase.auth.getUser()).data.user?.id);
      
      if (dbError) {
        console.error("Erro ao atualizar status no banco:", dbError);
      }
      
      return { success: true };
    } catch (error) {
      console.error("Erro ao desconectar Evolution:", error);
      throw error;
    }
  },
  
  confirmEvolutionConnection: async (instanceName: string) => {
    try {
      // Atualize o status no banco de dados
      const { error: dbError } = await supabase
        .from("whatsapp_connections")
        .update({
          status: "connected",
          updated_at: new Date().toISOString()
        })
        .eq("user_id", (await supabase.auth.getUser()).data.user?.id);
      
      if (dbError) {
        console.error("Erro ao atualizar status no banco:", dbError);
      }
      
      return { success: true };
    } catch (error) {
      console.error("Erro ao confirmar conexão Evolution:", error);
      throw error;
    }
  },
  
  // Verificar status da instância Evolution
  checkEvolutionStatus: async (instanceName: string) => {
    try {
      console.log("Checking status for instance:", instanceName);
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Nenhuma configuração ativa encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      const status = await evolutionApi.getInstanceStatus(instanceName);
      console.log("Instance status:", status);
      return status;
    } catch (error) {
      console.error("Erro ao verificar status Evolution:", error);
      throw error;
    }
  },

  getEvolutionQRCode: async (instanceName: string) => {
    try {
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Nenhuma configuração ativa encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      return await evolutionApi.getQRCode(instanceName);
    } catch (error) {
      console.error("Erro ao obter QR code Evolution:", error);
      throw error;
    }
  },

  listEvolutionInstances: async () => {
    try {
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Nenhuma configuração ativa encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      return await evolutionApi.listInstances();
    } catch (error) {
      console.error("Erro ao listar instâncias Evolution:", error);
      throw error;
    }
  },

  getEvolutionChats: async (instanceName: string) => {
    try {
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Nenhuma configuração ativa encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      return await evolutionApi.getChats(instanceName);
    } catch (error) {
      console.error("Erro ao obter conversas Evolution:", error);
      throw error;
    }
  },

  getEvolutionMessages: async (instanceName: string, remoteJid: string, limit: number = 50) => {
    try {
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Nenhuma configuração ativa encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      return await evolutionApi.getMessages(instanceName, remoteJid, limit);
    } catch (error) {
      console.error("Erro ao obter mensagens Evolution:", error);
      throw error;
    }
  },

  sendEvolutionMessage: async (instanceName: string, remoteJid: string, message: string) => {
    try {
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Nenhuma configuração ativa encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      return await evolutionApi.sendMessage(instanceName, remoteJid, message);
    } catch (error) {
      console.error("Erro ao enviar mensagem Evolution:", error);
      throw error;
    }
  }
};
