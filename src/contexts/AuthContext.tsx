
import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Session, User } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  profile: any | null;
  registrationComplete: boolean;
  signIn: (whatsapp: string, password: string) => Promise<void>;
  signUp: (whatsapp: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (data: any) => Promise<void>;
  updateRegistrationStep: (step: string, completed: boolean) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any | null>(null);
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Set up auth state listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Fetch user profile if logged in
        if (session?.user) {
          setTimeout(() => {
            fetchUserProfile(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setRegistrationComplete(false);
        }
      }
    );

    // Then check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchUserProfile(session.user.id);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching user profile:', error);
        setProfile(null);
        setRegistrationComplete(false);
        return;
      }

      setProfile(data);
      setRegistrationComplete(data.registration_complete || false);
    } catch (error) {
      console.error('Unexpected error fetching profile:', error);
    }
  };

  const signIn = async (whatsapp: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: `${whatsapp}@multicrm.app`, // Using whatsapp as unique email
        password,
      });

      if (error) {
        toast.error(error.message || 'Falha no login');
        return;
      }
      
      // Successful login happens via the auth state change listener
      toast.success('Login realizado com sucesso!');
    } catch (error: any) {
      toast.error(error.message || 'Erro desconhecido');
    }
  };

  const signUp = async (whatsapp: string, password: string) => {
    try {
      const { error } = await supabase.auth.signUp({
        email: `${whatsapp}@multicrm.app`, // Using whatsapp as unique email
        password,
        options: {
          data: {
            whatsapp_number: whatsapp,
          }
        }
      });

      if (error) {
        toast.error(error.message || 'Falha no cadastro');
        return;
      }
      
      // Success is handled by onAuthStateChange
      toast.success('Cadastro realizado com sucesso!');
    } catch (error: any) {
      toast.error(error.message || 'Erro desconhecido');
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      toast.success('Logout realizado com sucesso!');
      navigate('/');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao fazer logout');
    }
  };

  const updateProfile = async (data: any) => {
    try {
      if (!user) {
        toast.error('Usuário não autenticado');
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update(data)
        .eq('id', user.id);

      if (error) {
        toast.error(error.message || 'Erro ao atualizar perfil');
        return;
      }

      // Refresh profile data
      fetchUserProfile(user.id);
      toast.success('Perfil atualizado com sucesso!');
    } catch (error: any) {
      toast.error(error.message || 'Erro desconhecido');
    }
  };

  const updateRegistrationStep = async (step: string, completed: boolean) => {
    try {
      if (!user) {
        toast.error('Usuário não autenticado');
        return;
      }

      // Check if step exists
      const { data: existingStep } = await supabase
        .from('registration_steps')
        .select('*')
        .eq('user_id', user.id)
        .eq('step_name', step)
        .single();

      if (existingStep) {
        // Update existing step
        await supabase
          .from('registration_steps')
          .update({ completed, updated_at: new Date() })
          .eq('id', existingStep.id);
      } else {
        // Create new step
        await supabase
          .from('registration_steps')
          .insert({
            user_id: user.id,
            step_name: step,
            completed
          });
      }

      // If this is the final step, update profile.registration_complete
      if (step === 'company_info' && completed) {
        await updateProfile({ registration_complete: true });
      }
    } catch (error: any) {
      console.error('Error updating registration step:', error);
    }
  };

  const value = {
    session,
    user,
    loading,
    profile,
    registrationComplete,
    signIn,
    signUp,
    signOut,
    updateProfile,
    updateRegistrationStep
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
