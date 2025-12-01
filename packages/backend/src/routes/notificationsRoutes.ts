import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  getNotifications,
  getUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  getNotification,
} from '../controllers/notificationsController.js';

const router = Router();

// Todas as rotas requerem autenticação
router.use(authenticateToken);

// Rotas específicas devem vir antes de rotas com parâmetros dinâmicos
// GET /api/notifications/unread-count - Contador de não lidas
router.get('/unread-count', getUnreadCount);

// PATCH /api/notifications/read-all - Marcar todas como lidas
router.patch('/read-all', markAllNotificationsAsRead);

// GET /api/notifications - Listar notificações (com paginação e filtros)
router.get('/', getNotifications);

// GET /api/notifications/:id - Obter notificação específica
router.get('/:id', getNotification);

// PATCH /api/notifications/:id/read - Marcar notificação como lida
router.patch('/:id/read', markNotificationAsRead);

// DELETE /api/notifications/:id - Deletar notificação
router.delete('/:id', deleteNotification);

export default router;

