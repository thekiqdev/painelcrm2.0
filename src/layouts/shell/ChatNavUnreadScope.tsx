import { useAuth } from '@/contexts/AuthContext';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { useModulePermissions } from '@/contexts/ModulePermissionsContext';
import { ChatNavUnreadProvider } from '@/hooks/chatNavUnreadContext';

export function ChatNavUnreadScope({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const hasChat = useFeatureFlag('chat');
  const { canView } = useModulePermissions();
  const enabled = Boolean(user?.id) && hasChat && canView('chat');
  return <ChatNavUnreadProvider enabled={enabled}>{children}</ChatNavUnreadProvider>;
}
