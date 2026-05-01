import { useCallback, useMemo, useState } from 'react';
import { useNavigate, type NavigateFunction } from 'react-router-dom';
import {
  Bell,
  CalendarClock,
  ClipboardList,
  FileSignature,
  FileText,
  Inbox,
  LayoutGrid,
  Megaphone,
  MessageSquare,
  Receipt,
  Shield,
  Ticket,
  UserPlus,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/components/ui/sonner';
import {
  type InboxNotificationRow,
  emitInAppNotificationsRefresh,
  resolveNotificationHref,
  systemNotificationsService,
} from '@/services/systemNotifications';
import { renderInboxNotificationItem } from '@/components/notifications/InboxNotificationItems';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useFloatingChat } from '@/features/floating-chat';

/** Mobile: abre overlay sem navegar para `/chat` quando o href é uma conversa CRM. */
function navigateNotificationHref(
  href: string,
  isMobile: boolean,
  navigate: NavigateFunction,
  chat: {
    openConversationInContext: (id: string) => void;
    openChatForClient: (id: string) => Promise<void>;
    openChatForLead: (id: string) => Promise<void>;
  },
): void {
  if (!isMobile) {
    navigate(href);
    return;
  }
  let url: URL;
  try {
    url = new URL(href, typeof window !== 'undefined' ? window.location.origin : 'http://local');
  } catch {
    navigate(href);
    return;
  }
  const path = (url.pathname.replace(/\/$/, '') || '/').toLowerCase();
  if (path === '/chat') {
    const cid = url.searchParams.get('conversationId')?.trim();
    if (cid) {
      chat.openConversationInContext(cid);
      return;
    }
    const openClientId = url.searchParams.get('openClientId')?.trim();
    if (openClientId) {
      void chat.openChatForClient(openClientId);
      return;
    }
    const openLeadId = url.searchParams.get('openLeadId')?.trim();
    if (openLeadId) {
      void chat.openChatForLead(openLeadId);
      return;
    }
    navigate(href);
    return;
  }
  const segMatch = /^\/chat\/([^/]+)$/i.exec(url.pathname);
  if (segMatch?.[1]) {
    chat.openConversationInContext(segMatch[1]);
    return;
  }
  navigate(href);
}

type Props = {
  unreadCount: number;
};

function iconForNotificationType(type: string): LucideIcon {
  const t = type || '';
  if (t === 'announcement') return Megaphone;
  if (t === 'agenda_reminder') return CalendarClock;
  if (t === 'crm_proposal') return FileText;
  if (t === 'kanban_automation') return LayoutGrid;
  if (t === 'lead_updated') return UserPlus;
  if (
    t === 'new_message' ||
    t === 'message_delivered' ||
    t === 'message_read' ||
    t === 'new_conversation'
  ) {
    return MessageSquare;
  }
  if (t === 'chat_assigned' || t === 'chat_transferred' || t === 'chat_sla_breach') {
    return MessageSquare;
  }
  if (t.startsWith('superadmin_')) return Shield;
  if (t.includes('invoice')) return Receipt;
  if (t.includes('contract')) return FileSignature;
  if (t.includes('task')) return ClipboardList;
  if (t.includes('ticket')) return Ticket;
  return Bell;
}

export function HeaderNotificationBell({ unreadCount }: Props) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { openConversationInContext, openChatForClient, openChatForLead } = useFloatingChat();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InboxNotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const list = await systemNotificationsService.list(40);
      setItems(list);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) void loadList();
  };

  const { unreadItems, readItems } = useMemo(() => {
    const unread = items.filter((x) => !x.read);
    const read = items.filter((x) => x.read);
    return { unreadItems: unread, readItems: read };
  }, [items]);

  const handleClick = async (n: InboxNotificationRow) => {
    const href = resolveNotificationHref(n);
    try {
      if (!n.read) {
        await systemNotificationsService.markRead(n.id);
      }
    } catch {
      /* navega mesmo assim */
    }
    emitInAppNotificationsRefresh();
    setOpen(false);
    navigateNotificationHref(href, isMobile, navigate, {
      openConversationInContext,
      openChatForClient,
      openChatForLead,
    });
  };

  const handleMarkAll = async () => {
    try {
      await systemNotificationsService.markAllRead();
      toast.success('Todas marcadas como lidas');
    } catch {
      toast.error('Não foi possível marcar como lidas');
    }
    emitInAppNotificationsRefresh();
    void loadList();
  };

  const handleClearAll = async () => {
    setClearing(true);
    try {
      await systemNotificationsService.clearAll();
      setItems([]);
      toast.success('Notificações limpas');
      setClearOpen(false);
      emitInAppNotificationsRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível limpar');
    } finally {
      setClearing(false);
    }
  };

  const showBadge = unreadCount > 0;
  const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount);

  const renderItem = (n: InboxNotificationRow) => {
    const Icon = iconForNotificationType(n.type);
    return renderInboxNotificationItem(n, Icon, () => void handleClick(n));
  };

  return (
    <>
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
            <Bell className="h-5 w-5" />
            {showBadge ? (
              <Badge
                className={cn(
                  'absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center px-1',
                  'border-2 border-background bg-red-500 text-[10px] text-white',
                )}
              >
                {badgeLabel}
              </Badge>
            ) : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="flex max-h-[min(70dvh,32rem)] w-[min(100vw-2rem,26rem)] flex-col overflow-hidden p-0"
          sideOffset={8}
        >
          <div className="shrink-0 border-b border-border px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-semibold leading-none">Notificações</p>
                <p className="text-xs text-muted-foreground">
                  {unreadCount > 0 ? `${unreadCount} não lida(s)` : 'Nenhuma não lida'}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1">
                {items.length > 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs text-muted-foreground"
                    onClick={(e) => {
                      e.preventDefault();
                      setClearOpen(true);
                    }}
                  >
                    Limpar
                  </Button>
                ) : null}
                {items.some((x) => !x.read) ? (
                  <Button variant="secondary" size="sm" className="h-8 px-2 text-xs" onClick={() => void handleMarkAll()}>
                    Marcar lidas
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {loading ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">A carregar…</p>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Inbox className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">Sem notificações</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Quando houver novidades, anúncios ou alertas, aparecem aqui.
                </p>
              </div>
            ) : (
              <div className="pb-1">
                {unreadItems.length > 0 ? (
                  <div>
                    <p className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Não lidas
                    </p>
                    {unreadItems.map(renderItem)}
                  </div>
                ) : null}
                {readItems.length > 0 ? (
                  <div>
                    {unreadItems.length > 0 ? (
                      <p className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Recentes
                      </p>
                    ) : null}
                    {readItems.map(renderItem)}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar notificações?</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja limpar todas as notificações? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={clearing}
              onClick={(e) => {
                e.preventDefault();
                void handleClearAll();
              }}
            >
              {clearing ? 'A limpar…' : 'Limpar tudo'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
