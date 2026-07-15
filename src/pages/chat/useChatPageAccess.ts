import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useModulePermissions } from '@/contexts/ModulePermissionsContext';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { chatCommercialGates } from '@/utils/chatCommercialGates';

export type ChatPageScope = 'tenant' | 'platform';

/** Gate de permissões / feature flags da página Chat (tenant vs platform). */
export function useChatPageAccess(scope: ChatPageScope = 'tenant') {
  const { user, session, profile } = useAuth();
  const {
    canView,
    canEdit,
    canChatReply: rawCanChatReply,
    hasPermissionKey: rawHasPermissionKey,
    permissions,
    loading: modulePermLoading,
  } = useModulePermissions();
  const navigate = useNavigate();

  const isPlatformScope = scope === 'platform';
  const isPlatformSuperAdmin = Boolean(isPlatformScope && user?.is_super_admin);
  const hasPermissionKey = useCallback(
    (key: Parameters<typeof rawHasPermissionKey>[0]) => {
      if (!isPlatformScope) return rawHasPermissionKey(key);
      if (!isPlatformSuperAdmin) return false;
      return key === 'chat.view' || key === 'chat.send_message';
    },
    [isPlatformScope, isPlatformSuperAdmin, rawHasPermissionKey],
  );
  const canChatReply = useCallback(
    () => (isPlatformScope ? isPlatformSuperAdmin : rawCanChatReply()),
    [isPlatformScope, isPlatformSuperAdmin, rawCanChatReply],
  );

  const crmAllowGroupManage = useMemo(
    () =>
      hasPermissionKey('chat.manage_groups') ||
      hasPermissionKey('chat.manage_group_settings') ||
      hasPermissionKey('chat.manage_group_participants'),
    [hasPermissionKey, permissions.chat?.module_extras],
  );

  const canViewAttendanceQueue = !isPlatformScope && hasPermissionKey('chat.view_queue');
  const hasChatFeature = useFeatureFlag('chat');
  const hasAgendaFeature = useFeatureFlag('agenda');
  const commercial = useMemo(() => chatCommercialGates(hasPermissionKey), [hasPermissionKey]);
  const canCreateAgendaInChat =
    !isPlatformScope && hasAgendaFeature && hasPermissionKey('chat.schedule_from_chat') && !modulePermLoading;
  const canCreateProposalsInChat =
    !isPlatformScope && commercial.canCreateProposalFromChatFull && !modulePermLoading;
  const canCreateContractsInChat =
    !isPlatformScope && commercial.canCreateContractFromChatFull && !modulePermLoading;
  const canCreateInvoicesInChat =
    !isPlatformScope && commercial.canCreateInvoiceFromChatFull && !modulePermLoading;
  const chatRouteBase = isPlatformScope ? '/superadmin/chat' : '/chat';

  useEffect(() => {
    if (isPlatformScope) {
      if (!isPlatformSuperAdmin) {
        toast.error('Acesso restrito a Super Admin');
        navigate('/superadmin', { replace: true });
      }
      return;
    }
    if (!hasChatFeature || modulePermLoading) return;
    if (user?.is_tenant_admin) return;
    if (!canView('chat')) {
      toast.error('Sem permissão para acessar o Chat');
      navigate('/dashboard', { replace: true });
    }
  }, [
    isPlatformScope,
    isPlatformSuperAdmin,
    hasChatFeature,
    modulePermLoading,
    user?.is_tenant_admin,
    canView,
    navigate,
  ]);

  return {
    user,
    session,
    profile,
    canView,
    canEdit,
    modulePermLoading,
    isPlatformScope,
    isPlatformSuperAdmin,
    hasPermissionKey,
    canChatReply,
    crmAllowGroupManage,
    canViewAttendanceQueue,
    hasChatFeature,
    hasAgendaFeature,
    commercial,
    canCreateAgendaInChat,
    canCreateProposalsInChat,
    canCreateContractsInChat,
    canCreateInvoicesInChat,
    chatRouteBase,
    navigate,
  };
}
