import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getMyPermissions, type ModulePermissionsMap, type ModulePermission } from '@/services/modulePermissions';

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
}

const defaultPerm: ModulePermission = {
  can_view: true,
  can_create: true,
  can_edit: true,
  can_delete: true,
  edit_own_only: false,
  delete_own_only: false,
};

const ModulePermissionsContext = createContext<ModulePermissionsContextValue | null>(null);

export function ModulePermissionsProvider({ children }: { children: React.ReactNode }) {
  const [permissions, setPermissions] = useState<ModulePermissionsMap>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyPermissions()
      .then(setPermissions)
      .catch(() => setPermissions({}))
      .finally(() => setLoading(false));
  }, []);

  const p = useCallback(
    (moduleId: ModuleId): ModulePermission => {
      return permissions[moduleId] ?? defaultPerm;
    },
    [permissions]
  );

  const canView = useCallback(
    (moduleId: ModuleId) => {
      const perm = permissions[moduleId];
      if (!perm) return true;
      return perm.can_view === true;
    },
    [permissions]
  );

  const canCreate = useCallback(
    (moduleId: ModuleId) => {
      const perm = permissions[moduleId];
      if (!perm) return true;
      return perm.can_create === true;
    },
    [permissions]
  );

  const canEdit = useCallback(
    (moduleId: ModuleId) => {
      const perm = permissions[moduleId];
      if (!perm) return true;
      return perm.can_edit === true;
    },
    [permissions]
  );

  const canDelete = useCallback(
    (moduleId: ModuleId) => {
      const perm = permissions[moduleId];
      if (!perm) return true;
      return perm.can_delete === true;
    },
    [permissions]
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
      if (!p(moduleId).edit_own_only) return true;
      if (!ownerOrAssigneeUserId || !currentUserId) return true;
      return ownerOrAssigneeUserId === currentUserId;
    },
    [canEdit, p]
  );

  const canDeleteRecord = useCallback(
    (
      moduleId: ModuleId,
      ownerOrAssigneeUserId?: string | null,
      currentUserId?: string | null
    ) => {
      if (!canDelete(moduleId)) return false;
      if (!p(moduleId).delete_own_only) return true;
      if (!ownerOrAssigneeUserId || !currentUserId) return true;
      return ownerOrAssigneeUserId === currentUserId;
    },
    [canDelete, p]
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
      canView: () => true,
      canCreate: () => true,
      canEdit: () => true,
      canDelete: () => true,
      isEditOwnOnly: () => false,
      isDeleteOwnOnly: () => false,
      canEditRecord: () => true,
      canDeleteRecord: () => true,
    };
  }
  return ctx;
}
