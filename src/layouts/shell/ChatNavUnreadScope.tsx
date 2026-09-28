import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { useModulePermissions } from '@/contexts/ModulePermissionsContext';
import { ChatNavUnreadProvider } from '@/hooks/chatNavUnreadContext';
import { scheduleIdleTask } from '@/lib/scheduleIdleTask';

/**
 * Escopo de unread da nav — MB-007 soft-lazy:
 * Auth/permissions/nav montam primeiro; instances+attendance-counts só após idle.
 */
export function ChatNavUnreadScope({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const hasChat = useFeatureFlag('chat');
  const { canView } = useModulePermissions();
  const [idleReady, setIdleReady] = useState(false);

  useEffect(() => {
    let armed = false;
    const arm = () => {
      if (armed) return;
      armed = true;
      setIdleReady(true);
    };
    const cancelIdle = scheduleIdleTask(arm, { timeout: 3000, fallbackDelay: 1500 });
    const onInteraction = () => arm();
    const opts: AddEventListenerOptions = { once: true, passive: true };
    window.addEventListener('pointerdown', onInteraction, opts);
    window.addEventListener('keydown', onInteraction, opts);
    return () => {
      cancelIdle();
      window.removeEventListener('pointerdown', onInteraction);
      window.removeEventListener('keydown', onInteraction);
    };
  }, []);

  const enabled = idleReady && Boolean(user?.id) && hasChat && canView('chat');
  return <ChatNavUnreadProvider enabled={enabled}>{children}</ChatNavUnreadProvider>;
}
