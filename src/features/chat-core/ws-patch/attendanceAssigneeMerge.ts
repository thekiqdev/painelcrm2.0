/**
 * Merge de campos de assignee no atendimento.
 * Fonte de verdade: `assigned_to_user_id`.
 * - `null` explícito → limpa assignee_* (evita foto fantasma até o F5)
 * - id novo → aplica display/avatar do patch quando vierem; senão preserva se for o mesmo agente
 * - `undefined` → campo ausente no patch (preserva)
 */

export type AttendanceAssigneeSlice = {
  assigned_to_user_id?: string | null;
  assignee_email?: string | null;
  assignee_display?: string | null;
  assignee_avatar_url?: string | null;
};

export function mergeAttendanceAssigneeFields(
  prev: AttendanceAssigneeSlice,
  incoming: AttendanceAssigneeSlice,
): Required<AttendanceAssigneeSlice> {
  if (incoming.assigned_to_user_id === null || incoming.assigned_to_user_id === '') {
    return {
      assigned_to_user_id: null,
      assignee_email: null,
      assignee_display: null,
      assignee_avatar_url: null,
    };
  }

  const nextId =
    incoming.assigned_to_user_id !== undefined
      ? incoming.assigned_to_user_id
      : (prev.assigned_to_user_id ?? null);

  const sameAgent =
    Boolean(nextId) &&
    Boolean(prev.assigned_to_user_id) &&
    String(nextId) === String(prev.assigned_to_user_id);

  const pick = (
    key: 'assignee_email' | 'assignee_display' | 'assignee_avatar_url',
  ): string | null => {
    if (incoming[key] !== undefined) {
      const v = incoming[key];
      if (typeof v === 'string' && v.trim()) return v;
      // null explícito: limpa só se mudou de agente; mesmo agente preserva (patch incompleto)
      if (v == null && sameAgent) return prev[key] ?? null;
      return v ?? null;
    }
    return prev[key] ?? null;
  };

  return {
    assigned_to_user_id: nextId,
    assignee_email: pick('assignee_email'),
    assignee_display: pick('assignee_display'),
    assignee_avatar_url: pick('assignee_avatar_url'),
  };
}
