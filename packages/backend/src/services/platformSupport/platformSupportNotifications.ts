import { pool } from '../../utils/db.js';
import { resolvePlatformPublicAppBaseUrl } from '../../utils/platformPublicUrls.js';
import { publishPlatformBusinessEventMultiChannel } from '../platformNotifications/platformBusinessEventMultiChannel.js';
import {
  adminDisplayName,
  loadPrimaryTenantAdminForNotify,
  normalizeTenantAdminEmail,
  resolveRecipientWhatsapp,
} from '../platformNotifications/platformTenantAdminForNotify.js';

const TYPE_SUPERADMIN_NEW = 'platform_support_new_ticket';
const TYPE_TENANT_CREATED = 'platform_ticket_created';
const TYPE_TENANT_REPLY = 'platform_ticket_reply';
const TYPE_TENANT_STATUS = 'platform_ticket_status_changed';

const STATUS_LABELS: Record<string, string> = {
  open: 'Aberto',
  waiting_support: 'Aguardando suporte',
  waiting_customer: 'Aguardando cliente',
  resolved: 'Resolvido',
  closed: 'Fechado',
  reopened: 'Reaberto',
};

type PlatformSupportTicketNotifyInput = {
  ticketId: string;
  tenantId: string;
  subject: string;
  status?: string | null;
  messagePreview?: string | null;
};

async function getSuperAdminUserIds(): Promise<string[]> {
  const result = await pool.query('SELECT id FROM users WHERE is_super_admin = true');
  return result.rows.map((r: { id: string }) => r.id);
}

function platformPublicName(): string {
  return (process.env.APP_PUBLIC_NAME || 'PainelCRM').trim() || 'PainelCRM';
}

