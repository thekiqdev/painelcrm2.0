
import { supabase } from "@/integrations/supabase/client";

export interface ConversationAttendance {
  id: string;
  user_id: string;
  connection_id: string;
  remote_jid: string;
  status: 'pending' | 'active' | 'closed';
  attendant_id?: string;
  attended_at?: string;
  created_at: string;
  updated_at: string;
}

export const conversationStatusService = {
  async getConversationStatus(connectionId: string, remoteJid: string): Promise<ConversationAttendance | null> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error("Usuário não autenticado ao buscar status da conversa");
        throw new Error("Usuário não autenticado");
      }

      console.log("Buscando status da conversa:", { userId: user.id, connectionId, remoteJid });

      const { data, error } = await (supabase as any).rpc('get_conversation_status', {
        p_user_id: user.id,
        p_connection_id: connectionId,
        p_remote_jid: remoteJid
      });

      if (error) {
        console.error("Erro na função get_conversation_status:", error);
        return null;
      }
      
      console.log("Status da conversa encontrado:", data);
      return data?.[0] || null;
    } catch (error) {
      console.error("Erro ao obter status da conversa:", error);
      return null;
    }
  },

  async updateConversationStatus(
    connectionId: string, 
    remoteJid: string, 
    status: 'pending' | 'active' | 'closed'
  ): Promise<ConversationAttendance | null> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error("Usuário não autenticado ao atualizar status da conversa");
        throw new Error("Usuário não autenticado");
      }

      const now = new Date().toISOString();
      const attendedAt = status === 'active' ? now : null;

      console.log("Atualizando status da conversa:", {
        userId: user.id,
        connectionId,
        remoteJid,
        status,
        attendantId: status === 'active' ? user.id : null,
        attendedAt,
        updatedAt: now
      });

      const { data, error } = await (supabase as any).rpc('upsert_conversation_status', {
        p_user_id: user.id,
        p_connection_id: connectionId,
        p_remote_jid: remoteJid,
        p_status: status,
        p_attendant_id: status === 'active' ? user.id : null,
        p_attended_at: attendedAt,
        p_updated_at: now
      });

      if (error) {
        console.error("Erro na função upsert_conversation_status:", error);
        console.error("Detalhes do erro:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw new Error(`Erro ao atualizar status: ${error.message}`);
      }
      
      console.log("Status da conversa atualizado com sucesso:", data);
      return data?.[0] || null;
    } catch (error) {
      console.error("Erro ao atualizar status da conversa:", error);
      throw error; // Re-throw para que o erro chegue até o componente
    }
  },

  async getAllConversationStatuses(connectionId: string): Promise<Record<string, ConversationAttendance>> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error("Usuário não autenticado ao buscar todos os status");
        throw new Error("Usuário não autenticado");
      }

      console.log("Buscando todos os status de conversas:", { userId: user.id, connectionId });

      const { data, error } = await (supabase as any).rpc('get_all_conversation_statuses', {
        p_user_id: user.id,
        p_connection_id: connectionId
      });

      if (error) {
        console.error("Erro na função get_all_conversation_statuses:", error);
        return {};
      }

      const statusMap: Record<string, ConversationAttendance> = {};
      if (Array.isArray(data)) {
        data.forEach((attendance: ConversationAttendance) => {
          statusMap[attendance.remote_jid] = attendance;
        });
      }

      console.log("Status de conversas carregados:", Object.keys(statusMap).length);
      return statusMap;
    } catch (error) {
      console.error("Erro ao obter todos os status de conversas:", error);
      return {};
    }
  }
};
