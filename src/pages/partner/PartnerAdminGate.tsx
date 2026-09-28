import React from 'react';
import { Navigate } from 'react-router-dom';
import { usePartnerPanel } from './PartnerPanelContext';

/** Garante que rotas administrativas do canal só abram para partner_admin. */
export default function PartnerAdminGate({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading, me } = usePartnerPanel();
  if (loading || !me) return null;
  if (!isAdmin) return <Navigate to="/partner" replace />;
  return <>{children}</>;
}
