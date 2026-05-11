import { pool } from '../../utils/db.js';

const TYPE_SUPERADMIN_NEW = 'platform_support_new_ticket';
const TYPE_CUSTOMER_REPLY = 'platform_support.ticket_replied';

async function getSuperAdminUserIds(): Promise<string[]> {
  const result = await pool.query('SELECT id FROM users WHERE is_super_admin = true');
  return result.rows.map((r: { id: string }) => r.id);
}

export async function notifySuperAdminsPlatformSupportTicket(params: {
  ticketId: string;
  tenantId: string;
  tenantName: string;
  subject: string;
}): Promise<void> {
  try {
    const userIds = await getSuperAdminUserIds();
    for (const userId of userIds) {
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, data, read)
         VALUES ($1, $2, $3, $4, $5, false)`,
        [
          userId,
          TYPE_SUPERADMIN_NEW,
          'Novo chamado de suporte',
          `${params.tenantName}: ${params.subject}`,
          JSON.stringify({
            ticket_id: params.ticketId,
            tenant_id: params.tenantId,
            tenant_name: params.tenantName,
            action_url: `/superadmin/platform-support/tickets/${params.ticketId}`,
          }),
        ],
      );
    }
  } catch (e) {
    console.error('[platformSupport] notifySuperAdminsPlatformSupportTicket', e);
  }
}

export async function notifyCustomerPlatformSupportReply(params: {
  userId: string;
  ticketId: string;
  subject: string;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, data, read)
       VALUES ($1, $2, $3, $4, $5, false)`,
      [
        params.userId,
        TYPE_CUSTOMER_REPLY,
        'Resposta do suporte PainelCRM',
        `Há uma nova resposta no chamado: ${params.subject}`,
        JSON.stringify({
          ticket_id: params.ticketId,
          action_url: `/suporte/${params.ticketId}`,
        }),
      ],
    );
  } catch (e) {
    console.error('[platformSupport] notifyCustomerPlatformSupportReply', e);
  }
}
