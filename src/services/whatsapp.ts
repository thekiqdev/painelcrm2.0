
import { supabase } from "@/integrations/supabase/client";

export const whatsappService = {
  connect: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error("Não autenticado");
    }
    
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-connection/connect`, {
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
        throw new Error(error.error || "Falha ao conectar WhatsApp");
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
  }
};