function ticketProtocol(ticketId: string): string {
  return `PS-${ticketId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

function ticketLink(ticketId: string): string {
  return `${resolvePlatformPublicAppBaseUrl()}/suporte/${encodeURIComponent(ticketId)}`;
}

function preview(input: string | null | undefined, max = 280): string {
  return String(input ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function statusLabel(status: string | null | undefined): string {
  const key = String(status ?? '').trim();
  return STATUS_LABELS[key] ?? (key || 'Aberto');
}

function isImportantTenantStatus(previousStatus: string | null | undefined, nextStatus: string): boolean {
  if (nextStatus === 'resolved' || nextStatus === 'closed') return true;
  const prev = String(previousStatus ?? '').trim();
  if ((prev === 'resolved' || prev === 'closed') && nextStatus !== prev) return true;
  return false;
}

function effectiveStatusForTenant(previousStatus: string | null | undefined, nextStatus: string): string {
  const prev = String(previousStatus ?? '').trim();
  if ((prev === 'resolved' || prev === 'closed') && nextStatus !== prev) return 'reopened';
  return nextStatus;
}

async function insertTenantInAppNotification(params: {
  userId: string;
  type: string;
  title: string;
  message: string;
  ticketId: string;
  tenantId: string;
  actionUrl: string;
  dedupeKey: string;
}): Promise<void> {
  const dupe = await pool.query(
    `SELECT 1
     FROM notifications
     WHERE user_id = $1::uuid
       AND type = $2
       AND entity_type = 'platform_support_ticket'
       AND entity_id = $3::uuid
       AND data->>'dedupe_key' = $4
       AND created_at > now() - interval '2 minutes'
     LIMIT 1`,
    [params.userId, params.type, params.ticketId, params.dedupeKey],
  );
  if (dupe.rows.length > 0) return;

  await pool.query(
    `INSERT INTO notifications (user_id, tenant_id, type, title, message, data, href, entity_type, entity_id, read)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'platform_support_ticket', $8, false)`,
    [
      params.userId,
      params.tenantId,
      params.type,
      params.title,
      params.message,
      JSON.stringify({
        ticket_id: params.ticketId,
        action_url: params.actionUrl,
        dedupe_key: params.dedupeKey,
      }),
      params.actionUrl,
      params.ticketId,
    ],
  );
}

async function publishTenantPlatformSupportEvent(params: {
  eventKey: 'platform_ticket_created' | 'platform_ticket_reply' | 'platform_ticket_status_changed';
  inAppType: string;
  title: string;
  message: string;
  ticket: PlatformSupportTicketNotifyInput;
  idempotencyBaseKey: string;
  mergeContextExtra?: Record<string, string>;
  actor?: Record<string, unknown>;
}): Promise<void> {
  const admin = await loadPrimaryTenantAdminForNotify(pool, params.ticket.tenantId);
  if (!admin) {
    console.warn('[platformSupport] tenant notification skipped: no admin', {
      tenant_id: params.ticket.tenantId,
      event_key: params.eventKey,
      ticket_id: params.ticket.ticketId,
    });
    return;
  }

  const link = ticketLink(params.ticket.ticketId);
  const protocol = ticketProtocol(params.ticket.ticketId);
  const currentStatus = statusLabel(params.ticket.status ?? 'open');
  const messagePreview = preview(params.ticket.messagePreview);
  const mergeContext = {
    'platform.name': platformPublicName(),
    'tenant.name': admin.tenant_name,
    'tenant.admin_name': adminDisplayName(admin),
    'tenant.admin_email': normalizeTenantAdminEmail(admin.email) ?? '',
    'tenant.admin_whatsapp': resolveRecipientWhatsapp(admin) ?? '',
    'ticket.protocol': protocol,
    'ticket.subject': params.ticket.subject,
    'ticket.status': currentStatus,
    'ticket.link': link,
    'ticket.message_preview': messagePreview,
    ...(params.mergeContextExtra ?? {}),
  };

  try {
    await insertTenantInAppNotification({
      userId: admin.user_id,
      tenantId: params.ticket.tenantId,
      type: params.inAppType,
      title: params.title,
      message: params.message,
      ticketId: params.ticket.ticketId,
      actionUrl: `/suporte/${params.ticket.ticketId}`,
      dedupeKey: params.idempotencyBaseKey,
    });
  } catch (e) {
    console.error('[platformSupport] tenant in-app notification failed', e);
  }

  await publishPlatformBusinessEventMultiChannel({
    targetTenantId: params.ticket.tenantId,
    eventKey: params.eventKey,
    entityType: 'platform_support_ticket',
    entityId: params.ticket.ticketId,
    idempotencyBaseKey: params.idempotencyBaseKey,
    mergeContext,
    eventOccurredAt: new Date(),
    metadata: {
      module: 'platform_support',
      ticket_id: params.ticket.ticketId,
      actor: params.actor ?? { type: 'system', source: 'platform_support' },
    },
  });
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
        TYPE_TENANT_REPLY,
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

export async function notifyTenantPlatformSupportTicketCreated(params: PlatformSupportTicketNotifyInput): Promise<void> {
  try {
    await publishTenantPlatformSupportEvent({
      eventKey: 'platform_ticket_created',
      inAppType: TYPE_TENANT_CREATED,
      title: 'Ticket recebido pelo suporte',
      message: `${ticketProtocol(params.ticketId)}: ${params.subject}`,
      ticket: {
        ...params,
        status: params.status ?? 'open',
      },
      idempotencyBaseKey: `platform_support:${params.ticketId}:created`,
    });
  } catch (e) {
    console.error('[platformSupport] notifyTenantPlatformSupportTicketCreated', e);
  }
}

export async function notifyTenantPlatformSupportPublicReply(params: PlatformSupportTicketNotifyInput): Promise<void> {
  try {
    await publishTenantPlatformSupportEvent({
      eventKey: 'platform_ticket_reply',
      inAppType: TYPE_TENANT_REPLY,
      title: 'Nova resposta do suporte',
      message: `Nova resposta no ticket ${ticketProtocol(params.ticketId)}`,
      ticket: params,
      idempotencyBaseKey: `platform_support:${params.ticketId}:reply:${preview(params.messagePreview, 80)}`,
    });
  } catch (e) {
    console.error('[platformSupport] notifyTenantPlatformSupportPublicReply', e);
  }
}

export async function notifyTenantPlatformSupportStatusChanged(params: PlatformSupportTicketNotifyInput & {
  previousStatus?: string | null;
  nextStatus: string;
}): Promise<void> {
  if (!isImportantTenantStatus(params.previousStatus, params.nextStatus)) return;

  const effectiveStatus = effectiveStatusForTenant(params.previousStatus, params.nextStatus);
  try {
    await publishTenantPlatformSupportEvent({
      eventKey: 'platform_ticket_status_changed',
      inAppType: TYPE_TENANT_STATUS,
      title: `Ticket ${statusLabel(effectiveStatus).toLowerCase()}`,
      message: `${ticketProtocol(params.ticketId)} agora está ${statusLabel(effectiveStatus).toLowerCase()}.`,
      ticket: {
        ...params,
        status: effectiveStatus,
      },
      idempotencyBaseKey: `platform_support:${params.ticketId}:status:${effectiveStatus}`,
      mergeContextExtra: {
        'ticket.previous_status': statusLabel(params.previousStatus),
      },
    });
  } catch (e) {
    console.error('[platformSupport] notifyTenantPlatformSupportStatusChanged', e);
  }
}
