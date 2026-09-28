import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.js';
import * as notificationService from '../services/notifications.js';

// Schema de validação para query parameters
const getNotificationsSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50).optional(),
  offset: z.coerce.number().min(0).default(0).optional(),
  read: z.coerce.boolean().optional(),
  type: z.string().optional(),
  category: z.enum(['system', 'message']).optional(),
});

/**
 * GET /api/notifications
 * Lista notificações do usuário autenticado
 */
export async function getNotifications(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const queryParams = getNotificationsSchema.parse(req.query);

    const { notifications, total } = await notificationService.getUserNotifications(userId, {
      limit: queryParams.limit,
      offset: queryParams.offset,
      read: queryParams.read,
      type: queryParams.type as any,
      category: queryParams.category,
    });

    const list = notifications.map((n) => notificationService.notificationToListDto(n));

    res.json({
      notifications: list,
      pagination: {
        total,
        limit: queryParams.limit || 50,
        offset: queryParams.offset || 0,
        hasMore: (queryParams.offset || 0) + (queryParams.limit || 50) < total,
      },
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(400).json({
        error: 'Invalid query parameters',
        details: error.errors,
      });
      return;
    }

    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch notifications' });
  }
}

/**
 * GET /api/notifications/unread-count
 * Retorna o contador de notificações não lidas
 */
export async function getUnreadCount(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const category = req.query.category === 'message' || req.query.category === 'system'
      ? req.query.category
      : undefined;
    const count = await notificationService.getUnreadCount(userId, category);

    res.json({
      count,
    });
  } catch (error: any) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch unread count' });
  }
}

/**
 * PATCH /api/notifications/:id/read
 * Marca uma notificação específica como lida
 */
export async function markNotificationAsRead(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    if (!id || typeof id !== 'string') {
      res.status(400).json({ error: 'Notification ID is required' });
      return;
    }

    const notification = await notificationService.markNotificationAsRead(id, userId, req.tenantId ?? null);

    if (!notification) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    res.json({
      notification: notificationService.notificationToListDto(notification),
      message: 'Notification marked as read',
    });
  } catch (error: any) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: error.message || 'Failed to mark notification as read' });
  }
}

/**
 * DELETE /api/notifications
 * Remove todas as notificações do utilizador autenticado.
 */
export async function deleteAllNotifications(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const deleted = await notificationService.deleteAllNotificationsForUser(userId);
    res.json({
      deleted,
      message: deleted === 0 ? 'Nenhuma notificação para remover' : `${deleted} notificação(ões) removida(s)`,
    });
  } catch (error: any) {
    console.error('Error deleting all notifications:', error);
    res.status(500).json({ error: error.message || 'Failed to delete notifications' });
  }
}

/**
 * PATCH /api/notifications/read-all
 * Marca todas as notificações do usuário como lidas
 */
export async function markAllNotificationsAsRead(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const category = req.query.category === 'message' || req.query.category === 'system'
      ? req.query.category
      : undefined;
    const count = await notificationService.markAllNotificationsAsRead(userId, category);

    res.json({
      count,
      message: `${count} notification${count !== 1 ? 's' : ''} marked as read`,
    });
  } catch (error: any) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: error.message || 'Failed to mark all notifications as read' });
  }
}

/**
 * DELETE /api/notifications/:id
 * Deleta uma notificação específica
 */
export async function deleteNotification(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    if (!id || typeof id !== 'string') {
      res.status(400).json({ error: 'Notification ID is required' });
      return;
    }

    const deleted = await notificationService.deleteNotification(id, userId);

    if (!deleted) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    res.json({
      message: 'Notification deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ error: error.message || 'Failed to delete notification' });
  }
}

/**
 * GET /api/notifications/:id
 * Obtém uma notificação específica
 */
export async function getNotification(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    if (!id || typeof id !== 'string') {
      res.status(400).json({ error: 'Notification ID is required' });
      return;
    }

    const notification = await notificationService.getNotificationById(id, userId);

    if (!notification) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    res.json({ notification: notificationService.notificationToListDto(notification) });
  } catch (error: any) {
    console.error('Error fetching notification:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch notification' });
  }
}

