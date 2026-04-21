
import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/sonner';
import {
  getPostAuthHomePath,
  isSuperAdminPlatformUser,
  isTenantCrmPath,
} from '@/utils/superAdminRedirect';

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
    if (loading) return;

    const superAdminPlatform = isSuperAdminPlatformUser(user ?? undefined);

    if (process.env.NODE_ENV === 'development') {
      console.log('AuthGuard check:', {
        user: !!user,
        path: location.pathname,
        registrationComplete,
        requireAuth,
        requireComplete
      });
    }

    // Identifica as páginas especiais
    const isRegisterStepsPage = location.pathname === '/register/steps';
    const isRegisterPage = location.pathname === '/register';
    const isLoginPage = location.pathname === '/login' || location.pathname === '/';
    
    // Ignorar verificações de autenticação para a página de registro
    if (isRegisterPage) {
      return;
    }
    
    if (
      requireAuth &&
      user &&
      superAdminPlatform &&
      isTenantCrmPath(location.pathname) &&
      !location.pathname.startsWith('/superadmin')
    ) {
      navigate('/superadmin', { replace: true });
      return;
    }

    // Case 1: Usuário não está autenticado, mas a página requer autenticação
    if (requireAuth && !user) {
      console.log('User not authenticated, redirecting to:', redirectTo);
      if (!isLoginPage && redirectTo !== location.pathname) { // Evita loops de redirecionamento
        toast.error('Você precisa estar logado para acessar esta página');
        navigate(redirectTo);
      }
      return;
    }
    
    if (
      requireAuth &&
      requireComplete &&
      user &&
      !registrationComplete &&
      !isRegisterStepsPage &&
      !superAdminPlatform
    ) {
      console.log('Registration not complete, redirecting to registration steps');
      toast.info('Por favor, complete seu cadastro primeiro');
      navigate('/register/steps');
      return;
    }

    if (user && superAdminPlatform && isRegisterStepsPage) {
      navigate('/superadmin', { replace: true });
      return;
    }
    
    if (user && registrationComplete && isRegisterStepsPage) {
      console.log('Registration already complete, redirecting');
      toast.info('Seu cadastro já está completo');
      navigate(getPostAuthHomePath(user), { replace: true });
      return;
    }

    if (user && isLoginPage) {
      console.log('User already logged in, redirecting to appropriate page');
      navigate(getPostAuthHomePath(user), { replace: true });
      return;
    }

    const isOnboardingPage = location.pathname === '/onboarding';
    /** Fase 1 checkout: onboarding de rota não é obrigatório; ativação leve fica no dashboard. */
    const needsLegacyOnboarding =
      import.meta.env.VITE_FORCE_LEGACY_ONBOARDING_ROUTE === 'true' &&
      !superAdminPlatform &&
      user?.tenant_status === 'active' &&
      user?.onboarding_completed === false;
    if (requireAuth && user && needsLegacyOnboarding && !isOnboardingPage) {
      navigate('/onboarding', { replace: true });
      return;
    }

    if (user && superAdminPlatform && isOnboardingPage) {
      navigate('/superadmin', { replace: true });
      return;
    }

    if (user && user.onboarding_completed === true && isOnboardingPage) {
      navigate(getPostAuthHomePath(user), { replace: true });
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
