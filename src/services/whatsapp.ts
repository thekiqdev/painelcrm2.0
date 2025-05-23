
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
      
      // Configurar credenciais da Evolution API
      evolutionApi.setCredentials(config.api_url, config.global_key);
      
      // Criar instância se não existir
      try {
        await evolutionApi.createInstance(instanceName);
        console.log("Instância criada com sucesso:", instanceName);
      } catch (error) {
        // Se a instância já existe, apenas log
        console.log("Instância pode já existir, tentando conectar...");
      }
      
      // Conectar à instância (gerar QR code)
      const connectionResult = await evolutionApi.connectInstance(instanceName);
      
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
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Nenhuma configuração ativa encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      return await evolutionApi.getInstanceStatus(instanceName);
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
