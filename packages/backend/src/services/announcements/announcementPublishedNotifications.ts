import { pool } from '../../utils/db.js';

const DEFAULT_MESSAGE = 'Confira as novidades e melhorias da plataforma.';

/**
 * Após publicar um anúncio do tipo página de atualizações, cria notificação in-app
 * para utilizadores elegíveis (por tenant / grupo de visibilidade).
 * Idempotente: não duplica (user_id + entity_id announcement) — vê índice único parcial.
 */
export async function notifyEligibleUsersForPublishedAnnouncement(announcementId: string): Promise<void> {
  const head = await pool.query<{
    id: string;
    title: string;
    type: string;
    page_summary: string | null;
    visibility_group_id: string | null;
    status: string;
  }>(
    `SELECT id::text, title, type, page_summary, visibility_group_id::text, status
     FROM announcements WHERE id = $1::uuid LIMIT 1`,
    [announcementId]
  );
  const row = head.rows[0];
  if (!row || row.status !== 'published') return;
  if (row.type !== 'whatsapp_and_updates_page') return;

  const title = `Nova atualização: ${row.title}`;
  const message = (row.page_summary && row.page_summary.trim()) || DEFAULT_MESSAGE;
  const href = `/updates/${row.id}`;
  const data = JSON.stringify({
    announcement_id: row.id,
    kind: 'announcement',
    href,
  });

  const visibilityGroupId = row.visibility_group_id;

  await pool.query(
    `INSERT INTO notifications (
       user_id, tenant_id, type, title, message, href, entity_type, entity_id, data, read
     )
     SELECT
       u.id,
       u.tenant_id,
       'announcement',
       $2,
       $3,
       $4,
       'announcement',
       $1::uuid,
       $5::jsonb,
       false
     FROM users u
     WHERE u.tenant_id IS NOT NULL
       AND COALESCE(u.is_super_admin, false) = false
       AND (
         $6::uuid IS NULL
         OR EXISTS (
           SELECT 1 FROM announcement_group_members m
           WHERE m.group_id = $6::uuid AND m.tenant_id = u.tenant_id
         )
       )
       AND NOT EXISTS (
         SELECT 1 FROM notifications n
         WHERE n.user_id = u.id
           AND n.entity_type = 'announcement'
           AND n.entity_id = $1::uuid
       )`,
    [announcementId, title, message, href, data, visibilityGroupId]
  );
}
