
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
      const error = await response.json();
      throw new Error(error.error || "Falha ao conectar WhatsApp");
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
      const error = await response.json();
      throw new Error(error.error || "Falha ao desconectar WhatsApp");
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
      const error = await response.json();
      throw new Error(error.error || "Falha ao obter status do WhatsApp");
    }
    
    return await response.json();
  }
};
