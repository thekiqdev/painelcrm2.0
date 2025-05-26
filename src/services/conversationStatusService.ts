
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
      if (!user) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase.rpc('get_conversation_status', {
        p_user_id: user.id,
        p_connection_id: connectionId,
        p_remote_jid: remoteJid
      });

      if (error) {
        console.error("Erro ao obter status da conversa:", error);
        return null;
      }
      
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
      if (!user) throw new Error("Usuário não autenticado");

      const now = new Date().toISOString();
      const attendedAt = status === 'active' ? now : null;

      const { data, error } = await supabase.rpc('upsert_conversation_status', {
        p_user_id: user.id,
        p_connection_id: connectionId,
        p_remote_jid: remoteJid,
        p_status: status,
        p_attendant_id: status === 'active' ? user.id : null,
        p_attended_at: attendedAt,
        p_updated_at: now
      });

      if (error) {
        console.error("Erro ao atualizar status da conversa:", error);
        return null;
      }
      
      return data?.[0] || null;
    } catch (error) {
      console.error("Erro ao atualizar status da conversa:", error);
      return null;
    }
  },

  async getAllConversationStatuses(connectionId: string): Promise<Record<string, ConversationAttendance>> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase.rpc('get_all_conversation_statuses', {
        p_user_id: user.id,
        p_connection_id: connectionId
      });

      if (error) {
        console.error("Erro ao obter todos os status de conversas:", error);
        return {};
      }

      const statusMap: Record<string, ConversationAttendance> = {};
      data?.forEach((attendance: ConversationAttendance) => {
        statusMap[attendance.remote_jid] = attendance;
      });

      return statusMap;
    } catch (error) {
      console.error("Erro ao obter todos os status de conversas:", error);
      return {};
    }
  }
};
