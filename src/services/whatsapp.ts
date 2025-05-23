import { supabase } from "@/integrations/supabase/client";
import { evolutionApi } from "./evolutionApi";

export const whatsappService = {
  connect: async (options?: { provider?: string, apiKey?: string, instanceId?: string }) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error("Não autenticado");
    }
    
    let endpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-connection/connect`;
    
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${session.access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(options || {})
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error response:", errorText);
      try {
        const error = JSON.parse(errorText);
        throw new Error(error.error || "Falha ao conectar WhatsApp");
      } catch (e) {
        throw new Error("Falha ao conectar WhatsApp: " + errorText.substring(0, 100));
      }
    }
    
    return await response.json();
  },
  
  // Método específico para Evolution API - Passo 1: Criar instância
  createEvolutionInstance: async (instanceName: string, webhookUrl?: string) => {
    try {
      console.log("Passo 1: Criando instância Evolution API:", instanceName);
      
      const config = await evolutionApi.getActiveConfig();
      if (!config) {
        throw new Error("Nenhuma configuração encontrada. Configure primeiro em Configurações > Configuração API.");
      }
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      
      // Criar instância
      const instanceData = await evolutionApi.createInstance(instanceName, webhookUrl);
      console.log("Instância criada com sucesso:", instanceData);
      
      return {
        success: true,
        instanceName,
        instanceData
      };
      
    } catch (error) {
      console.error("Erro ao criar instância Evolution:", error);
      throw error;
    }
  },

  // Método específico para Evolution API - Passo 2: Obter QR Code
  getEvolutionQRCode: async (instanceName: string) => {
    try {
      console.log("Passo 2: Obtendo QR Code para instância:", instanceName);
      
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Nenhuma configuração ativa encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      
      // Primeiro tenta conectar para gerar QR code
      const connectionResult = await evolutionApi.connectInstance(instanceName);
      console.log("Resultado da conexão:", connectionResult);
      
      if (connectionResult.qrcode?.base64) {
        console.log("QR Code obtido com sucesso");
        
        // Salvar no banco de dados
        const { error: dbError } = await supabase
          .from("whatsapp_connections")
          .upsert({
            user_id: (await supabase.auth.getUser()).data.user?.id,
            status: "awaiting_scan",
            provider: "evolution",
            config_data: {
              instanceName,
              serverUrl: config.api_url,
            },
            qr_code: connectionResult.qrcode.base64,
            updated_at: new Date().toISOString()
          });
        
        if (dbError) {
          console.error("Erro ao salvar no banco:", dbError);
        }
        
        return {
          success: true,
          qrCode: connectionResult.qrcode.base64,
          status: "awaiting_scan"
        };
      } else {
        // Se não há QR code, talvez já esteja conectado
        const status = await evolutionApi.getInstanceStatus(instanceName);
        if (status.instance.state === "open") {
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

  // Método específico para Evolution API - Passo 3: Verificar conexão
  checkEvolutionConnection: async (instanceName: string) => {
    try {
      console.log("Passo 3: Verificando status da conexão:", instanceName);
      
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Nenhuma configuração ativa encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      
      const status = await evolutionApi.getInstanceStatus(instanceName);
      console.log("Status da instância:", status);
      
      if (status.instance.state === "open") {
        // Conexão estabelecida com sucesso
        const { error: dbError } = await supabase
          .from("whatsapp_connections")
          .upsert({
            user_id: (await supabase.auth.getUser()).data.user?.id,
            status: "connected",
            provider: "evolution",
            config_data: {
              instanceName,
              serverUrl: config.api_url,
            },
            qr_code: null, // Remove QR code após conexão
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
          status: status.instance.state
        };
      }
      
    } catch (error) {
      console.error("Erro ao verificar conexão Evolution:", error);
      throw error;
    }
  },

  // Método para obter conversas da Evolution API
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

  // Método para obter mensagens da Evolution API
  getEvolutionMessages: async (instanceName: string, remoteJid: string) => {
    try {
      const config = await evolutionApi.getActiveConfig();
      if (!config) throw new Error("Nenhuma configuração ativa encontrada");
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      return await evolutionApi.getMessages(instanceName, remoteJid);
    } catch (error) {
      console.error("Erro ao obter mensagens Evolution:", error);
      throw error;
    }
  },

  // Método para enviar mensagem via Evolution API
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
  },
  
  connectWebJS: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error("Não autenticado");
    }
    
    // Endpoint para conexão usando whatsapp-web.js
    const endpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-connection/connect-webjs`;
    
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${session.access_token}`,
        "Content-Type": "application/json"
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error response:", errorText);
      try {
        const error = JSON.parse(errorText);
        throw new Error(error.error || "Falha ao conectar WhatsApp via Web.js");
      } catch (e) {
        throw new Error("Falha ao conectar WhatsApp: " + errorText.substring(0, 100));
      }
    }
    
    return await response.json();
  },
  
  disconnect: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error("Não autenticado");
    }
    
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-connection/disconnect`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${session.access_token}`,
        "Content-Type": "application/json"
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error response:", errorText);
      try {
        const error = JSON.parse(errorText);
        throw new Error(error.error || "Falha ao desconectar WhatsApp");
      } catch (e) {
        throw new Error("Falha ao desconectar WhatsApp: " + errorText.substring(0, 100));
      }
    }
    
    return await response.json();
  },
  
  confirmConnection: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error("Não autenticado");
    }
    
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-connection/confirm`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${session.access_token}`,
        "Content-Type": "application/json"
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error response:", errorText);
      try {
        const error = JSON.parse(errorText);
        throw new Error(error.error || "Falha ao confirmar conexão WhatsApp");
      } catch (e) {
        throw new Error("Falha ao confirmar conexão WhatsApp: " + errorText.substring(0, 100));
      }
    }
    
    return await response.json();
  },
  
  getStatus: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error("Não autenticado");
    }
    
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-connection/status`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${session.access_token}`,
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error response:", errorText);
      try {
        const error = JSON.parse(errorText);
        throw new Error(error.error || "Falha ao obter status do WhatsApp");
      } catch (e) {
        throw new Error("Falha ao obter status do WhatsApp: " + errorText.substring(0, 100));
      }
    }
    
    return await response.json();
  },
  // Método para deletar instância Evolution API
  deleteEvolutionInstance: async (instanceName: string) => {
    try {
      console.log("Deletando instância Evolution API:", instanceName);
      
      const config = await evolutionApi.getActiveConfig();
      if (!config) {
        throw new Error("Nenhuma configuração ativa encontrada");
      }
      
      evolutionApi.setCredentials(config.api_url, config.global_key);
      
      // Deletar instância na API Evolution
      await evolutionApi.deleteInstance(instanceName);
      
      // Remover do banco de dados local
      const { error: dbError } = await supabase
        .from("whatsapp_connections")
        .delete()
        .eq("config_data->>instanceName", instanceName)
        .eq("user_id", (await supabase.auth.getUser()).data.user?.id);
      
      if (dbError) {
        console.error("Erro ao remover do banco:", dbError);
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
};
