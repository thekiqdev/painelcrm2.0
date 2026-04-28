import { pool } from '../utils/db.js';
import { emitNotification, emitUnreadCount } from './websocketService.js';
import { emitToTenant } from './realtimeService.js';

/**
 * Tipos de notificações disponíveis
 */
export type NotificationType =
  | 'new_message'
  | 'message_delivered'
  | 'message_read'
  | 'new_conversation'
  | 'connection_lost'
  | 'connection_restored'
  | 'lead_updated'
  | 'instance_connected'
  | 'instance_disconnected'
  | 'kanban_automation'
  | 'crm_proposal'
  | 'announcement'
  | 'agenda_reminder'
  | 'agenda_reschedule_request'
  | 'agenda_public_reschedule_done'
  | 'agenda_pending_confirmation_alert';

/**
 * Interface para criar notificação
 */
export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message?: string;
  data?: Record<string, any>;
}

/**
 * Interface de notificação retornada
 */
export interface Notification {
  id: string;
  user_id: string;
  tenant_id?: string | null;
  type: NotificationType | string;
  title: string;
  message: string | null;
  href?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  data: Record<string, any>;
  read: boolean;
  read_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/** Resposta enxuta do centro de notificações (sininho). */
export type NotificationListItemDto = {
  id: string;
  type: string;
  title: string;
  message: string | null;
  href: string;
  read: boolean;
  read_at: string | null;
  created_at: string;
};

function asData(n: Notification): Record<string, any> {
  const d = n.data;
  return d && typeof d === 'object' && !Array.isArray(d) ? (d as Record<string, any>) : {};
}

/**
 * Destino in-app quando `href` não veio persistido (notificações antigas ou só JSON em `data`).
 */
export function resolveNotificationHrefForRow(n: Notification): string {
  const rawHref = n.href != null ? String(n.href).trim() : '';
  if (rawHref.startsWith('/')) return rawHref;

  const d = asData(n);
  const dataHref = typeof d.href === 'string' ? d.href.trim() : '';
  if (dataHref.startsWith('/')) return dataHref;

  const type = String(n.type || '');
  const et = n.entity_type != null ? String(n.entity_type) : '';

  const entityMap: Record<string, (id: string) => string> = {
    announcement: (id) => `/updates/${id}`,
    invoice: (id) => `/customer-invoices/${id}`,
    customer_invoice: (id) => `/customer-invoices/${id}`,
    proposal: (id) => `/proposals/${id}`,
    contract: (id) => `/contracts/${id}`,
    task: (id) => `/tasks`,
    ticket: (id) => `/support/tickets/${id}`,
    conversation: (id) => `/chat/${encodeURIComponent(id)}`,
  };

  if (n.entity_id && et && entityMap[et]) {
    return entityMap[et](String(n.entity_id));
  }

  if (type === 'announcement' || et === 'announcement') {
    const aid = n.entity_id ? String(n.entity_id) : typeof d.announcement_id === 'string' ? d.announcement_id : '';
    if (aid) return `/updates/${aid}`;
    return '/updates';
  }

  const conv =
    (typeof d.conversationId === 'string' && d.conversationId) ||
    (typeof d.conversation_id === 'string' && d.conversation_id) ||
    '';
  if (conv) {
    if (
      type === 'new_message' ||
      type === 'message_delivered' ||
      type === 'message_read' ||
      type === 'new_conversation' ||
      type === 'kanban_automation'
    ) {
      return `/chat/${encodeURIComponent(conv)}`;
    }
  }

  if (type === 'crm_proposal') {
    const pid = typeof d.proposal_id === 'string' ? d.proposal_id : typeof d.proposalId === 'string' ? d.proposalId : '';
    if (pid) return `/proposals/${pid}`;
  }

  if (type === 'lead_updated') {
    const lid = typeof d.leadId === 'string' ? d.leadId : typeof d.lead_id === 'string' ? d.lead_id : '';
    if (lid) return `/leads/${lid}`;
  }

  if (
    type === 'agenda_reminder' ||
    type === 'agenda_reschedule_request' ||
    type === 'agenda_public_reschedule_done' ||
    type === 'agenda_pending_confirmation_alert'
  ) {
    const aid = typeof d.appointment_id === 'string' ? d.appointment_id : '';
    if (aid) return `/agenda?appointment_id=${encodeURIComponent(aid)}`;
  }

  const invoiceId =
    typeof d.invoice_id === 'string'
      ? d.invoice_id
      : typeof d.invoiceId === 'string'
        ? d.invoiceId
        : typeof d.customer_invoice_id === 'string'
          ? d.customer_invoice_id
          : '';
  if (invoiceId) return `/customer-invoices/${invoiceId}`;

  const contractId =
    typeof d.contract_id === 'string' ? d.contract_id : typeof d.contractId === 'string' ? d.contractId : '';
  if (contractId) return `/contracts/${contractId}`;

  const ticketId =
    typeof d.ticket_id === 'string' ? d.ticket_id : typeof d.ticketId === 'string' ? d.ticketId : '';
  if (ticketId) return `/support/tickets/${ticketId}`;

  if (type.startsWith('superadmin_')) {
    return '/superadmin/notifications';
  }

  if (type === 'instance_connected' || type === 'instance_disconnected' || type.startsWith('connection_')) {
    return '/settings';
  }

  if (conv) return `/chat/${encodeURIComponent(conv)}`;

  return '/dashboard';
}

function toIsoString(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  try {
    const dt = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toISOString();
  } catch {
    return null;
  }
}

export function notificationToListDto(row: Notification): NotificationListItemDto {
  return {
    id: row.id,
    type: String(row.type),
    title: row.title,
    message: row.message,
    href: resolveNotificationHrefForRow(row),
    read: row.read === true,
    read_at: toIsoString(row.read_at),
    created_at: toIsoString(row.created_at) ?? new Date().toISOString(),
  };
}

/**
 * Cria uma nova notificação para um usuário
 */
export async function createNotification(
  params: CreateNotificationParams
): Promise<Notification> {
  const { userId, type, title, message, data } = params;

  const result = await pool.query<Notification>(
    `
    INSERT INTO notifications (
      user_id, type, title, message, data
    )
    VALUES ($1, $2, $3, $4, $5::jsonb)
    RETURNING *
    `,
    [userId, type, title, message || null, JSON.stringify(data || {})]
  );

  const notification = result.rows[0];

  // Emitir notificação via WebSocket
  try {
    emitNotification(userId, notification);
    let tenantId: string | null = notification.tenant_id ?? null;
    if (!tenantId) {
      const tr = await pool.query<{ tenant_id: string | null }>(
        `SELECT tenant_id FROM users WHERE id = $1 LIMIT 1`,
        [userId]
      );
      tenantId = tr.rows[0]?.tenant_id ?? null;
    }
    if (tenantId) {
      emitToTenant(tenantId, 'notification.created', {
        notification_id: notification.id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        href: resolveNotificationHrefForRow(notification),
        created_at: notification.created_at,
      });
    }
    // Atualizar contador de não lidas
    const unreadCount = await getUnreadCount(userId);
    emitUnreadCount(userId, unreadCount);
  } catch (error: any) {
    // Não falhar se WebSocket não estiver disponível
    console.warn('Failed to emit notification via WebSocket:', error.message);
  }

  return notification;
}

/**
 * Cria notificação de nova mensagem recebida
 */
export async function notifyNewMessage(
  userId: string,
  options: {
    conversationId: string;
    conversationName?: string;
    messagePreview?: string;
    messageId?: string;
    isGroup?: boolean;
  }
): Promise<Notification> {
  const { conversationId, conversationName, messagePreview, messageId, isGroup } = options;

  const title = isGroup
    ? `Nova mensagem em ${conversationName || 'grupo'}`
    : `Nova mensagem de ${conversationName || 'contato'}`;

  const message = messagePreview
    ? messagePreview.substring(0, 100) + (messagePreview.length > 100 ? '...' : '')
    : 'Você recebeu uma nova mensagem';

  return createNotification({
    userId,
    type: 'new_message',
    title,
    message,
    data: {
      conversationId,
      messageId,
      isGroup,
      conversationName,
    },
  });
}

/**
 * Cria notificação de mensagem entregue
 */
export async function notifyMessageDelivered(
  userId: string,
  options: {
    conversationId: string;
    messageId: string;
    conversationName?: string;
  }
): Promise<Notification> {
  return createNotification({
    userId,
    type: 'message_delivered',
    title: 'Mensagem entregue',
    message: `Sua mensagem foi entregue${options.conversationName ? ` em ${options.conversationName}` : ''}`,
    data: {
      conversationId: options.conversationId,
      messageId: options.messageId,
      conversationName: options.conversationName,
    },
  });
}

/**
 * Cria notificação de mensagem lida
 */
export async function notifyMessageRead(
  userId: string,
  options: {
    conversationId: string;
    messageId: string;
    conversationName?: string;
  }
): Promise<Notification> {
  return createNotification({
    userId,
    type: 'message_read',
    title: 'Mensagem lida',
    message: `Sua mensagem foi lida${options.conversationName ? ` por ${options.conversationName}` : ''}`,
    data: {
      conversationId: options.conversationId,
      messageId: options.messageId,
      conversationName: options.conversationName,
    },
  });
}

/**
 * Cria notificação de nova conversa iniciada
 */
export async function notifyNewConversation(
  userId: string,
  options: {
    conversationId: string;
    conversationName?: string;
    phoneNumber?: string;
    isGroup?: boolean;
  }
): Promise<Notification> {
  const { conversationId, conversationName, phoneNumber, isGroup } = options;

  const title = isGroup
    ? 'Nova conversa em grupo'
    : 'Nova conversa iniciada';

  const message = conversationName
    ? `${conversationName} iniciou uma conversa`
    : phoneNumber
    ? `Conversa iniciada com ${phoneNumber}`
    : 'Uma nova conversa foi iniciada';

  return createNotification({
    userId,
    type: 'new_conversation',
    title,
    message,
    data: {
      conversationId,
      conversationName,
      phoneNumber,
      isGroup,
    },
  });
}

/**
 * Cria notificação de conexão perdida
 */
export async function notifyConnectionLost(
  userId: string,
  options: {
    instanceId: string;
    instanceName?: string;
  }
): Promise<Notification> {
  return createNotification({
    userId,
    type: 'connection_lost',
    title: 'Conexão WhatsApp perdida',
    message: `A conexão com ${options.instanceName || 'WhatsApp'} foi perdida`,
    data: {
      instanceId: options.instanceId,
      instanceName: options.instanceName,
    },
  });
}

/**
 * Cria notificação de conexão restaurada
 */
export async function notifyConnectionRestored(
  userId: string,
  options: {
    instanceId: string;
    instanceName?: string;
  }
): Promise<Notification> {
  return createNotification({
    userId,
    type: 'connection_restored',
    title: 'Conexão WhatsApp restaurada',
    message: `A conexão com ${options.instanceName || 'WhatsApp'} foi restaurada`,
    data: {
      instanceId: options.instanceId,
      instanceName: options.instanceName,
    },
  });
}

/**
 * Cria notificação de instância conectada
 */
export async function notifyInstanceConnected(
  userId: string,
  options: {
    instanceId: string;
    instanceName?: string;
  }
): Promise<Notification> {
  return createNotification({
    userId,
    type: 'instance_connected',
    title: 'WhatsApp conectado',
    message: `${options.instanceName || 'Instância'} foi conectada com sucesso`,
    data: {
      instanceId: options.instanceId,
      instanceName: options.instanceName,
    },
  });
}

/**
 * Cria notificação de instância desconectada
 */
export async function notifyInstanceDisconnected(
  userId: string,
  options: {
    instanceId: string;
    instanceName?: string;
  }
): Promise<Notification> {
  return createNotification({
    userId,
    type: 'instance_disconnected',
    title: 'WhatsApp desconectado',
    message: `${options.instanceName || 'Instância'} foi desconectada`,
    data: {
      instanceId: options.instanceId,
      instanceName: options.instanceName,
    },
  });
}

/**
 * Cria notificação de lead atualizado
 */
export async function notifyLeadUpdated(
  userId: string,
  options: {
    leadId: string;
    leadName?: string;
    action?: string;
  }
): Promise<Notification> {
  const actionText = options.action || 'atualizado';
  return createNotification({
    userId,
    type: 'lead_updated',
    title: 'Lead atualizado',
    message: `Lead ${options.leadName || ''} foi ${actionText}`.trim(),
    data: {
      leadId: options.leadId,
      leadName: options.leadName,
      action: options.action,
    },
  });
}

/**
 * Busca notificações de um usuário
 */
export async function getUserNotifications(
  userId: string,
  options: {
    limit?: number;
    offset?: number;
    read?: boolean;
    type?: NotificationType;
  } = {}
): Promise<{ notifications: Notification[]; total: number }> {
  const { limit = 50, offset = 0, read, type } = options;

  let whereClause = 'WHERE user_id = $1';
  const params: any[] = [userId];
  let paramIndex = 2;

  if (read !== undefined) {
    whereClause += ` AND read = $${paramIndex}`;
    params.push(read);
    paramIndex++;
  }

  if (type) {
    whereClause += ` AND type = $${paramIndex}::varchar`;
    params.push(type);
    paramIndex++;
  }

  // Buscar notificações
  const notificationsResult = await pool.query<Notification>(
    `
    SELECT *
    FROM notifications
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `,
    [...params, limit, offset]
  );

  // Contar total
  const countResult = await pool.query<{ count: string }>(
    `
    SELECT COUNT(*) as count
    FROM notifications
    ${whereClause}
    `,
    params
  );

  return {
    notifications: notificationsResult.rows,
    total: parseInt(countResult.rows[0].count, 10),
  };
}

/**
 * Conta notificações não lidas de um usuário
 */
export async function getUnreadCount(userId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `
    SELECT COUNT(*) as count
    FROM notifications
    WHERE user_id = $1 AND read = false
    `,
    [userId]
  );

