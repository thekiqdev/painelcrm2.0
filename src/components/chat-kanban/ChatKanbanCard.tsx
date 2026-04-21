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
};

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

export function ChatKanbanCard({ card, columnMetadata, onClick, dragHandleProps }: Props) {
  const title = kanbanCardTitle(card);
  const phone = kanbanCardPhoneLine(card);
  const preview = (card.conv_last_message_preview || '').trim() || 'Sem mensagens ainda';
  const when = formatKanbanActivity(card.conv_last_message_at);
  const unread = card.conv_unread_count ?? 0;
  const att = kanbanAttendanceShort(card.conv_attendance_status);
  const kanbanLabels = kanbanLabelsFromMetadata(card.conv_metadata);
  const pp = parseKanbanProposalsDisplay(columnMetadata);
  const pend = Number(card.proposal_pending_total ?? 0);
  const acc = Number(card.proposal_accepted_total ?? 0);
  const hasCrm = Boolean(card.conv_client_id || card.conv_lead_id);
  const showProposalRow = hasCrm && (pp.show_pending || pp.show_accepted);

  return (
    <button
      type="button"
      {...dragHandleProps}
      onClick={onClick}
      data-kanban-card-id={card.id}
      data-conversation-id={card.conversation_id}
      data-column-id={card.column_id}
      className="w-full text-left rounded-lg border border-border/70 bg-card p-2.5 shadow-sm transition-colors hover:border-primary/35 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-grab active:cursor-grabbing"
    >
      <div className="flex gap-2 min-w-0">
        <Avatar className="h-9 w-9 shrink-0 rounded-md">
          {card.conv_avatar_url ? (
            <AvatarImage src={card.conv_avatar_url} alt="" className="object-cover" />
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
            {unread > 0 ? (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-5">
                {unread > 99 ? '99+' : unread} nova{unread === 1 ? '' : 's'}
              </Badge>
            ) : null}
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
            {card.conv_attendance_status === 'in_service' && card.conv_assignee_display ? (
              <span className="inline-flex items-center gap-0.5 rounded border border-violet-200 bg-violet-50 px-1 py-0 text-[10px] text-violet-900 max-w-[120px]">
                <Headphones className="h-2.5 w-2.5 shrink-0" aria-hidden />
                <span className="truncate">{shortOperatorName(card.conv_assignee_display)}</span>
              </span>
            ) : null}
            {att &&
            !(card.conv_attendance_status === 'in_service' && card.conv_assignee_display) &&
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
