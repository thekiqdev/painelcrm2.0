
// Atualizando o AuthGuard para garantir que usuários não autenticados sejam redirecionados
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface AuthGuardProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  redirectTo?: string;
  requireComplete?: boolean;
}

const AuthGuard: React.FC<AuthGuardProps> = ({
  children,
  requireAuth = true,
  redirectTo = '/login',  // Alterando para '/login' em vez de '/'
  requireComplete = true,
}) => {
  const { user, loading, registrationComplete } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;

    if (requireAuth && !user) {
      toast.error('Você precisa estar logado para acessar esta página');
      navigate(redirectTo);
    } else if (requireAuth && requireComplete && !registrationComplete) {
      toast.info('Por favor, complete seu cadastro primeiro');
      navigate('/register/steps');
    }
  }, [user, loading, registrationComplete, navigate, requireAuth, redirectTo, requireComplete]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-crm-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return <>{children}</>;
};

export default AuthGuard;
