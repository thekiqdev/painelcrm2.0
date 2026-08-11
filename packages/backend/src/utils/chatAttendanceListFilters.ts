/**
 * Predicados SQL partilhados para listagem/contagens de atendimento.
 * Fila e listas ativas nunca incluem `closed` / `archived`.
 */

/** Lista default ("Todas") e pools ativos: exclui encerradas. */
export function sqlExcludeClosedArchived(alias = 'c'): string {
  return `(${alias}.attendance_status IS NULL OR ${alias}.attendance_status NOT IN ('closed', 'archived'))`;
}

/**
 * Chip Fila / unassigned: sem responsável, status de espera, nunca closed/archived.
 * (IS DISTINCT FROM closed/archived é redundante com o IN, mas documenta a regra de produto.)
 */
export function sqlQueueOrUnassignedAttendance(alias = 'c'): string {
  return `${alias}.assigned_to_user_id IS NULL
          AND (${alias}.attendance_status IS NULL OR ${alias}.attendance_status IN ('pending', 'open'))
          AND (${alias}.attendance_status IS DISTINCT FROM 'closed')
          AND (${alias}.attendance_status IS DISTINCT FROM 'archived')`;
}

export function isClosedOrArchivedAttendanceStatus(
  status: string | null | undefined,
): boolean {
  const s = typeof status === 'string' ? status.trim().toLowerCase() : '';
  return s === 'closed' || s === 'archived';
}
