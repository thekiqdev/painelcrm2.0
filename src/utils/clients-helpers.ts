
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

// Buscar clientes do usuário atual
export const fetchUserClients = async () => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      throw new Error("Usuário não autenticado");
    }
    
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .eq("user_id", userId)
      .order("name");

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error("Erro ao buscar clientes:", error.message);
    return { success: false, error, data: [] };
  }
};

// Buscar tarefas de um cliente específico
export const fetchClientTasks = async (clientId: string) => {
  try {
    const { data, error } = await supabase
      .from("client_tasks")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error("Erro ao buscar tarefas do cliente:", error.message);
    return { success: false, error, data: [] };
  }
};
