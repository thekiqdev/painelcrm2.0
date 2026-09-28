import type { ReactNode } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { LucideIcon } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { InboxNotificationRow } from '@/services/systemNotifications';
import { resolveChatNotificationAvatarFromPayload } from '@/lib/chatNotificationAvatar';
import { cn } from '@/lib/utils';

function initialsFromName(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return '?';
  return parts.map((s) => s[0]?.toUpperCase() ?? '').join('') || '?';
}

function formatRelative(whenIso: string): string {
  try {
    return formatDistanceToNow(new Date(whenIso), { addSuffix: true, locale: ptBR });
  } catch {
    return '';
  }
}

type ChatData = {
  contactName?: string;
  phone?: string;
  lastMessagePreview?: string;
  transferFromName?: string;
  attendanceVariant?: string;
  slaSeverity?: string;
  channelBadge?: string;
  queueName?: string;
  teamName?: string;
  isGroup?: boolean;
  /** URL resolvida no backend (WhatsApp / contact / CRM); normalizada com `chatAvatarUrlForImgSrc`. */
  avatarUrl?: string;
  contact_avatar_url?: string;
  conversationId?: string;
};

function asChatData(data: InboxNotificationRow['data']): ChatData {
  if (!data || typeof data !== 'object') return {};
  const d = data as Record<string, unknown>;
  const str = (k: string) => (typeof d[k] === 'string' ? d[k] : undefined);
  return {
    contactName: str('contactName'),
    phone: str('phone'),
    lastMessagePreview: str('lastMessagePreview'),
    transferFromName: str('transferFromName'),
    attendanceVariant: str('attendanceVariant'),
    slaSeverity: str('slaSeverity'),
    channelBadge: str('channelBadge'),
    queueName: str('queueName'),
    teamName: str('teamName'),
    isGroup: d.isGroup === true,
    avatarUrl:
      str('avatarUrl') || str('avatar_url') || str('contact_avatar_url') || str('contactAvatarUrl'),
    contact_avatar_url: str('contact_avatar_url') || str('contactAvatarUrl'),
    conversationId: str('conversationId') || str('conversation_id'),
  };
}

function ChatNotificationAvatar({
  contactName,
  data,
  className,
}: {
  contactName: string;
  data: ChatData;
  className?: string;
}) {
  const src = resolveChatNotificationAvatarFromPayload(data as Record<string, unknown>);
  return (
    <Avatar className={cn('h-10 w-10 shrink-0 border border-border/60', className)}>
      {src ? <AvatarImage src={src} alt="" className="object-cover" /> : null}
      <AvatarFallback className="bg-emerald-600/15 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-100">
        {initialsFromName(contactName)}
      </AvatarFallback>
    </Avatar>
  );
}

function IconAvatar({ Icon, muted }: { Icon: LucideIcon; muted?: boolean }) {
  return (
    <div
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/60',
        muted ? 'bg-muted text-muted-foreground' : 'bg-primary/15 text-primary',
      )}
    >
      <Icon className="h-4 w-4" />
    </div>
  );
}

type ItemShellProps = {
  unread: boolean;
  onClick: () => void;
  left: React.ReactNode;
  badge?: string;
  badgeVariant?: 'default' | 'secondary' | 'destructive' | 'outline';
  title: string;
  description: string | null;
  preview?: string | null;
  subline?: string | null;
  when: string;
};

function systemBadgeForType(type: string): { label: string; variant?: ItemShellProps['badgeVariant'] } | null {
  if (type.includes('invoice') || type === 'payment_failed') {
    return { label: 'Financeiro', variant: type === 'payment_failed' || type === 'invoice_overdue' ? 'destructive' : 'secondary' };
  }
  if (type.includes('ticket')) return { label: 'Ticket', variant: type.includes('sla') ? 'destructive' : 'secondary' };
  if (type.includes('automation') || type === 'kanban_automation') return { label: 'Automação' };
  if (type.includes('task')) return { label: 'Tarefa' };
  if (type.startsWith('agenda_')) return { label: 'Agenda' };
  if (type === 'announcement') return { label: 'Alerta' };
  return null;
}

function NotificationItemShell({
  unread,
  onClick,
  left,
  badge,
  badgeVariant = 'secondary',
  title,
  description,
  preview,
  subline,
  when,
}: ItemShellProps) {
  return (
    <button
      type="button"
      className={cn(
        'flex w-full gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors last:border-b-0',
        'hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        unread && 'bg-muted/45',
      )}
      onClick={onClick}
    >
      {left}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold leading-snug text-foreground">{title}</p>
          {badge ? (
            <Badge variant={badgeVariant} className="h-5 px-1.5 text-[10px] font-medium">
              {badge}
            </Badge>
          ) : null}
          {unread ? (
            <span className="h-2 w-2 shrink-0 rounded-full bg-primary" title="Não lida" aria-hidden />
          ) : null}
        </div>
        {description ? <p className="text-xs text-muted-foreground leading-snug">{description}</p> : null}
        {preview ? (
          <p className="text-xs text-foreground/85 line-clamp-2 border-l-2 border-muted-foreground/25 pl-2">
            {preview}
          </p>
        ) : null}
        {subline ? <p className="text-[11px] text-muted-foreground">{subline}</p> : null}
        {when ? <p className="text-[11px] text-muted-foreground">{when}</p> : null}
      </div>
    </button>
  );
}

