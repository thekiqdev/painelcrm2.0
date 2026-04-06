
import { apiClient } from "@/integrations/api/client";
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
  cpf_cnpj?: string | null;
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
    // Clean up the data - remove empty strings and convert to undefined
    const cleanData: any = {
      name: clientData.name,
    };
    
    if (clientData.email && clientData.email.trim()) cleanData.email = clientData.email.trim();
    if (clientData.phone && clientData.phone.trim()) cleanData.phone = clientData.phone.trim();
    if (clientData.company && clientData.company.trim()) cleanData.company = clientData.company.trim();
    if (clientData.status && clientData.status.trim()) cleanData.status = clientData.status.trim();
    if (clientData.notes && clientData.notes.trim()) cleanData.notes = clientData.notes.trim();
    if (clientData.group_id && clientData.group_id.trim()) cleanData.group_id = clientData.group_id;
    if (clientData.profile_id && clientData.profile_id.trim()) cleanData.profile_id = clientData.profile_id;
    if (clientData.cpf_cnpj != null && String(clientData.cpf_cnpj).trim()) {
      const digits = String(clientData.cpf_cnpj).replace(/\D/g, "").trim();
      if (digits.length > 0) cleanData.cpf_cnpj = digits;
    }
    
    const response = await apiClient.post("/api/clients", cleanData);
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    return { success: true, data: response.data };
  } catch (error: any) {
    console.error("Erro ao adicionar cliente:", error.message);
    return { success: false, error };
  }
};

// Adicionar tarefa para cliente com user_id
export const addClientTask = async (taskData: ClientTaskData) => {
  try {
    const response = await apiClient.post("/api/clients/tasks", taskData);
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    return { success: true, data: response.data };
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
    
    const url = profileId 
      ? `/api/clients?profileId=${profileId}`
      : '/api/clients';
    
    const response = await apiClient.get(url);
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    console.log(`Encontrados ${response.data?.length || 0} clientes`);
    return { success: true, data: response.data || [] };
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
    
    const response = await apiClient.get(`/api/clients/${clientId}/tasks`);
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    return { success: true, data: response.data || [] };
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
    
    const response = await apiClient.patch(`/api/clients/tasks/${taskId}`, { status: newStatus });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    return { success: true, data: response.data };
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
    
    const response = await apiClient.delete(`/api/clients/tasks/${taskId}`);
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    return { success: true };
  } catch (error: any) {
    console.error("Erro ao excluir tarefa:", error.message);
    return { success: false, error };
  }
};
