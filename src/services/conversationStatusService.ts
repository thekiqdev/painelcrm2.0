
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

      const { data, error } = await supabase
        .from('conversation_attendances')
        .select('*')
        .eq('user_id', user.id)
        .eq('connection_id', connectionId)
        .eq('remote_jid', remoteJid)
        .maybeSingle();

      if (error) throw error;
      return data;
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

      const { data, error } = await supabase
        .from('conversation_attendances')
        .upsert({
          user_id: user.id,
          connection_id: connectionId,
          remote_jid: remoteJid,
          status,
          attendant_id: status === 'active' ? user.id : null,
          attended_at: attendedAt,
          updated_at: now
        }, {
          onConflict: 'user_id,connection_id,remote_jid'
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Erro ao atualizar status da conversa:", error);
      return null;
    }
  },

  async getAllConversationStatuses(connectionId: string): Promise<Record<string, ConversationAttendance>> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase
        .from('conversation_attendances')
        .select('*')
        .eq('user_id', user.id)
        .eq('connection_id', connectionId);

      if (error) throw error;

      const statusMap: Record<string, ConversationAttendance> = {};
      data?.forEach(attendance => {
        statusMap[attendance.remote_jid] = attendance;
      });

      return statusMap;
    } catch (error) {
      console.error("Erro ao obter todos os status de conversas:", error);
      return {};
    }
  }
};
