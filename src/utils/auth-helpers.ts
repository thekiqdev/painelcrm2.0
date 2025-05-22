
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
    return null;
  }
  return { ...data, user_id: userId };
}
