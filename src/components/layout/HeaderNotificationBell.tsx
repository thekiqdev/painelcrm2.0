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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

type NotificationTab = 'system' | 'message';

type NotificationDisplayEntry =
  | { kind: 'single'; notification: InboxNotificationRow }
  | { kind: 'group'; notifications: InboxNotificationRow[]; notification: InboxNotificationRow };

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
  const [activeTab, setActiveTab] = useState<NotificationTab>('system');
  const [messageUnreadCount, setMessageUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const loadList = useCallback(async (category: NotificationTab = activeTab) => {
    setLoading(true);
    try {
      const [list, messageUnread] = await Promise.all([
        systemNotificationsService.list(40, category),
        systemNotificationsService.unreadCount('message'),
      ]);
      setItems(list);
      setMessageUnreadCount(messageUnread);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) void loadList(activeTab);
  };

  const { unreadItems, readItems } = useMemo(() => {
    const unread = items.filter((x) => !x.read);
    const read = items.filter((x) => x.read);
    return { unreadItems: unread, readItems: read };
  }, [items]);

  const groupMessageItems = useCallback((list: InboxNotificationRow[]): NotificationDisplayEntry[] => {
    if (activeTab !== 'message') return list.map((notification) => ({ kind: 'single', notification }));
    const groups = new Map<string, InboxNotificationRow[]>();
    const order: string[] = [];
    for (const item of list) {
      const d = item.data && typeof item.data === 'object' ? (item.data as Record<string, unknown>) : {};
      const conversationId = typeof d.conversationId === 'string' ? d.conversationId : '';
      const contactName = typeof d.contactName === 'string' ? d.contactName : '';
      const phone = typeof d.phone === 'string' ? d.phone : '';
      const key = conversationId || phone || contactName || item.id;
      if (!groups.has(key)) {
        groups.set(key, []);
        order.push(key);
      }
      groups.get(key)!.push(item);
    }
    return order.map((key) => {
      const group = groups.get(key)!;
      if (group.length <= 1) return { kind: 'single', notification: group[0] };
      const unread = group.filter((x) => !x.read).length;
      const base = group[0];
      const d = base.data && typeof base.data === 'object' ? (base.data as Record<string, unknown>) : {};
      const contact = (typeof d.contactName === 'string' && d.contactName.trim()) || base.title || 'Contato';
      return {
        kind: 'group',
        notifications: group,
        notification: {
          ...base,
          title: unread > 0 ? `${contact} (${unread} novas mensagens)` : contact,
          message: unread > 0 ? 'Mensagens agrupadas do mesmo contato.' : 'Conversas recentes agrupadas por contato.',
        },
      };
    });
  }, [activeTab]);

  const unreadEntries = useMemo(() => groupMessageItems(unreadItems), [groupMessageItems, unreadItems]);
  const readEntries = useMemo(() => groupMessageItems(readItems), [groupMessageItems, readItems]);

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

  const handleEntryClick = async (entry: NotificationDisplayEntry) => {
    if (entry.kind === 'single') {
      await handleClick(entry.notification);
      return;
    }
    const unread = entry.notifications.filter((x) => !x.read);
    try {
      await Promise.all(unread.map((x) => systemNotificationsService.markRead(x.id)));
    } catch {
      /* navega mesmo assim */
    }
    emitInAppNotificationsRefresh();
    setOpen(false);
    navigateNotificationHref(resolveNotificationHref(entry.notification), isMobile, navigate, {
      openConversationInContext,
      openChatForClient,
      openChatForLead,
    });
  };

  const handleMarkAll = async () => {
    try {
      await systemNotificationsService.markAllRead(activeTab);
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

  const renderItem = (n: InboxNotificationRow, onClick?: () => void) => {
    const Icon = iconForNotificationType(n.type);
    return renderInboxNotificationItem(n, Icon, onClick ?? (() => void handleClick(n)));
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
                <p className="text-sm font-semibold leading-none">Centro de notificações</p>
                <p className="text-xs text-muted-foreground">
                  {activeTab === 'system'
                    ? unreadCount > 0 ? `${unreadCount} alerta(s) de sistema` : 'Sistema em dia'
                    : messageUnreadCount > 0 ? `${messageUnreadCount} mensagem(ns) não lida(s)` : 'Sem mensagens pendentes'}
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
                      setOpen(false);
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
            <Tabs
              value={activeTab}
              onValueChange={(value) => {
                const next = value === 'message' ? 'message' : 'system';
                setActiveTab(next);
                void loadList(next);
              }}
              className="mt-3"
            >
              <TabsList className="grid h-9 w-full grid-cols-2">
                <TabsTrigger value="system" className="text-xs">
                  Sistema
                  {unreadCount > 0 ? (
                    <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] leading-none text-primary-foreground">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  ) : null}
                </TabsTrigger>
                <TabsTrigger value="message" className="text-xs">
                  Mensagens
                  {messageUnreadCount > 0 ? (
                    <span className="ml-1.5 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] leading-none text-white">
                      {messageUnreadCount > 99 ? '99+' : messageUnreadCount}
                    </span>
                  ) : null}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {loading ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">A carregar…</p>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Inbox className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  {activeTab === 'system' ? 'Sem alertas de sistema' : 'Sem mensagens'}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {activeTab === 'system'
                    ? 'Financeiro, tickets, automações, tarefas e alertas aparecem aqui.'
                    : 'WhatsApp, chat e conversas aparecem agrupados nesta aba.'}
                </p>
              </div>
            ) : (
              <div className="pb-1">
                {unreadItems.length > 0 ? (
                  <div>
                    <p className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Não lidas
                    </p>
                    {unreadEntries.map((entry) =>
                      renderItem(entry.notification, () => void handleEntryClick(entry))
                    )}
                  </div>
                ) : null}
                {readItems.length > 0 ? (
                  <div>
                    {unreadItems.length > 0 ? (
                      <p className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Recentes
                      </p>
                    ) : null}
                    {readEntries.map((entry) =>
                      renderItem(entry.notification, () => void handleEntryClick(entry))
                    )}
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
