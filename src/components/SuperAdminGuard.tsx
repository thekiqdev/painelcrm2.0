import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Guard para rotas do painel Super Admin.
 * Redireciona para /dashboard se o usuário não for super admin.
 */
export default function SuperAdminGuard() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-crm-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  if (!user.is_super_admin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
