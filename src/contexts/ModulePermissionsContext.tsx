import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getMyPermissions, type ModulePermissionsMap, type ModulePermission } from '@/services/modulePermissions';
import {
  hasPermissionKey,
  type PermissionCatalogKey,
} from '@/permissions/permissionCatalog';
import { useAuth } from '@/contexts/AuthContext';

type ModuleId = string;

interface ModulePermissionsContextValue {
  permissions: ModulePermissionsMap;
  loading: boolean;
  canView: (moduleId: ModuleId) => boolean;
  canCreate: (moduleId: ModuleId) => boolean;
  canEdit: (moduleId: ModuleId) => boolean;
  canDelete: (moduleId: ModuleId) => boolean;
  isEditOwnOnly: (moduleId: ModuleId) => boolean;
  isDeleteOwnOnly: (moduleId: ModuleId) => boolean;
  canEditRecord: (moduleId: ModuleId, ownerOrAssigneeUserId?: string | null, currentUserId?: string | null) => boolean;
  canDeleteRecord: (moduleId: ModuleId, ownerOrAssigneeUserId?: string | null, currentUserId?: string | null) => boolean;
  /** Etapa 5 propostas — link público / envio */
  canProposalSendRecord: (ownerUserId?: string | null, currentUserId?: string | null) => boolean;
  /** Etapa 5 propostas — converter em fatura */
  canProposalConvertRecord: (ownerUserId?: string | null, currentUserId?: string | null) => boolean;
  /** Etapa 5 propostas — webhooks / integrações */
  canProposalManageIntegrations: () => boolean;
  /** Enviar mensagens no Chat (texto, mídia, etc.) — alinhado ao backend `chat.send_message`. */
  canChatReply: () => boolean;
  /** Verificação granular por chave do catálogo (ex.: `chat.transfer_attendance`). */
  hasPermissionKey: (key: PermissionCatalogKey) => boolean;
}

const ModulePermissionsContext = createContext<ModulePermissionsContextValue | null>(null);

