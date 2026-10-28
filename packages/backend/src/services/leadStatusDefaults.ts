import { pool } from '../utils/db.js';

/** Mesma lista exibida em /leads quando a conta ainda não tem fases salvas. */
export const DEFAULT_LEAD_STATUSES = [
  { name: 'Novo', color: '#6E56CF' },
  { name: 'Em contato', color: '#F59E0B' },
  { name: 'Qualificado', color: '#10B981' },
  { name: 'Perdido', color: '#EF4444' },
] as const;

/**
 * Grava as fases padrão só quando a conta não tem nenhuma.
 * created_at mais recente em Novo, para a listagem (created_at DESC) seguir essa ordem.
 */
export async function ensureDefaultLeadStatuses(tenantId: string, userId: string): Promise<void> {
  if (!tenantId || !userId) return;

  const names = DEFAULT_LEAD_STATUSES.map((status) => status.name);
  const colors = DEFAULT_LEAD_STATUSES.map((status) => status.color);

  await pool.query(
    `INSERT INTO lead_statuses (user_id, name, color, created_at, updated_at)
     SELECT $1, v.name, v.color, now() + ((cardinality($2::text[]) - v.ord) * interval '1 millisecond'), now()
     FROM unnest($2::text[], $3::text[]) WITH ORDINALITY AS v(name, color, ord)
     WHERE NOT EXISTS (
       SELECT 1
       FROM lead_statuses ls
       INNER JOIN users u ON u.id = ls.user_id AND u.tenant_id = $4
     )`,
    [userId, names, colors, tenantId]
  );
}
