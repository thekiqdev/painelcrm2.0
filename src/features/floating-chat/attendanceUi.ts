import { assigneeInitials, shortOperatorName } from '@/utils/chatKanbanCardDisplay';

/** Rótulo curto para estado de atendimento (Etapa 5) — alinhado ao /chat. */
export function floatingAttendanceLabel(s?: string | null): string | null {
  switch (s) {
    case 'open':
    case 'pending':
      return 'Aberto';
    case 'unassigned':
      return 'Sem resp.';
    case 'queued':
      return 'Na fila';
    case 'in_progress':
    case 'in_service':
      return 'Em atendimento';
    case 'waiting_customer':
      return 'Aguardando';
    case 'closed':
      return 'Encerrada';
    case 'archived':
      return 'Arquivada';
    default:
      return null;
  }
}

export type FloatingAttendanceRowModel =
  | { kind: 'assignee'; shortName: string; initials: string; avatarUrl: string | null }
  | { kind: 'status'; label: string };

/** Float / mobile: em atendimento mostra operador (nome + foto opcional); outros estados mantêm rótulo curto. */
export function floatingAttendanceRowModel(conv: {
  attendance_status?: string | null;
  assignee_display?: string | null;
  assignee_avatar_url?: string | null;
} | null | undefined): FloatingAttendanceRowModel | null {
  if (!conv) return null;
  const st = conv.attendance_status;
  const inProg = st === 'in_progress' || st === 'in_service';
  if (inProg) {
    const disp = conv.assignee_display?.trim();
    if (disp) {
      return {
        kind: 'assignee',
        shortName: shortOperatorName(disp),
        initials: assigneeInitials(disp),
        avatarUrl: conv.assignee_avatar_url?.trim() || null,
      };
    }
    return { kind: 'status', label: 'Em atendimento' };
  }
  const label = floatingAttendanceLabel(st);
  return label ? { kind: 'status', label } : null;
}
