
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
  const { user, loading, registrationComplete, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Não faça nada enquanto estamos carregando o estado de autenticação
    if (loading) return;

    console.log('AuthGuard check:', { 
      user: !!user, 
      path: location.pathname,
      registrationComplete,
      requireAuth,
      requireComplete
    });

    // Identifica as páginas especiais
    const isRegisterStepsPage = location.pathname === '/register/steps';
    const isRegisterPage = location.pathname === '/register';
    const isLoginPage = location.pathname === '/login' || location.pathname === '/';
    
    // Case 1: Usuário não está autenticado, mas a página requer autenticação
    if (requireAuth && !user) {
      console.log('User not authenticated, redirecting to:', redirectTo);
      if (!isLoginPage) { // Evita mensagens repetidas na página de login
        toast.error('Você precisa estar logado para acessar esta página');
      }
      navigate(redirectTo);
      return;
    }
    
    // Case 2: Usuário está autenticado mas registro não está completo e a página requer registro completo
    if (requireAuth && requireComplete && user && !registrationComplete && !isRegisterStepsPage) {
      console.log('Registration not complete, redirecting to registration steps');
      if (!isRegisterStepsPage) { // Evita mensagens repetidas na página de etapas
        toast.info('Por favor, complete seu cadastro primeiro');
      }
      navigate('/register/steps');
      return;
    }
    
    // Case 3: Usuário já completou o registro mas está na página de registro
    if (user && registrationComplete && isRegisterStepsPage) {
      console.log('Registration already complete, redirecting to dashboard');
      toast.info('Seu cadastro já está completo');
      navigate('/dashboard');
      return;
    }
    
    // Case 4: Usuário já está logado mas está tentando acessar a página de registro
    if (user && (isRegisterPage || isLoginPage)) {
      console.log('User already logged in, redirecting to appropriate page');
      navigate(registrationComplete ? '/dashboard' : '/register/steps');
      return;
    }
    
  }, [
    user, 
    loading, 
    registrationComplete, 
    navigate, 
    requireAuth, 
    redirectTo, 
    requireComplete, 
    location.pathname
  ]);

  // Exibe um indicador de carregamento enquanto verificamos o estado de autenticação
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
