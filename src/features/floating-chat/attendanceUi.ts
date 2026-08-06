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
      // Sem rótulo genérico — UI usa headset + foto + nome via floatingAttendanceRowModel.
      return null;
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

/** Float / mobile: em atendimento mostra só operador (foto + nome); sem badge «Em atendimento». */
export function floatingAttendanceRowModel(conv: {
  attendance_status?: string | null;
  assigned_to_user_id?: string | null;
  assignee_display?: string | null;
  assignee_avatar_url?: string | null;
} | null | undefined): FloatingAttendanceRowModel | null {
  if (!conv) return null;
  const st = conv.attendance_status;
  const inProg = st === 'in_progress' || st === 'in_service';
  if (inProg) {
    const disp = conv.assignee_display?.trim() || (conv.assigned_to_user_id ? 'Atendente' : '');
    if (!disp) return null;
    return {
      kind: 'assignee',
      shortName: shortOperatorName(disp),
      initials: assigneeInitials(disp),
      avatarUrl: conv.assignee_avatar_url?.trim() || null,
    };
  }
  const label = floatingAttendanceLabel(st);
  return label ? { kind: 'status', label } : null;
}
