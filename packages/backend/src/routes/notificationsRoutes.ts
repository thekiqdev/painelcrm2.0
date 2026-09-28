import { Router } from 'express';
import { tenantAuthCrm } from '../middleware/auth.js';
import {
  getNotifications,
  getUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteAllNotifications,
  deleteNotification,
  getNotification,
} from '../controllers/notificationsController.js';

const router = Router();

// Todas as rotas requerem autenticação
router.use(...tenantAuthCrm);

// Rotas específicas devem vir antes de rotas com parâmetros dinâmicos
router.get('/unread-count', getUnreadCount);

router.patch('/read-all', markAllNotificationsAsRead);

// DELETE coleção antes de DELETE /:id
router.delete('/', deleteAllNotifications);

router.get('/', getNotifications);

router.get('/:id', getNotification);

router.post('/:id/read', markNotificationAsRead);
router.patch('/:id/read', markNotificationAsRead);

router.delete('/:id', deleteNotification);

export default router;
