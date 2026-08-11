/**
 * Valores permitidos por `chat_conversations_attendance_status_check` (Fase 5 profissional).
 * Ver database/init/185_chat_engine_phase5_professional.sql
 *
 * Regra de produto (lista): após Encerrar, conversa some da Fila e da lista ativa ("Todas");
 * só reaparece com nova mensagem (inbound → pending/in_progress; outbound agente → inicia de novo).
 * Chip Encerradas continua a listar `closed`/`archived`.
 */
export const CHAT_CONVERSATION_ATTENDANCE_STATUSES = [
  'open',
  'pending',
  'in_progress',
  'waiting_customer',
  'closed',
  'archived',
] as const;

export type ChatConversationAttendanceStatus = (typeof CHAT_CONVERSATION_ATTENDANCE_STATUSES)[number];

const VALID = new Set<string>(CHAT_CONVERSATION_ATTENDANCE_STATUSES);

/**
 * Garante valor persistível em `chat_conversations.attendance_status`.
 * Migração 185 mapeou legado: unassigned/queued → pending, in_service → in_progress.
 */
export function normalizeAttendanceStatusForDb(input: string | null | undefined): ChatConversationAttendanceStatus {
  const raw = typeof input === 'string' ? input.trim().toLowerCase() : '';
  if (!raw) return 'pending';
  if (VALID.has(raw)) return raw as ChatConversationAttendanceStatus;
  if (raw === 'unassigned' || raw === 'queued') return 'pending';
  if (raw === 'in_service') return 'in_progress';
  return 'pending';
}