export function ChatMessageNotificationItem({
  n,
  onClick,
  variant = 'message',
}: {
  n: InboxNotificationRow;
  onClick: () => void;
  variant?: 'message' | 'conversation';
}) {
  const d = asChatData(n.data);
  const contact = d.contactName?.trim() || 'Contato WhatsApp';
  const phoneSub = d.phone?.trim() && contact !== d.phone?.trim() ? d.phone : null;
  const preview = d.lastMessagePreview?.trim() || 'Nova interação recebida.';
  const when = formatRelative(n.created_at);
  const badge = variant === 'conversation' ? 'Nova conversa' : 'Mensagem';
  return (
    <NotificationItemShell
      unread={!n.read}
      onClick={onClick}
      left={<ChatNotificationAvatar contactName={contact} data={d} />}
      badge={badge}
      title={n.title}
      description={n.message}
      preview={preview}
      subline={phoneSub}
      when={when}
    />
  );
}

export function ChatAssignedNotificationItem({
  n,
  onClick,
}: {
  n: InboxNotificationRow;
  onClick: () => void;
}) {
  const d = asChatData(n.data);
  const contact = d.contactName?.trim() || 'Contato WhatsApp';
  const phoneSub = d.phone?.trim() && contact !== d.phone?.trim() ? d.phone : null;
  const preview = d.lastMessagePreview?.trim() || 'Nova interação recebida.';
  const when = formatRelative(n.created_at);
  return (
    <NotificationItemShell
      unread={!n.read}
      onClick={onClick}
      left={<ChatNotificationAvatar contactName={contact} data={d} />}
      badge="Nova conversa"
      title="Nova conversa atribuída a você"
      description={n.message}
      preview={preview}
      subline={phoneSub}
      when={when}
    />
  );
}

export function ChatTransferredNotificationItem({
  n,
  onClick,
}: {
  n: InboxNotificationRow;
  onClick: () => void;
}) {
  const d = asChatData(n.data);
  const contact = d.contactName?.trim() || 'Contato WhatsApp';
  const preview = d.lastMessagePreview?.trim() || 'Nova interação recebida.';
  const when = formatRelative(n.created_at);
  const isTeam = d.attendanceVariant === 'transferred_team';
  const badge =
    d.channelBadge?.trim() || (isTeam ? (d.queueName?.trim() ? 'Fila' : 'Equipe') : 'Transferência');
  const transferLine =
    d.transferFromName?.trim() && !isTeam ? `Transferida por ${d.transferFromName}` : null;
  return (
    <NotificationItemShell
      unread={!n.read}
      onClick={onClick}
      left={<ChatNotificationAvatar contactName={contact} data={d} />}
      badge={badge}
      title={n.title}
      description={n.message}
      preview={preview}
      subline={transferLine}
      when={when}
    />
  );
}

export function ChatSlaNotificationItem({
  n,
  onClick,
}: {
  n: InboxNotificationRow;
  onClick: () => void;
}) {
  const d = asChatData(n.data);
  const contact = d.contactName?.trim() || 'Contato WhatsApp';
  const preview = d.lastMessagePreview?.trim() || 'Nova interação recebida.';
  const when = formatRelative(n.created_at);
  const overdue = d.slaSeverity === 'overdue';
  return (
    <NotificationItemShell
      unread={!n.read}
      onClick={onClick}
      left={<ChatNotificationAvatar contactName={contact} data={d} />}
      badge={overdue ? 'Crítico' : 'Atenção'}
      badgeVariant={overdue ? 'destructive' : 'secondary'}
      title={n.title}
      description={n.message}
      preview={preview}
      when={when}
    />
  );
}

export function DefaultNotificationItem({
  n,
  Icon,
  onClick,
}: {
  n: InboxNotificationRow;
  Icon: LucideIcon;
  onClick: () => void;
}) {
  const when = formatRelative(n.created_at);
  const badge = systemBadgeForType(n.type);
  return (
    <NotificationItemShell
      unread={!n.read}
      onClick={onClick}
      left={<IconAvatar Icon={Icon} muted={n.read} />}
      badge={badge?.label}
      badgeVariant={badge?.variant}
      title={n.title}
      description={n.message}
      when={when}
    />
  );
}

export function renderInboxNotificationItem(
  n: InboxNotificationRow,
  Icon: LucideIcon,
  onClick: () => void,
): ReactNode {
  const t = n.type || '';
  if (t === 'new_message') {
    return <ChatMessageNotificationItem key={n.id} n={n} onClick={onClick} variant="message" />;
  }
  if (t === 'new_conversation') {
    return <ChatMessageNotificationItem key={n.id} n={n} onClick={onClick} variant="conversation" />;
  }
  if (t === 'chat_assigned') {
    return <ChatAssignedNotificationItem key={n.id} n={n} onClick={onClick} />;
  }
  if (t === 'chat_transferred') {
    return <ChatTransferredNotificationItem key={n.id} n={n} onClick={onClick} />;
  }
  if (t === 'chat_sla_breach') {
    return <ChatSlaNotificationItem key={n.id} n={n} onClick={onClick} />;
  }
  return <DefaultNotificationItem key={n.id} n={n} Icon={Icon} onClick={onClick} />;
}