  return parseInt(result.rows[0].count, 10);
}

/**
 * Marca notificações de anúncio como lidas (vários IDs de announcement).
 */
export async function markAnnouncementNotificationsAsReadForUser(
  userId: string,
  announcementIds: string[]
): Promise<void> {
  if (announcementIds.length === 0) return;
  await pool.query(
    `
    UPDATE notifications
    SET read = true, read_at = COALESCE(read_at, now()), updated_at = now()
    WHERE user_id = $1
      AND entity_type = 'announcement'
      AND entity_id = ANY($2::uuid[])
    `,
    [userId, announcementIds]
  );
  try {
    const unreadCount = await getUnreadCount(userId);
    emitUnreadCount(userId, unreadCount);
  } catch (error: any) {
    console.warn('Failed to emit unread count via WebSocket:', error.message);
  }
}

export async function getNotificationById(
  notificationId: string,
  userId: string
): Promise<Notification | null> {
  const result = await pool.query<Notification>(
    `SELECT * FROM notifications WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [notificationId, userId]
  );
  return result.rows[0] || null;
}

async function upsertAnnouncementRead(
  userId: string,
  tenantId: string,
  announcementId: string
): Promise<void> {
  await pool.query(
    `
    INSERT INTO announcement_reads (announcement_id, tenant_id, user_id)
    VALUES ($1::uuid, $2::uuid, $3::uuid)
    ON CONFLICT (announcement_id, user_id) DO NOTHING
    `,
    [announcementId, tenantId, userId]
  );
}

/**
 * Marca notificação como lida (idempotente).
 * Para tipo announcement + tenant, sincroniza announcement_reads.
 */
export async function markNotificationAsRead(
  notificationId: string,
  userId: string,
  tenantId: string | null
): Promise<Notification | null> {
  const result = await pool.query<Notification>(
    `
    UPDATE notifications
    SET read = true, read_at = COALESCE(read_at, now()), updated_at = now()
    WHERE id = $1 AND user_id = $2
    RETURNING *
    `,
    [notificationId, userId]
  );

  const notification = result.rows[0] || null;
  if (notification && tenantId) {
    const d = asData(notification);
    const isAnn =
      notification.entity_type === 'announcement' || String(notification.type) === 'announcement';
    const aid =
      (notification.entity_id as string | undefined) ||
      (typeof d.announcement_id === 'string' ? d.announcement_id : undefined);
    if (isAnn && aid) {
      await upsertAnnouncementRead(userId, tenantId, aid);
    }
  }

  if (notification) {
    try {
      const unreadCount = await getUnreadCount(userId);
      emitUnreadCount(userId, unreadCount);
    } catch (error: any) {
      console.warn('Failed to emit unread count via WebSocket:', error.message);
    }
  }

  return notification;
}

/**
 * Marca todas as notificações de um usuário como lidas
 */
export async function markAllNotificationsAsRead(userId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `
    UPDATE notifications
    SET read = true, read_at = now(), updated_at = now()
    WHERE user_id = $1 AND read = false
    RETURNING id
    `,
    [userId]
  );

  const count = result.rowCount || 0;

  // Atualizar contador de não lidas via WebSocket
  if (count > 0) {
    try {
      const unreadCount = await getUnreadCount(userId);
      emitUnreadCount(userId, unreadCount);
    } catch (error: any) {
      console.warn('Failed to emit unread count via WebSocket:', error.message);
    }
  }

  return count;
}

/**
 * Deleta notificação
 */
export async function deleteNotification(
  notificationId: string,
  userId: string
): Promise<boolean> {
  const result = await pool.query(
    `
    DELETE FROM notifications
    WHERE id = $1 AND user_id = $2
    `,
    [notificationId, userId]
  );

  return (result.rowCount || 0) > 0;
}

/**
 * Remove todas as notificações do utilizador (hard delete; tabela sem deleted_at).
 */
export async function deleteAllNotificationsForUser(userId: string): Promise<number> {
  const result = await pool.query(`DELETE FROM notifications WHERE user_id = $1 RETURNING id`, [userId]);
  const count = result.rowCount || 0;
  try {
    emitUnreadCount(userId, 0);
  } catch (error: any) {
    console.warn('Failed to emit unread count via WebSocket:', error.message);
  }
  return count;
}

