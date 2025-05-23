
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId, withUserId, getUserProfiles } from "./auth-helpers";

// Interface para os dados do cliente
export interface ClientData {
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  group_id?: string;
  status?: string;
  notes?: string;
  profile_id?: string;
}

// Interface para os dados de tarefas do cliente
export interface ClientTaskData {
  client_id: string;
  title: string;
  description?: string;
  due_date?: string;
  status?: string;
}

// Adicionar um novo cliente com user_id e profile_id
export const addClient = async (clientData: ClientData) => {
  try {
    const dataWithUserId = await withUserId(clientData);
    if (!dataWithUserId) {
      throw new Error("Usuário não autenticado");
    }
    
    console.log("Adicionando cliente com user_id:", dataWithUserId.user_id);
    
    const { data, error } = await supabase
      .from("clients")
      .insert(dataWithUserId)
      .select();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error("Erro ao adicionar cliente:", error.message);
    return { success: false, error };
  }
};

// Adicionar tarefa para cliente com user_id
export const addClientTask = async (taskData: ClientTaskData) => {
  try {
    const dataWithUserId = await withUserId(taskData);
    if (!dataWithUserId) {
      throw new Error("Usuário não autenticado");
    }
    
    const { data, error } = await supabase
      .from("client_tasks")
      .insert(dataWithUserId)
      .select();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error("Erro ao adicionar tarefa:", error.message);
    return { success: false, error };
  }
};

// Buscar clientes do usuário atual - Agora considera perfis
export const fetchUserClients = async (profileId?: string) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      throw new Error("Usuário não autenticado");
    }
    
    console.log("Buscando clientes do usuário:", userId);
    
    let query = supabase.from("clients").select("*");
    
    if (profileId) {
      // Se tiver um profileId, busca os clientes desse perfil
      console.log("Filtrando por perfil:", profileId);
      query = query.eq("profile_id", profileId);
    } else {
      // Caso contrário, busca os clientes pessoais do usuário ou de qualquer perfil que ele tenha acesso
      const userProfiles = await getUserProfiles();
      if (userProfiles && userProfiles.length > 0) {
        const profileIds = userProfiles.map(profile => profile.id);
        console.log("Filtrando pelos perfis:", profileIds);
        
        // Busca os clientes pessoais ou de qualquer perfil do usuário
        query = query.or(`user_id.eq.${userId},profile_id.in.(${profileIds.join(',')})`);
      } else {
        // Se não encontrar perfis, busca apenas os clientes pessoais
        query = query.eq("user_id", userId);
      }
    }
    
    // Ordenar por nome
    const { data, error } = await query.order("name");

    if (error) throw error;
    
    console.log(`Encontrados ${data?.length || 0} clientes`);
    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error("Erro ao buscar clientes:", error.message);
    return { success: false, error, data: [] };
  }
};

// Buscar tarefas de um cliente específico
export const fetchClientTasks = async (clientId: string) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      throw new Error("Usuário não autenticado");
    }
    
    const { data, error } = await supabase
      .from("client_tasks")
      .select("*")
      .eq("client_id", clientId)
      .eq("user_id", userId) // Filtrar por user_id também
      .order("created_at", { ascending: false });

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error("Erro ao buscar tarefas do cliente:", error.message);
    return { success: false, error, data: [] };
  }
};

// Atualizar status de tarefa
export const updateClientTaskStatus = async (taskId: string, newStatus: string) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      throw new Error("Usuário não autenticado");
    }
    
    const { data, error } = await supabase
      .from("client_tasks")
      .update({ status: newStatus })
      .eq("id", taskId)
      .eq("user_id", userId) // Garantir que a tarefa pertence ao usuário
      .select();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error("Erro ao atualizar status da tarefa:", error.message);
    return { success: false, error };
  }
};

// Excluir tarefa
export const deleteClientTask = async (taskId: string) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      throw new Error("Usuário não autenticado");
    }
    
    const { error } = await supabase
      .from("client_tasks")
      .delete()
      .eq("id", taskId)
      .eq("user_id", userId); // Garantir que a tarefa pertence ao usuário

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error("Erro ao excluir tarefa:", error.message);
    return { success: false, error };
  }
};
