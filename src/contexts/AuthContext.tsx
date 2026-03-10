
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { apiClient } from '@/integrations/api/client';
import { clearAuthState, getCurrentUserProfile } from '@/utils/auth-helpers';

interface User {
  id: string;
  email: string;
  whatsapp_number?: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  whatsapp_connected?: boolean;
  registration_complete?: boolean;
  created_at?: string;
  default_profile_id?: string | null;
  is_super_admin?: boolean;
  /** Se true, o usuário é o administrador da conta (primary user do tenant) e pode acessar a tela de planos. */
  can_manage_plan?: boolean;
  /** Se true, o plano grátis expirou e o usuário deve ser direcionado para contratação. */
  plan_expired?: boolean;
  /** Status do tenant (active, trial, payment_pending, suspended). */
  tenant_status?: string | null;
  /** Se false e tenant_status === 'active', redirecionar para /onboarding. */
  onboarding_completed?: boolean;
}

interface SignUpParams {
  identifier: string;
  password: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  whatsapp?: string;
}

type AuthContextType = {
  session: { token: string } | null;
  user: User | null;
  loading: boolean;
  profile: any | null;
  registrationComplete: boolean;
  /** Lista de feature keys habilitadas para o usuário (plano/tenant). Super admin tem todas. */
  features: string[];
  signIn: (identifier: string, password: string) => Promise<void>;
  signUp: (params: SignUpParams) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (data: any) => Promise<void>;
  updateRegistrationStep: (step: string, completed: boolean) => Promise<void>;
  /** Recarrega as features do usuário (ex.: após troca de tenant/plano). */
  refreshFeatures: () => Promise<void>;
  /** Define token e usuário (ex.: após onboarding create-admin) e recarrega features. */
  setTokenAndUser: (token: string, user: User) => Promise<void>;
  /** Recarrega dados do usuário (ex.: após concluir onboarding). */
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<{ token: string } | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any | null>(null);
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [features, setFeatures] = useState<string[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    // Suporte a "Acessar como" (impersonation): token na URL aplicado antes de carregar
    const params = new URLSearchParams(window.location.search);
    const impToken = params.get('impersonation_token');
    if (impToken) {
      apiClient.setToken(impToken);
      window.history.replaceState({}, '', (window.location.pathname || '/') + (window.location.hash || ''));
    }
    const token = apiClient.getToken();
    if (token) {
      fetchCurrentUser();
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.plan_expired && window.location.pathname !== '/meu-plano') {
      navigate('/meu-plano', { replace: true });
    }
  }, [user?.plan_expired, navigate]);

  const fetchCurrentUser = async () => {
    try {
      const response = await apiClient.get<User>('/api/auth/me');
      if (response.error) {
        // Token invalid, clear it
        apiClient.setToken(null);
        setSession(null);
        setUser(null);
        setProfile(null);
        setFeatures([]);
        setRegistrationComplete(false);
        setLoading(false);
        return;
      }

      if (response.data) {
        setUser(response.data);
        setSession({ token: apiClient.getToken() || '' });
        setProfile(response.data);
        setRegistrationComplete(response.data.registration_complete || false);
        await fetchMeFeatures();
      }
      setLoading(false);
    } catch (error) {
      console.error('Error fetching user:', error);
      setLoading(false);
    }
  };

  const fetchMeFeatures = async () => {
    try {
      const res = await apiClient.get<{ features: string[] }>('/api/auth/me/features');
      if (res.data?.features) {
        setFeatures(res.data.features);
      } else {
        setFeatures([]);
      }
    } catch {
      setFeatures([]);
    }
  };

  const fetchUserProfile = async (userId: string) => {
    try {
      console.log('Fetching profile for user:', userId);
      const profile = await getCurrentUserProfile();
      
      if (!profile) {
        console.log('No profile found after attempt to create one');
        setProfile(null);
        setRegistrationComplete(false);
        setLoading(false);
        return;
      }

      console.log('Profile loaded successfully:', profile);
      setProfile(profile);
      setRegistrationComplete((profile as any)?.registration_complete || false);
      setLoading(false);
    } catch (error) {
      console.error('Unexpected error fetching profile:', error);
      setLoading(false);
    }
  };

  const signIn = async (identifier: string, password: string) => {
    try {
      const response = await apiClient.post<{ user: User; token: string }>('/api/auth/login', {
        identifier: identifier.trim(),
        password,
      });

      if (response.error) {
        toast.error(response.error || 'Falha no login');
        return;
      }

      if (response.data) {
        apiClient.setToken(response.data.token);
        setSession({ token: response.data.token });
        setUser(response.data.user);
        setProfile(response.data.user);
        setRegistrationComplete(response.data.user.registration_complete || false);
        await fetchMeFeatures();
        await fetchCurrentUser();
        toast.success('Login realizado com sucesso!');
      }
    } catch (error: any) {
      toast.error(error.message || 'Erro desconhecido');
    }
  };

  const signUp = async ({
    identifier,
    password,
    firstName,
    lastName,
    companyName,
    whatsapp,
  }: SignUpParams) => {
    try {
      const trimmedIdentifier = identifier.trim();
      const isEmail = trimmedIdentifier.includes('@');
      const normalizedWhatsapp = whatsapp
        ? whatsapp.replace(/\D/g, '')
        : !isEmail
          ? trimmedIdentifier.replace(/\D/g, '')
          : undefined;
      const email = isEmail ? trimmedIdentifier.toLowerCase() : null;
      
      const registerEmail = email || `${normalizedWhatsapp}@painelcrm.app`;
      
      const payload = {
        email: registerEmail,
        password,
        whatsapp: normalizedWhatsapp || null,
        first_name: firstName,
        last_name: lastName,
        company_name: companyName,
      };
      
      const response = await apiClient.post<{ user: User; token: string }>('/api/auth/register', {
        ...payload,
      });

      if (response.error) {
        toast.error(response.error || 'Falha no cadastro');
        return;
      }

      if (response.data) {
        apiClient.setToken(response.data.token);
        setSession({ token: response.data.token });
        setUser(response.data.user);
        setProfile(response.data.user);
        setRegistrationComplete(false);
        await fetchCurrentUser();
        toast.success('Cadastro realizado com sucesso!');
      }
    } catch (error: any) {
      toast.error(error.message || 'Erro desconhecido');
    }
  };

  const signOut = async () => {
    try {
      // Call logout endpoint primeiro (enquanto ainda temos o token)
      // Ignorar erros, pois o logout é principalmente client-side com JWT
      try {
        await apiClient.post('/api/auth/logout');
      } catch (logoutError) {
        // Ignorar erros do endpoint de logout
      }
      
      // Limpar estado local
      setProfile(null);
      setRegistrationComplete(false);
      setUser(null);
      setSession(null);
      setFeatures([]);
      
      // Limpar armazenamento local relacionado à autenticação
      await clearAuthState();
      apiClient.setToken(null);
      
      toast.success('Logout realizado com sucesso!');
      navigate('/login');
    } catch (error: any) {
      // Se algo der errado, garantir que o estado local seja limpo
      setProfile(null);
      setRegistrationComplete(false);
      setUser(null);
      setSession(null);
      setFeatures([]);
      await clearAuthState();
      apiClient.setToken(null);
      toast.success('Logout realizado com sucesso!');
      navigate('/login');
    }
  };

  const updateProfile = async (data: any) => {
    try {
      if (!user) {
        toast.error('Usuário não autenticado');
        return;
      }

      console.log('Updating profile for user:', user.id, 'with data:', data);
      const response = await apiClient.patch('/api/profile', data);

      if (response.error) {
        console.error('Error updating profile:', response.error);
        toast.error(response.error || 'Erro ao atualizar perfil');
        return;
      }

      // Refresh profile data
      await fetchCurrentUser();
      toast.success('Perfil atualizado com sucesso!');
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast.error(error.message || 'Erro desconhecido');
    }
  };

  const setTokenAndUser = async (token: string, newUser: User) => {
    apiClient.setToken(token);
    setSession({ token });
    setUser(newUser);
    setProfile(newUser);
    setRegistrationComplete(newUser.registration_complete ?? false);
    await fetchMeFeatures();
  };

  const refreshUser = async () => {
    await fetchCurrentUser();
  };

  const updateRegistrationStep = async (step: string, completed: boolean) => {
    try {
      if (!user) {
        toast.error('Usuário não autenticado');
        return;
      }

      console.log('Updating registration step:', step, 'to', completed, 'for user:', user.id);

      const response = await apiClient.post('/api/registration-steps', {
        step_name: step,
        completed,
      });

      if (response.error) {
        console.error('Error updating registration step:', response.error);
        return;
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
    features,
    signIn,
    signUp,
    signOut,
    updateProfile,
    updateRegistrationStep,
    refreshFeatures: fetchMeFeatures,
    setTokenAndUser,
    refreshUser,
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
