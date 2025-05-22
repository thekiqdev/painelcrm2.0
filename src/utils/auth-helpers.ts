
// Mantemos o mesmo arquivo, mas vamos garantir que ele está fazendo seu trabalho corretamente
import { supabase } from '@/integrations/supabase/client';

export async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      console.error('Erro ao obter usuário:', error);
      return null;
    }
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
    
    // Primeira tentativa - buscar o perfil existente
    let { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
      
    // Se não encontrou perfil, cria um novo
    if (error && error.code === 'PGRST116') {
      // Perfil não existe, vamos criá-lo
      const { error: insertError } = await supabase
        .from('profiles')
        .insert({ 
          id: userId,
          whatsapp_number: 'temporário', // Valor temporário para satisfazer a restrição de não-nulo
          registration_complete: false 
        });
      
      if (insertError) {
        console.error('Erro ao criar perfil do usuário:', insertError);
        return null;
      }
      
      // Busca o perfil recém-criado
      const { data: newProfile, error: newError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
        
      if (newError) {
        console.error('Erro ao obter perfil do usuário após criação:', newError);
        return null;
      }
      
      return newProfile;
    } else if (error) {
      console.error('Erro ao obter perfil do usuário:', error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Erro ao obter perfil do usuário:', error);
    return null;
  }
}
