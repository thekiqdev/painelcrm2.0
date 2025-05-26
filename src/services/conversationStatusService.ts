
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

// Tipo para dados vindos do Supabase
interface SupabaseConversationAttendance {
  id: string;
  user_id: string;
  connection_id: string;
  remote_jid: string;
  status: string; // Supabase retorna como string genérica
  attendant_id?: string;
  attended_at?: string;
  created_at: string;
  updated_at: string;
}

// Função para converter dados do Supabase para o tipo correto
const convertToConversationAttendance = (data: SupabaseConversationAttendance): ConversationAttendance => {
  const validStatuses: ('pending' | 'active' | 'closed')[] = ['pending', 'active', 'closed'];
  const status = validStatuses.includes(data.status as any) ? data.status as 'pending' | 'active' | 'closed' : 'pending';
  
  return {
    ...data,
    status
  };
};

export const conversationStatusService = {
  async getConversationStatus(connectionId: string, remoteJid: string): Promise<ConversationAttendance | null> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error("Usuário não autenticado ao buscar status da conversa");
        throw new Error("Usuário não autenticado");
      }

      console.log("Buscando status da conversa:", { userId: user.id, connectionId, remoteJid });

      const { data, error } = await supabase
        .from('conversation_attendances')
        .select('*')
        .eq('user_id', user.id)
        .eq('connection_id', connectionId)
        .eq('remote_jid', remoteJid)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Nenhum registro encontrado
          console.log("Nenhum status de conversa encontrado");
          return null;
        }
        console.error("Erro ao buscar status da conversa:", error);
        return null;
      }
      
      console.log("Status da conversa encontrado:", data);
      return data ? convertToConversationAttendance(data) : null;
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

      const { data, error } = await supabase
        .from('conversation_attendances')
        .upsert({
          user_id: user.id,
          connection_id: connectionId,
          remote_jid: remoteJid,
          status: status,
          attendant_id: status === 'active' ? user.id : null,
          attended_at: attendedAt,
          updated_at: now
        }, {
          onConflict: 'user_id,connection_id,remote_jid'
        })
        .select()
        .single();

      if (error) {
        console.error("Erro ao atualizar status da conversa:", error);
        console.error("Detalhes do erro:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw new Error(`Erro ao atualizar status: ${error.message}`);
      }
      
      console.log("Status da conversa atualizado com sucesso:", data);
      return data ? convertToConversationAttendance(data) : null;
    } catch (error) {
      console.error("Erro ao atualizar status da conversa:", error);
      throw error;
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

      const { data, error } = await supabase
        .from('conversation_attendances')
        .select('*')
        .eq('user_id', user.id)
        .eq('connection_id', connectionId);

      if (error) {
        console.error("Erro ao buscar status de conversas:", error);
        return {};
      }

      const statusMap: Record<string, ConversationAttendance> = {};
      if (Array.isArray(data)) {
        data.forEach((attendance: SupabaseConversationAttendance) => {
          statusMap[attendance.remote_jid] = convertToConversationAttendance(attendance);
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
