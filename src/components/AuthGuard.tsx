
import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
  redirectTo = '/login',
  requireComplete = true,
}) => {
  const { user, loading, registrationComplete } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading) return;

    // Rota atual é register/steps e estamos verificando se o usuário está autenticado
    const isRegisterStepsPage = location.pathname === '/register/steps';
    
    if (requireAuth && !user) {
      // Usuário não está autenticado e página requer autenticação
      toast.error('Você precisa estar logado para acessar esta página');
      navigate(redirectTo);
    } else if (requireAuth && requireComplete && !registrationComplete && !isRegisterStepsPage) {
      // Usuário está autenticado mas registro não está completo
      // e não estamos na página de passos de registro
      toast.info('Por favor, complete seu cadastro primeiro');
      navigate('/register/steps');
    } else if (user && registrationComplete && isRegisterStepsPage) {
      // Usuário já completou o registro mas está tentando acessar a página de passos
      toast.info('Seu cadastro já está completo');
      navigate('/dashboard');
    }
  }, [user, loading, registrationComplete, navigate, requireAuth, redirectTo, requireComplete, location.pathname]);

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
