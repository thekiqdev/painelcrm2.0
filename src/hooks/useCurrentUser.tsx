
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';

export function useCurrentUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Obter o usuário atual
    const getUser = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) {
          console.error('Erro ao obter usuário:', error);
          setUser(null);
        } else {
          setUser(user);
        }
      } catch (error) {
        console.error('Erro ao obter usuário:', error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    getUser();

    // Inscrever-se para mudanças no estado de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_, session) => {
        setUser(session?.user ?? null);
      }
    );

    // Limpar inscrição quando o componente for desmontado
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}
