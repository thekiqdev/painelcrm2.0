import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Filter, MoreHorizontal } from 'lucide-react';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { useModulePermissions } from '@/contexts/ModulePermissionsContext';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useSharedChatNavUnreadCount } from '@/hooks/chatNavUnreadContext';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { fetchBubbleRecentConversations } from '@/lib/chatConversationsFetch';
import {
  FLOATING_CHAT_LIST_STALE_MS,
  floatingChatBubbleQueryKey,
} from './floatingChatQueries';
import { resolveConversationIdentity } from '@/utils/chatIdentityDisplay';
import { cn } from '@/lib/utils';
import { useFloatingChat } from './floatingChatContext';
import { FloatingConversationList } from './FloatingConversationList';
import { FloatingConversationWindow } from './FloatingConversationWindow';
import { MinimizedChatDock } from './MinimizedChatDock';
import {
  FLOATING_BUBBLE_DIAMETER_PX,
  FLOATING_LIST_GAP_ABOVE_BUBBLE_PX,
  FLOATING_LIST_WIDTH_PX,
  FLOATING_Z_BUBBLE,
  FLOATING_Z_LIST,
} from './constants';
import { shouldHideFloatingChat } from './floatingChatRouteGuard';
import { getFloatingChatLayout } from './floatingChatLayout';
import { FloatingChatListShellLoading } from '@/components/chat/FloatingChatListShell';

/** Alinha com `--floating-chat-bottom` / `--floating-chat-right` em index.css */
const bubbleBottom = 'calc(var(--floating-chat-bottom) + env(safe-area-inset-bottom, 0px))';
const bubbleRight = 'calc(var(--floating-chat-right) + env(safe-area-inset-right, 0px))';
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
  const { listOpen, toggleList, panels, activeWindowId, focusWindow, instanceIds, instancesLoading, inboxScope } =
    useFloatingChat();

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

  /** Mesmo agregado operacional do menu Chat (campo `unread` de attendance-counts), não o sininho. */
  const bubbleUnread = useSharedChatNavUnreadCount();

  const { data: bubbleRecentRaw = [] } = useQuery({
    queryKey: floatingChatBubbleQueryKey(instanceIds, inboxScope),
    enabled: instanceIds.length > 0,
    queryFn: () => fetchBubbleRecentConversations(instanceIds, inboxScope),
    staleTime: FLOATING_CHAT_LIST_STALE_MS,
    placeholderData: (prev) => prev,
  });

  const bubbleRecentPreview = useMemo(() => {
    const hasMore = bubbleRecentRaw.length >= 4;
    const slice = bubbleRecentRaw.slice(0, 3);
    return { slice, hasMore };
  }, [bubbleRecentRaw]);

  const bubbleButtonRef = useRef<HTMLButtonElement>(null);
  const [bubbleBox, setBubbleBox] = useState({
    w: FLOATING_BUBBLE_DIAMETER_PX,
    h: 48,
  });

  useLayoutEffect(() => {
    const el = bubbleButtonRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBubbleBox({
        w: Math.max(1, Math.ceil(r.width)),
        h: Math.max(1, Math.ceil(r.height)),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [
    bubbleUnread,
    bubbleRecentPreview.slice.length,
    bubbleRecentPreview.hasMore,
    listOpen,
  ]);

  const layout = useMemo(
    () => getFloatingChatLayout({ dockWidthPx, bubbleWidthPx: bubbleBox.w }),
    [dockWidthPx, bubbleBox.w],
  );

  const listBottom = useMemo(
    () =>
      `calc(var(--floating-chat-bottom) + ${bubbleBox.h}px + ${FLOATING_LIST_GAP_ABOVE_BUBBLE_PX}px + env(safe-area-inset-bottom, 0px))`,
    [bubbleBox.h],
  );

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
          {instancesLoading && instanceIds.length === 0 ? (
            <FloatingChatListShellLoading className="h-full min-h-0" />
          ) : (
            <FloatingConversationList className="h-full min-h-0" />
          )}
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
            <button
              ref={bubbleButtonRef}
              type="button"
              className={cn(
                'relative flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border-2 border-blue-500 bg-zinc-800 py-2 pl-3 pr-2',
                'shadow-lg transition hover:bg-zinc-800/95 hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              )}
              onClick={() => toggleList()}
              aria-label="Mensagens, abrir lista de conversas"
            >
              <span className="relative shrink-0">
                <Filter
                  className="h-5 w-5 text-white"
                  strokeWidth={2}
                  aria-hidden
                />
                {bubbleUnread > 0 ? (
                  <Badge
                    variant="destructive"
                    className="absolute -right-2 -top-2 flex h-[1.125rem] min-w-[1.125rem] justify-center px-1 text-[10px] font-bold tabular-nums leading-none"
                  >
                    {bubbleUnread > 99 ? '99+' : bubbleUnread}
                  </Badge>
                ) : null}
              </span>
              <span className="hidden text-sm font-bold tracking-tight text-white sm:inline">Mensagens</span>
              {bubbleRecentPreview.slice.length > 0 ? (
                <span className="flex shrink-0 items-center pl-0.5" aria-hidden>
                  {bubbleRecentPreview.slice.map((c, i) => {
                    const id = resolveConversationIdentity(c, null, null);
                    return (
                      <Avatar
                        key={c.id}
                        className={cn(
                          'h-7 w-7 border-2 border-zinc-800 bg-zinc-700',
                          i > 0 && '-ml-2',
                        )}
                        style={{ zIndex: 3 - i }}
                      >
                        {id.avatarUrl ? (
                          <AvatarImage src={id.avatarUrl} alt="" className="object-cover" />
                        ) : null}
                        <AvatarFallback className="text-[9px] font-semibold text-white">{id.initials}</AvatarFallback>
                      </Avatar>
                    );
                  })}
                  {bubbleRecentPreview.hasMore ? (
                    <span
                      className="-ml-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-zinc-800 bg-zinc-700 text-white"
                      style={{ zIndex: 4 }}
                    >
                      <MoreHorizontal className="h-4 w-4 opacity-90" strokeWidth={2.5} />
                    </span>
                  ) : null}
                </span>
              ) : null}
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">Mensagens</TooltipContent>
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