export function ModulePermissionsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const isTenantAdminUser = user?.is_tenant_admin === true;
  const [permissions, setPermissions] = useState<ModulePermissionsMap>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setPermissions({});
      setLoading(false);
      return;
    }
    setLoading(true);
    getMyPermissions()
      .then(setPermissions)
      .catch(() => setPermissions({}))
      .finally(() => setLoading(false));
  }, [user?.id, user?.tenant_id]);

  const canView = useCallback(
    (moduleId: ModuleId) => {
      if (loading) return false;
      if (isTenantAdminUser) return true;
      const perm = permissions[moduleId];
      if (!perm) return false;
      return perm.can_view === true;
    },
    [loading, isTenantAdminUser, permissions]
  );

  const canCreate = useCallback(
    (moduleId: ModuleId) => {
      if (loading) return false;
      if (isTenantAdminUser) return true;
      const perm = permissions[moduleId];
      if (!perm) return false;
      return perm.can_create === true;
    },
    [loading, isTenantAdminUser, permissions]
  );

  const canEdit = useCallback(
    (moduleId: ModuleId) => {
      if (loading) return false;
      if (isTenantAdminUser) return true;
      const perm = permissions[moduleId];
      if (!perm) return false;
      return perm.can_edit === true;
    },
    [loading, isTenantAdminUser, permissions]
  );

  const canDelete = useCallback(
    (moduleId: ModuleId) => {
      if (loading) return false;
      if (isTenantAdminUser) return true;
      const perm = permissions[moduleId];
      if (!perm) return false;
      return perm.can_delete === true;
    },
    [loading, isTenantAdminUser, permissions]
  );

  const isEditOwnOnly = useCallback(
    (moduleId: ModuleId) => {
      const perm = permissions[moduleId];
      return perm?.edit_own_only === true;
    },
    [permissions]
  );

  const isDeleteOwnOnly = useCallback(
    (moduleId: ModuleId) => {
      const perm = permissions[moduleId];
      return perm?.delete_own_only === true;
    },
    [permissions]
  );

  const canEditRecord = useCallback(
    (
      moduleId: ModuleId,
      ownerOrAssigneeUserId?: string | null,
      currentUserId?: string | null
    ) => {
      if (!canEdit(moduleId)) return false;
      const perm = permissions[moduleId];
      if (!perm?.edit_own_only) return true;
      if (!ownerOrAssigneeUserId || !currentUserId) return true;
      return ownerOrAssigneeUserId === currentUserId;
    },
    [canEdit, permissions]
  );

  const canDeleteRecord = useCallback(
    (
      moduleId: ModuleId,
      ownerOrAssigneeUserId?: string | null,
      currentUserId?: string | null
    ) => {
      if (!canDelete(moduleId)) return false;
      const perm = permissions[moduleId];
      if (!perm?.delete_own_only) return true;
      if (!ownerOrAssigneeUserId || !currentUserId) return true;
      return ownerOrAssigneeUserId === currentUserId;
    },
    [canDelete, permissions]
  );

  const canProposalSendRecord = useCallback(
    (ownerUserId?: string | null, currentUserId?: string | null) => {
      if (loading) return false;
      if (isTenantAdminUser) return true;
      if (!hasPermissionKey(permissions, 'proposals.send')) return false;
      return canEditRecord('proposals', ownerUserId, currentUserId);
    },
    [loading, isTenantAdminUser, permissions, canEditRecord]
  );

  const canProposalConvertRecord = useCallback(
    (ownerUserId?: string | null, currentUserId?: string | null) => {
      if (loading) return false;
      if (isTenantAdminUser) return true;
      const perm = permissions.proposals;
      if (!perm?.can_edit) return false;
      if (perm.edit_own_only && ownerUserId && currentUserId && ownerUserId !== currentUserId) return false;
      if (perm.module_extras?.proposals_convert_invoice === false) return false;
      return true;
    },
    [loading, isTenantAdminUser, permissions.proposals]
  );

  const canProposalManageIntegrations = useCallback(() => {
    if (loading) return false;
    if (isTenantAdminUser) return true;
    const perm = permissions.proposals;
    if (!perm?.can_edit) return false;
    return perm.module_extras?.proposals_manage_integrations === true;
  }, [loading, isTenantAdminUser, permissions.proposals]);

  const canChatReply = useCallback(() => {
    if (loading) return false;
    if (isTenantAdminUser) return true;
    return hasPermissionKey(permissions, 'chat.send_message');
  }, [loading, isTenantAdminUser, permissions]);

  const hasPk = useCallback(
    (key: PermissionCatalogKey) => {
      if (loading) return false;
      if (isTenantAdminUser) return true;
      return hasPermissionKey(permissions, key);
    },
    [loading, isTenantAdminUser, permissions]
  );

  const value: ModulePermissionsContextValue = {
    permissions,
    loading,
    canView,
    canCreate,
    canEdit,
    canDelete,
    isEditOwnOnly,
    isDeleteOwnOnly,
    canEditRecord,
    canDeleteRecord,
    canProposalSendRecord,
    canProposalConvertRecord,
    canProposalManageIntegrations,
    canChatReply,
    hasPermissionKey: hasPk,
  };

  return (
    <ModulePermissionsContext.Provider value={value}>
      {children}
    </ModulePermissionsContext.Provider>
  );
}

export function useModulePermissions(): ModulePermissionsContextValue {
  const ctx = useContext(ModulePermissionsContext);
  if (!ctx) {
    return {
      permissions: {},
      loading: false,
      canView: () => false,
      canCreate: () => false,
      canEdit: () => false,
      canDelete: () => false,
      isEditOwnOnly: () => false,
      isDeleteOwnOnly: () => false,
      canEditRecord: () => false,
      canDeleteRecord: () => false,
      canProposalSendRecord: () => false,
      canProposalConvertRecord: () => false,
      canProposalManageIntegrations: () => false,
      canChatReply: () => false,
      hasPermissionKey: () => false,
    };
  }
  return ctx;
}
