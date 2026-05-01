import type { ButtonHTMLAttributes } from 'react';
import { Headphones, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { ChatKanbanBoardCard } from '@/services/chatKanban';
import {
  formatKanbanActivity,
  kanbanAttendanceShort,
  kanbanCardPhoneLine,
  kanbanCardTitle,
  shortOperatorName,
} from '@/utils/chatKanbanCardDisplay';
import { parseKanbanProposalsDisplay } from '@/utils/kanbanColumnRulesUi';
import { chatAvatarUrlForImgSrc } from '@/lib/chatAvatarUrl';
import { cn } from '@/lib/utils';

function kanbanLabelsFromMetadata(meta: unknown): string[] {
  if (!meta || typeof meta !== 'object') return [];
  const raw = (meta as Record<string, unknown>).kanban_labels;
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x).trim()).filter(Boolean);
}

type Props = {
  card: ChatKanbanBoardCard;
  /** Metadata da coluna (`kanban_proposals`). */
  columnMetadata?: Record<string, unknown> | null;
  onClick: () => void;
  /** Atributos/listeners do @dnd-kit (PointerSensor com distância evita conflito com clique). */
  dragHandleProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  /** Destaque animado após nova mensagem recebida (alguns segundos). */
  pulseUnreadHighlight?: boolean;
};

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

export function ChatKanbanCard({
  card,
  columnMetadata,
  onClick,
  dragHandleProps,
  pulseUnreadHighlight = false,
}: Props) {
  const title = kanbanCardTitle(card);
  const phone = kanbanCardPhoneLine(card);
  const preview = (card.conv_last_message_preview || '').trim() || 'Sem mensagens ainda';
  const when = formatKanbanActivity(card.conv_last_message_at);
  const unread = Math.max(0, Number(card.conv_unread_count ?? 0));
  const att = kanbanAttendanceShort(card.conv_attendance_status);
  const kanbanLabels = kanbanLabelsFromMetadata(card.conv_metadata);
  const pp = parseKanbanProposalsDisplay(columnMetadata);
  const pend = Number(card.proposal_pending_total ?? 0);
  const acc = Number(card.proposal_accepted_total ?? 0);
  const hasCrm = Boolean(card.conv_client_id || card.conv_lead_id);
  const showProposalRow = hasCrm && (pp.show_pending || pp.show_accepted);
  const convAvatar = chatAvatarUrlForImgSrc(card.conv_avatar_url);

  return (
    <button
      type="button"
      {...dragHandleProps}
      onClick={onClick}
      data-kanban-card-id={card.id}
      data-conversation-id={card.conversation_id}
      data-column-id={card.column_id}
      className={cn(
        'relative w-full text-left rounded-lg border bg-card p-2.5 shadow-sm transition-[box-shadow,border-color,background-color] hover:border-primary/35 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-grab active:cursor-grabbing',
        unread > 0
          ? 'border-sky-500/35 ring-1 ring-sky-500/15 bg-muted/25 dark:border-sky-400/30 dark:ring-sky-400/20'
          : 'border-border/70',
        pulseUnreadHighlight && 'animate-kanban-card-unread-attn motion-reduce:animate-none',
      )}
    >
      {unread > 0 ? (
        <span
          className={cn(
            'absolute -top-1.5 -right-1.5 z-[1] flex h-[1.35rem] min-w-[1.35rem] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground shadow-md ring-2 ring-card',
            pulseUnreadHighlight && 'motion-safe:animate-pulse',
          )}
          aria-label={`${unread} mensagens não lidas`}
        >
          {unread > 99 ? '99+' : unread}
        </span>
      ) : null}
      <div className="flex gap-2 min-w-0">
        <Avatar className="h-9 w-9 shrink-0 rounded-md">
          {convAvatar ? (
            <AvatarImage src={convAvatar} alt="" className="object-cover" />
          ) : null}
          <AvatarFallback className="rounded-md bg-primary/10 text-primary text-xs font-semibold">
            {title.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-1">
            <span className="text-sm font-semibold leading-tight truncate">{title}</span>
            {when ? (
              <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">{when}</span>
            ) : null}
          </div>
          {phone && phone !== title ? (
            <p className="text-[11px] text-muted-foreground tabular-nums truncate">{phone}</p>
          ) : null}
          <p className="text-xs text-muted-foreground line-clamp-2 leading-snug">{preview}</p>
          {showProposalRow ? (
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 pt-0.5 text-[10px] text-muted-foreground tabular-nums leading-tight border-t border-border/40 mt-1">
              {pp.show_pending ? <span>Pendente: {formatBrl(pend)}</span> : null}
              {pp.show_accepted ? <span>Aceita: {formatBrl(acc)}</span> : null}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-1 pt-0.5">
            {card.conv_client_id ? (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
                Cliente
              </Badge>
            ) : null}
            {card.conv_lead_id && !card.conv_client_id ? (
              <Badge className="text-[10px] px-1.5 py-0 h-5 bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100">
                Lead
              </Badge>
            ) : null}
            {card.conv_link_state === 'review_required' && !card.conv_client_id && !card.conv_lead_id ? (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-amber-300 text-amber-900">
                Revisar
              </Badge>
            ) : null}
            {card.conv_assigned_team_id && !card.conv_assignee_display && card.conv_assigned_team_name ? (
              <span className="inline-flex items-center gap-0.5 rounded border border-sky-200 bg-sky-50 px-1 py-0 text-[10px] text-sky-900 max-w-[120px]">
                <Users className="h-2.5 w-2.5 shrink-0" aria-hidden />
                <span className="truncate">{card.conv_assigned_team_name}</span>
              </span>
            ) : null}
            {(card.conv_attendance_status === 'in_progress' || card.conv_attendance_status === 'in_service') &&
            card.conv_assignee_display ? (
              <span className="inline-flex items-center gap-0.5 rounded border border-violet-200 bg-violet-50 px-1 py-0 text-[10px] text-violet-900 max-w-[120px]">
                <Headphones className="h-2.5 w-2.5 shrink-0" aria-hidden />
                <span className="truncate">{shortOperatorName(card.conv_assignee_display)}</span>
              </span>
            ) : null}
            {att &&
            !(
              (card.conv_attendance_status === 'in_progress' || card.conv_attendance_status === 'in_service') &&
              card.conv_assignee_display
            ) &&
            !(card.conv_assigned_team_id && !card.conv_assignee_display && card.conv_assigned_team_name) ? (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-violet-200 text-violet-900 bg-violet-50">
                {att}
              </Badge>
            ) : null}
            {kanbanLabels.slice(0, 4).map((label, i) => (
              <Badge
                key={`${label}-${i}`}
                variant="secondary"
                className="text-[10px] px-1.5 py-0 h-5 max-w-[100px] truncate font-normal"
                title={label}
              >
                {label}
              </Badge>
            ))}
            {kanbanLabels.length > 4 ? (
              <span className="text-[10px] text-muted-foreground">+{kanbanLabels.length - 4}</span>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}
