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
  
  connectEvolution: async (apiKey: string, instanceId: string, instanceName: string, webhookUrl?: string, serverUrl?: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error("Não autenticado");
    }
    
    try {
      // Configurar credenciais da Evolution API
      const baseUrl = serverUrl || "https://api.evolution.com"; // URL padrão se não fornecida
      evolutionApi.setCredentials(baseUrl, apiKey);
      
      // Criar instância se não existir
      let instanceData;
      try {
        instanceData = await evolutionApi.createInstance(instanceName, webhookUrl);
      } catch (error) {
        // Se a instância já existe, tentar conectar
        console.log("Instância pode já existir, tentando conectar...");
      }
      
      // Conectar à instância (gerar QR code)
      const connectionResult = await evolutionApi.connectInstance(instanceName);
      
      // Salvar dados da conexão no Supabase
      const { error: dbError } = await supabase
        .from("whatsapp_connections")
        .upsert({
          user_id: session.user.id,
          status: connectionResult.qrcode ? "awaiting_scan" : "connected",
          provider: "evolution",
          config_data: {
            apiKey: `${apiKey.substring(0, 5)}...`,
            instanceId,
            instanceName,
            serverUrl: baseUrl,
            hasWebhook: !!webhookUrl
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
        instanceName,
        instanceId
      };
      
    } catch (error) {
      console.error("Erro na conexão Evolution:", error);
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

  // Novos métodos específicos para Evolution API
  checkEvolutionStatus: async (instanceName: string, serverUrl: string, apiKey: string) => {
    try {
      evolutionApi.setCredentials(serverUrl, apiKey);
      return await evolutionApi.getInstanceStatus(instanceName);
    } catch (error) {
      console.error("Erro ao verificar status Evolution:", error);
      throw error;
    }
  },

  getEvolutionQRCode: async (instanceName: string, serverUrl: string, apiKey: string) => {
    try {
      evolutionApi.setCredentials(serverUrl, apiKey);
      return await evolutionApi.getQRCode(instanceName);
    } catch (error) {
      console.error("Erro ao obter QR code Evolution:", error);
      throw error;
    }
  },

  getEvolutionChats: async (instanceName: string, serverUrl: string, apiKey: string) => {
    try {
      evolutionApi.setCredentials(serverUrl, apiKey);
      return await evolutionApi.getChats(instanceName);
    } catch (error) {
      console.error("Erro ao obter conversas Evolution:", error);
      throw error;
    }
  },

  getEvolutionMessages: async (instanceName: string, remoteJid: string, serverUrl: string, apiKey: string, limit: number = 50) => {
    try {
      evolutionApi.setCredentials(serverUrl, apiKey);
      return await evolutionApi.getMessages(instanceName, remoteJid, limit);
    } catch (error) {
      console.error("Erro ao obter mensagens Evolution:", error);
      throw error;
    }
  },

  sendEvolutionMessage: async (instanceName: string, remoteJid: string, message: string, serverUrl: string, apiKey: string) => {
    try {
      evolutionApi.setCredentials(serverUrl, apiKey);
      return await evolutionApi.sendMessage(instanceName, remoteJid, message);
    } catch (error) {
      console.error("Erro ao enviar mensagem Evolution:", error);
      throw error;
    }
  }
};
