
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId, withUserId } from "./auth-helpers";

// Interface para os dados do cliente
export interface ClientData {
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  group_id?: string;
  status?: string;
  notes?: string;
}

// Interface para os dados de tarefas do cliente
export interface ClientTaskData {
  client_id: string;
  title: string;
  description?: string;
  due_date?: string;
  status?: string;
}

// Adicionar um novo cliente com user_id
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

// Buscar clientes do usuário atual - CORRIGIDO para filtrar por user_id
export const fetchUserClients = async () => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      throw new Error("Usuário não autenticado");
    }
    
    console.log("Buscando clientes do usuário:", userId);
    
    // Importante: Adicionar filtro por user_id para garantir isolamento dos dados
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .eq("user_id", userId) // Certifica que apenas clientes do usuário atual são retornados
      .order("name");

    if (error) throw error;
    
    console.log(`Encontrados ${data?.length || 0} clientes para o usuário ${userId}`);
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
