import type { PoolClient } from 'pg';

/** Mensagem do cliente (portal público). */
export function isCustomerTicketMessage(metadata: unknown): boolean {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    return (metadata as Record<string, unknown>).source === 'public_portal';
  }
  return false;
}

const TERMINAL_STATUSES = new Set(['closed', 'cancelled']);

/**
 * Efeitos após mensagem de suporte (CRM): auto-assignee e status aguardando cliente.
 * Notas internas só atribuem responsável, sem mudar status.
 */
export async function applySupportMessageSideEffects(
  db: PoolClient,
  ticketId: string,
  supportUserId: string,
  visibility: string,
  currentStatus: string,
  currentAssigneeId: string | null
): Promise<void> {
  const isPublic = visibility === 'public';
  const nextAssignee = currentAssigneeId ?? supportUserId;
  let nextStatus = currentStatus;

  if (isPublic && !TERMINAL_STATUSES.has(currentStatus)) {
    nextStatus = 'waiting_customer';
  }

  await db.query(
    `UPDATE tickets
     SET assignee_id = $2::uuid,
         status = $3::ticket_status,
         updated_at = now()
     WHERE id = $1::uuid`,
    [ticketId, nextAssignee, nextStatus]
  );
}

/**
 * Efeitos após mensagem do cliente: reabrir fluxo (status open) se aplicável.
 */
export async function applyCustomerMessageSideEffects(
  db: PoolClient,
  ticketId: string,
  currentStatus: string
): Promise<void> {
  const reopenStatuses = new Set([
    'new',
    'open',
    'waiting_customer',
    'pending',
    'in_progress',
    'resolved',
  ]);

  if (!reopenStatuses.has(currentStatus)) {
    await db.query(
      `UPDATE tickets
       SET last_customer_reply_at = now(), updated_at = now()
       WHERE id = $1::uuid`,
      [ticketId]
    );
    return;
  }

  await db.query(
    `UPDATE tickets
     SET status = 'open'::ticket_status,
         last_customer_reply_at = now(),
         updated_at = now()
     WHERE id = $1::uuid`,
    [ticketId]
  );
}
