
import { supabase } from '@/integrations/supabase/client';

export async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      console.error('Erro ao obter usuário:', error);
      return null;
    }
    console.log('Current user ID:', user.id);
    return user.id;
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
  const { data: { session } } = await supabase.auth.getSession();
  return !!session;
}

// Função para obter os detalhes do perfil do usuário atual
export async function getCurrentUserProfile() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return null;
    
    console.log('Getting profile for user:', userId);
    
    // Primeira tentativa - buscar o perfil existente
    let { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
      
    if (error) {
      console.error('Erro ao obter perfil do usuário:', error);
      
      // Se o erro for que o perfil não existe, tentamos criá-lo
      if (error.code === 'PGRST116') {
        console.log('Profile not found for user:', userId, 'creating new profile');
        
        const { data: userData } = await supabase.auth.getUser();
        const userMeta = userData.user?.user_metadata || {};
        
        // Perfil não existe, vamos criá-lo
        const { data: newProfile, error: insertError } = await supabase
          .from('profiles')
          .insert({ 
            id: userId,
            whatsapp_number: userMeta.whatsapp_number || 'temporário', // Valor temporário
            registration_complete: false,
            first_name: userMeta.name || '',
            last_name: userMeta.lastName || ''
          })
          .select()
          .single();
        
        if (insertError) {
          console.error('Erro ao criar perfil do usuário:', insertError);
          return null;
        }
        
        console.log('New profile created:', newProfile);
        return newProfile;
      }
      
      return null;
    }
    
    console.log('Existing profile found:', data);
    return data;
  } catch (error) {
    console.error('Erro ao obter perfil do usuário:', error);
    return null;
  }
}

// Função para buscar os perfis disponíveis para o usuário
export async function getUserProfiles() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return [];
    
    // Busca os perfis onde o usuário é dono
    const { data: ownedProfiles, error: ownedError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('owner_id', userId);
      
    if (ownedError) {
      console.error('Erro ao buscar perfis do usuário:', ownedError);
      return [];
    }
    
    // Busca os perfis onde o usuário é membro
    const { data: memberProfiles, error: memberError } = await supabase
      .from('profile_members')
      .select('profile_id, user_profiles(*)')
      .eq('user_id', userId);
      
    if (memberError) {
      console.error('Erro ao buscar associações de perfis:', memberError);
      return ownedProfiles || [];
    }
    
    // Combina os resultados (perfis próprios + perfis onde é membro)
    const memberProfilesData = memberProfiles?.map(item => item.user_profiles) || [];
    const allProfiles = [...(ownedProfiles || []), ...memberProfilesData];
    
    return allProfiles;
  } catch (error) {
    console.error('Erro ao obter perfis do usuário:', error);
    return [];
  }
}

// Função para verificar se o usuário tem uma determinada permissão em um perfil
export async function checkPermission(profileId: string, permission: string): Promise<boolean> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return false;
    
    // Verifica se o usuário é o dono do perfil
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('owner_id')
      .eq('id', profileId)
      .single();
      
    if (profile && profile.owner_id === userId) {
      return true; // O dono tem todas as permissões
    }
    
    // Verifica se o usuário tem a permissão específica
    const { data, error } = await supabase
      .from('user_permissions')
      .select('*')
      .eq('profile_id', profileId)
      .eq('user_id', userId)
      .or(`permission.eq.all_access,permission.eq.${permission}`);
      
    if (error) {
      console.error('Erro ao verificar permissão:', error);
      return false;
    }
    
    return data && data.length > 0;
  } catch (error) {
    console.error('Erro ao verificar permissão:', error);
    return false;
  }
}

// Função para limpar o estado da sessão
export async function clearAuthState() {
  try {
    // Limpar armazenamento local relacionado à autenticação
    localStorage.removeItem('supabase.auth.token');
    
    // Outras limpezas específicas se necessário
    console.log('Auth state cleared');
    
    return true;
  } catch (error) {
    console.error('Erro ao limpar estado de autenticação:', error);
    return false;
  }
}
