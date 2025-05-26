
import { supabase } from "@/integrations/supabase/client";
import { evolutionApi } from "../evolutionApi";

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
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          throw new Error("Usuário não autenticado");
        }
        
        const { error: dbError } = await supabase
          .from("whatsapp_connections")
          .upsert({
            user_id: user.id,
            status: "awaiting_scan",
            qr_code: result.qrcode,
            updated_at: new Date().toISOString()
          });
        
        if (dbError) {
          console.error("Erro ao salvar no banco:", dbError);
        }
        
        return {
          success: true,
          qrCode: result.qrcode,
          status: "awaiting_scan"
        };
      } else {
        try {
          const status = await evolutionApi.getInstanceStatus(instanceName);
          if (status?.instance?.state === "open") {
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
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          throw new Error("Usuário não autenticado");
        }
        
        const { error: dbError } = await supabase
          .from("whatsapp_connections")
          .upsert({
            user_id: user.id,
            status: "awaiting_scan",
            qr_code: qrResult.qrcode.base64,
            updated_at: new Date().toISOString()
          });
        
        if (dbError) {
          console.error("Erro ao salvar no banco:", dbError);
        }
        
        return {
          success: true,
          qrCode: qrResult.qrcode.base64,
          status: "awaiting_scan"
        };
      } else {
        const status = await evolutionApi.getInstanceStatus(instanceName);
        if (status?.instance?.state === "open") {
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
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          throw new Error("Usuário não autenticado");
        }
        
        const { error: dbError } = await supabase
          .from("whatsapp_connections")
          .upsert({
            user_id: user.id,
            status: "connected",
            qr_code: null,
            updated_at: new Date().toISOString()
          });
        
        if (dbError) {
          console.error("Erro ao atualizar no banco:", dbError);
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
      
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (!userError && user) {
          await supabase
            .from("whatsapp_connections")
            .delete()
            .eq("user_id", user.id);
        }
      } catch (authError) {
        console.log("Usuário não autenticado, pulando remoção do banco");
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
      
      // Procurar por uma instância conectada
      for (const instance of instances) {
        try {
          const status = await evolutionApi.getInstanceStatus(instance.instanceName);
          if (status?.instance?.state === "open") {
            console.log(`Instância conectada encontrada: ${instance.instanceName}`);
            return instance.instanceName;
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
  }
};
