import { useCallback, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { useModulePermissions } from '@/contexts/ModulePermissionsContext';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useChatNavUnreadCount } from '@/hooks/useChatNavUnreadCount';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useFloatingChat } from './FloatingChatProvider';
import { FloatingConversationList } from './FloatingConversationList';
import { FloatingConversationWindow } from './FloatingConversationWindow';
import { MinimizedChatDock } from './MinimizedChatDock';
import {
  FLOATING_LIST_GAP_ABOVE_BUBBLE_PX,
  FLOATING_LIST_STACK_ABOVE_BUBBLE_PX,
  FLOATING_LIST_WIDTH_PX,
  FLOATING_Z_BUBBLE,
  FLOATING_Z_LIST,
} from './constants';
import { shouldHideFloatingChat } from './floatingChatRouteGuard';
import { getFloatingChatLayout } from './floatingChatLayout';

/** Alinha com `--floating-chat-bottom` / `--floating-chat-right` em index.css */
const bubbleBottom = 'calc(var(--floating-chat-bottom) + env(safe-area-inset-bottom, 0px))';
const bubbleRight = 'calc(var(--floating-chat-right) + env(safe-area-inset-right, 0px))';
const listBottom = `calc(var(--floating-chat-bottom) + ${FLOATING_LIST_STACK_ABOVE_BUBBLE_PX}px + ${FLOATING_LIST_GAP_ABOVE_BUBBLE_PX}px + env(safe-area-inset-bottom, 0px))`;
const listRight = 'calc(var(--floating-chat-right) + env(safe-area-inset-right, 0px))';

function useFloatingChatShellEligible(): boolean {
  const { pathname } = useLocation();
  const hasChat = useFeatureFlag('chat');
  const { canView } = useModulePermissions();
  const desktop = useMediaQuery('(min-width: 1024px)');

  if (!desktop || !hasChat || !canView('chat')) return false;
  if (shouldHideFloatingChat(pathname)) return false;
  return true;
}

function FloatingChatChrome() {
  const { listOpen, toggleList, panels, activeWindowId, focusWindow } = useFloatingChat();

  const expanded = useMemo(() => panels.filter((p) => !p.minimized), [panels]);

  const stackMap = useMemo(() => {
    const m = new Map<string, number>();
    expanded.forEach((p, idx) => {
      m.set(p.conversationId, expanded.length - 1 - idx);
    });
    return m;
  }, [expanded]);

  const [dockWidthPx, setDockWidthPx] = useState(0);
  const onDockWidthChange = useCallback((w: number) => {
    setDockWidthPx(w);
  }, []);

  const layout = useMemo(() => getFloatingChatLayout({ dockWidthPx }), [dockWidthPx]);

  /** Mesmo agregado operacional do menu Chat (campo `unread` de attendance-counts), não o sininho. */
  const bubbleUnread = useChatNavUnreadCount(true);

  return (
    <>
      {expanded.map((p) => (
        <FloatingConversationWindow
          key={p.conversationId}
          conversationId={p.conversationId}
          rightPx={layout.windowRightPx(stackMap.get(p.conversationId) ?? 0)}
          isActive={activeWindowId === p.conversationId}
          onFocusWindow={() => focusWindow(p.conversationId)}
        />
      ))}

      {listOpen ? (
        <div
          className="fixed flex h-[min(70dvh,calc(100dvh-3rem))] max-h-[70dvh] min-h-0 max-w-[calc(100vw-2rem)] animate-in slide-in-from-bottom-2 flex-col overflow-hidden duration-200"
          data-floating-chat-list
          style={{
            zIndex: FLOATING_Z_LIST,
            bottom: listBottom,
            right: listRight,
            width: FLOATING_LIST_WIDTH_PX,
          }}
        >
          <FloatingConversationList className="h-full min-h-0" />
        </div>
      ) : null}

      <MinimizedChatDock dockRightPx={layout.dockRightPx} onDockWidthChange={onDockWidthChange} />

      <div
        className="fixed"
        style={{
          zIndex: FLOATING_Z_BUBBLE,
          bottom: bubbleBottom,
          right: bubbleRight,
        }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon"
              className={cn(
                'relative h-14 w-14 rounded-full border border-border/60 bg-primary text-primary-foreground shadow-lg transition hover:scale-[1.03] hover:shadow-xl',
              )}
              onClick={() => toggleList()}
              aria-label="Conversas"
            >
              <MessageCircle className="h-6 w-6" />
              {bubbleUnread > 0 ? (
                <Badge
                  variant="destructive"
                  className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] justify-center px-1 text-[10px] tabular-nums"
                >
                  {bubbleUnread > 99 ? '99+' : bubbleUnread}
                </Badge>
              ) : null}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Conversas</TooltipContent>
        </Tooltip>
      </div>
    </>
  );
}

/** Shell sem provider: use dentro de AppLayout já envolvido por FloatingChatProvider. */
export function FloatingChatWidget() {
  const eligible = useFloatingChatShellEligible();
  if (!eligible) return null;
  return <FloatingChatChrome />;
}
