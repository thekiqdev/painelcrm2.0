
import { apiClient } from '@/integrations/api/client';

export async function getCurrentUserId(): Promise<string | null> {
  try {
    const response = await apiClient.get<{ id: string }>('/api/auth/me');
    if (response.error || !response.data) {
      console.error('Erro ao obter usuário:', response.error);
      return null;
    }
    console.log('Current user ID:', response.data.id);
    return response.data.id;
  } catch (error) {
    console.error('Erro ao obter usuário:', error);
    return null;
  }
}

// Função para incluir o user_id nos dados enviados para o Supabase
export async function withUserId<T extends object>(data: T): Promise<T & { user_id: string } | null> {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error('Usuário não autenticado: não foi possível adicionar user_id aos dados');
    return null;
  }
  return { ...data, user_id: userId };
}

// Função para verificar se o usuário está autenticado
export async function isAuthenticated(): Promise<boolean> {
  const token = apiClient.getToken();
  if (!token) return false;
  
  // Verify token by making a request
  const response = await apiClient.get('/api/auth/me');
  return !response.error && !!response.data;
}

// Função para obter os detalhes do perfil do usuário atual
export async function getCurrentUserProfile() {
  try {
    console.log('Getting profile for current user');
    
    const response = await apiClient.get('/api/auth/me');
    
    if (response.error || !response.data) {
      console.error('Erro ao obter perfil do usuário:', response.error);
      return null;
    }
    
    console.log('Profile found:', response.data);
    return response.data;
  } catch (error) {
    console.error('Erro ao obter perfil do usuário:', error);
    return null;
  }
}

// Função para buscar os perfis disponíveis para o usuário
export async function getUserProfiles() {
  try {
    const response = await apiClient.get('/api/user-profiles');
    
    if (response.error) {
      console.error('Erro ao buscar perfis do usuário:', response.error);
      return [];
    }
    
    return response.data || [];
  } catch (error) {
    console.error('Erro ao obter perfis do usuário:', error);
    return [];
  }
}

// Função para verificar se o usuário tem uma determinada permissão em um perfil
export async function checkPermission(profileId: string, permission: string): Promise<boolean> {
  try {
    const response = await apiClient.get<{ hasPermission: boolean }>(
      `/api/user-profiles/${profileId}/permissions/${permission}`
    );
    
    if (response.error) {
      console.error('Erro ao verificar permissão:', response.error);
      return false;
    }
    
    return response.data?.hasPermission || false;
  } catch (error) {
    console.error('Erro ao verificar permissão:', error);
    return false;
  }
}

// Função para limpar o estado da sessão
export async function clearAuthState() {
  try {
    // Limpar armazenamento local relacionado à autenticação
    localStorage.removeItem('auth_token');
    apiClient.setToken(null);
    
    // Outras limpezas específicas se necessário
    console.log('Auth state cleared');
    
    return true;
  } catch (error) {
    console.error('Erro ao limpar estado de autenticação:', error);
    return false;
  }
}
