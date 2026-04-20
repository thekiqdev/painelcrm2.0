import { pool } from '../utils/db.js';
import { emitNotification, emitUnreadCount } from './websocketService.js';

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
  | 'kanban_automation';

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
  type: NotificationType;
  title: string;
  message: string | null;
  data: Record<string, any>;
  read: boolean;
  read_at: Date | null;
  created_at: Date;
  updated_at: Date;
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
    whereClause += ` AND type = $${paramIndex}`;
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
 * Marca notificação como lida
 */
export async function markNotificationAsRead(
  notificationId: string,
  userId: string
): Promise<Notification | null> {
  const result = await pool.query<Notification>(
    `
    UPDATE notifications
    SET read = true, read_at = now(), updated_at = now()
    WHERE id = $1 AND user_id = $2 AND read = false
    RETURNING *
    `,
    [notificationId, userId]
  );

  const notification = result.rows[0] || null;

  // Atualizar contador de não lidas via WebSocket
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

