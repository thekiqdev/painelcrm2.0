import { pool } from '../../utils/db.js';
import {
  applyWhatsappTemplate,
  buildWhatsappUrl,
  maskBrazilWhatsappNumber,
  normalizeBrazilWhatsappNumber,
} from './platformSupportWhatsapp.js';

export type PlatformSupportSettingsRow = {
  id: string;
  whatsapp_number: string | null;
  whatsapp_message_template: string;
  support_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type PlatformSupportTicketRow = {
  id: string;
  tenant_id: string;
  created_by_user_id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  tenant_name?: string;
  created_by_email?: string;
};

export type PlatformSupportMessageRow = {
  id: string;
  ticket_id: string;
  sender_type: 'customer' | 'superadmin';
  sender_user_id: string | null;
  message: string;
  attachments: unknown[];
  created_at: string;
  sender_email?: string | null;
};

export async function getPlatformSupportSettingsRow(): Promise<PlatformSupportSettingsRow | null> {
  const result = await pool.query<PlatformSupportSettingsRow>(
    `SELECT id, whatsapp_number, whatsapp_message_template, support_enabled, created_at, updated_at
     FROM platform_support_settings
     ORDER BY created_at ASC
     LIMIT 1`,
  );
  return result.rows[0] ?? null;
}

export async function upsertPlatformSupportSettings(input: {
  support_enabled?: boolean;
  whatsapp_number?: string | null;
  whatsapp_message_template?: string;
}): Promise<PlatformSupportSettingsRow> {
  const existing = await getPlatformSupportSettingsRow();
  const normalizedWa = input.whatsapp_number !== undefined
    ? normalizeBrazilWhatsappNumber(input.whatsapp_number)
    : undefined;

  if (!existing) {
    const ins = await pool.query<PlatformSupportSettingsRow>(
      `INSERT INTO platform_support_settings (whatsapp_number, whatsapp_message_template, support_enabled)
       VALUES ($1, $2, $3)
       RETURNING id, whatsapp_number, whatsapp_message_template, support_enabled, created_at, updated_at`,
      [
        normalizedWa ?? null,
        input.whatsapp_message_template ??
          'Olá, preciso de suporte no PainelCRM. Minha empresa é {{tenant_name}}.',
        input.support_enabled ?? true,
      ],
    );
    return ins.rows[0];
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (input.support_enabled !== undefined) {
    fields.push(`support_enabled = $${i++}`);
    values.push(input.support_enabled);
  }
  if (normalizedWa !== undefined) {
    fields.push(`whatsapp_number = $${i++}`);
    values.push(normalizedWa);
  }
  if (input.whatsapp_message_template !== undefined) {
    fields.push(`whatsapp_message_template = $${i++}`);
    values.push(input.whatsapp_message_template);
  }
  if (fields.length === 0) return existing;

  values.push(existing.id);
  const upd = await pool.query<PlatformSupportSettingsRow>(
    `UPDATE platform_support_settings SET ${fields.join(', ')}, updated_at = now()
     WHERE id = $${i}
     RETURNING id, whatsapp_number, whatsapp_message_template, support_enabled, created_at, updated_at`,
    values,
  );
  return upd.rows[0];
}

export function buildPublicSupportSettings(
  row: PlatformSupportSettingsRow | null,
  tenantName?: string,
) {
  const enabled = row?.support_enabled ?? true;
  const digits = normalizeBrazilWhatsappNumber(row?.whatsapp_number);
  const template =
    row?.whatsapp_message_template ??
    'Olá, preciso de suporte no PainelCRM. Minha empresa é {{tenant_name}}.';
  const message = applyWhatsappTemplate(template, { tenant_name: tenantName });
  return {
    support_enabled: enabled,
    whatsapp_configured: Boolean(digits),
    whatsapp_number_masked: maskBrazilWhatsappNumber(digits),
    whatsapp_url: digits && enabled ? buildWhatsappUrl(digits, message) : null,
    whatsapp_message_preview: message,
  };
}

export async function listTenantPlatformSupportTickets(tenantId: string): Promise<PlatformSupportTicketRow[]> {
  const result = await pool.query<PlatformSupportTicketRow>(
    `SELECT t.*, tn.name AS tenant_name, u.email AS created_by_email
     FROM platform_support_tickets t
     INNER JOIN tenants tn ON tn.id = t.tenant_id
     LEFT JOIN users u ON u.id = t.created_by_user_id
     WHERE t.tenant_id = $1
     ORDER BY t.created_at DESC`,
    [tenantId],
  );
  return result.rows;
}

export async function getTenantPlatformSupportTicket(
  tenantId: string,
  ticketId: string,
): Promise<PlatformSupportTicketRow | null> {
  const result = await pool.query<PlatformSupportTicketRow>(
    `SELECT t.*, tn.name AS tenant_name, u.email AS created_by_email
     FROM platform_support_tickets t
     INNER JOIN tenants tn ON tn.id = t.tenant_id
     LEFT JOIN users u ON u.id = t.created_by_user_id
     WHERE t.tenant_id = $1 AND t.id = $2`,
    [tenantId, ticketId],
  );
  return result.rows[0] ?? null;
}

export async function listPlatformSupportMessages(ticketId: string): Promise<PlatformSupportMessageRow[]> {
  const result = await pool.query<PlatformSupportMessageRow>(
    `SELECT m.*, u.email AS sender_email
     FROM platform_support_ticket_messages m
     LEFT JOIN users u ON u.id = m.sender_user_id
     WHERE m.ticket_id = $1
     ORDER BY m.created_at ASC`,
    [ticketId],
  );
  return result.rows;
}

export async function createPlatformSupportTicket(params: {
  tenantId: string;
  userId: string;
  subject: string;
  category: string;
  priority: string;
  message: string;
}): Promise<PlatformSupportTicketRow> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ins = await client.query<PlatformSupportTicketRow>(
      `INSERT INTO platform_support_tickets (
         tenant_id, created_by_user_id, subject, category, priority, status, message
       ) VALUES ($1, $2, $3, $4, $5, 'open', $6)
       RETURNING *`,
      [params.tenantId, params.userId, params.subject, params.category, params.priority, params.message],
    );
    const ticket = ins.rows[0];
    await client.query(
      `INSERT INTO platform_support_ticket_messages (ticket_id, sender_type, sender_user_id, message)
       VALUES ($1, 'customer', $2, $3)`,
      [ticket.id, params.userId, params.message],
    );
    await client.query('COMMIT');
    return ticket;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function addPlatformSupportCustomerMessage(params: {
  tenantId: string;
  ticketId: string;
  userId: string;
  message: string;
}): Promise<PlatformSupportMessageRow | null> {
  const ticket = await getTenantPlatformSupportTicket(params.tenantId, params.ticketId);
  if (!ticket || ticket.status === 'closed' || ticket.status === 'resolved') return null;
  const ins = await pool.query<PlatformSupportMessageRow>(
    `INSERT INTO platform_support_ticket_messages (ticket_id, sender_type, sender_user_id, message)
     VALUES ($1, 'customer', $2, $3)
     RETURNING *`,
    [params.ticketId, params.userId, params.message],
  );
  await pool.query(
    `UPDATE platform_support_tickets
     SET status = 'waiting_support', updated_at = now()
     WHERE id = $1 AND tenant_id = $2`,
    [params.ticketId, params.tenantId],
  );
  return ins.rows[0];
}

export async function listAllPlatformSupportTickets(filters: {
  status?: string;
  priority?: string;
  category?: string;
  tenantId?: string;
  search?: string;
}): Promise<PlatformSupportTicketRow[]> {
  let query = `SELECT t.*, tn.name AS tenant_name, u.email AS created_by_email
    FROM platform_support_tickets t
    INNER JOIN tenants tn ON tn.id = t.tenant_id
    LEFT JOIN users u ON u.id = t.created_by_user_id
    WHERE 1=1`;
  const params: unknown[] = [];
  let i = 1;
  if (filters.status && filters.status !== 'all') {
    query += ` AND t.status = $${i++}`;
    params.push(filters.status);
  }
  if (filters.priority) {
    query += ` AND t.priority = $${i++}`;
    params.push(filters.priority);
  }
  if (filters.category) {
    query += ` AND t.category = $${i++}`;
    params.push(filters.category);
  }
  if (filters.tenantId) {
    query += ` AND t.tenant_id = $${i++}`;
    params.push(filters.tenantId);
  }
  if (filters.search) {
    query += ` AND (t.subject ILIKE $${i} OR t.message ILIKE $${i} OR tn.name ILIKE $${i})`;
    params.push(`%${filters.search}%`);
    i++;
  }
  query += ' ORDER BY t.updated_at DESC';
  const result = await pool.query<PlatformSupportTicketRow>(query, params);
  return result.rows;
}

export async function getPlatformSupportTicketById(ticketId: string): Promise<PlatformSupportTicketRow | null> {
  const result = await pool.query<PlatformSupportTicketRow>(
    `SELECT t.*, tn.name AS tenant_name, u.email AS created_by_email
     FROM platform_support_tickets t
     INNER JOIN tenants tn ON tn.id = t.tenant_id
     LEFT JOIN users u ON u.id = t.created_by_user_id
     WHERE t.id = $1`,
    [ticketId],
  );
  return result.rows[0] ?? null;
}

export async function addPlatformSupportSuperadminMessage(params: {
  ticketId: string;
  userId: string;
  message: string;
}): Promise<PlatformSupportMessageRow | null> {
  const ticket = await getPlatformSupportTicketById(params.ticketId);
  if (!ticket || ticket.status === 'closed') return null;
  const ins = await pool.query<PlatformSupportMessageRow>(
    `INSERT INTO platform_support_ticket_messages (ticket_id, sender_type, sender_user_id, message)
     VALUES ($1, 'superadmin', $2, $3)
     RETURNING *`,
    [params.ticketId, params.userId, params.message],
  );
  await pool.query(
    `UPDATE platform_support_tickets
     SET status = 'waiting_customer', updated_at = now()
     WHERE id = $1`,
    [params.ticketId],
  );
  return ins.rows[0];
}

export type PlatformSupportSummaryRow = {
  open: number;
  waiting_support: number;
  waiting_customer: number;
  urgent: number;
  resolved_today: number;
};

export type PlatformSupportLatestTicketRow = {
  id: string;
  subject: string;
  tenant_name: string;
  created_at: string;
};

export async function getPlatformSupportSummary(): Promise<{
  counts: PlatformSupportSummaryRow;
  latest: PlatformSupportLatestTicketRow | null;
}> {
  const countsResult = await pool.query<PlatformSupportSummaryRow>(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'open')::int AS open,
       COUNT(*) FILTER (WHERE status = 'waiting_support')::int AS waiting_support,
       COUNT(*) FILTER (WHERE status = 'waiting_customer')::int AS waiting_customer,
       COUNT(*) FILTER (
         WHERE priority = 'urgent' AND status NOT IN ('closed', 'resolved')
       )::int AS urgent,
       COUNT(*) FILTER (
         WHERE status = 'resolved'
           AND COALESCE(closed_at, updated_at)::date = CURRENT_DATE
       )::int AS resolved_today
     FROM platform_support_tickets`,
  );

  const latestResult = await pool.query<PlatformSupportLatestTicketRow>(
    `SELECT t.id, t.subject, t.created_at, tn.name AS tenant_name
     FROM platform_support_tickets t
     INNER JOIN tenants tn ON tn.id = t.tenant_id
     ORDER BY t.created_at DESC
     LIMIT 1`,
  );

  return {
    counts: countsResult.rows[0] ?? {
      open: 0,
      waiting_support: 0,
      waiting_customer: 0,
      urgent: 0,
      resolved_today: 0,
    },
    latest: latestResult.rows[0] ?? null,
  };
}

export async function updatePlatformSupportTicketStatus(
  ticketId: string,
  status: string,
): Promise<PlatformSupportTicketRow | null> {
  const result = await pool.query<PlatformSupportTicketRow>(
    `UPDATE platform_support_tickets
     SET status = $2::varchar,
         updated_at = now(),
         closed_at = CASE WHEN $2::varchar IN ('closed', 'resolved') THEN COALESCE(closed_at, now()) ELSE NULL END
     WHERE id = $1
     RETURNING *`,
    [ticketId, status],
  );
  return result.rows[0] ?? null;
}
