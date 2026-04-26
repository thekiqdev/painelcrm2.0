import { Router } from 'express';
import * as c from '../controllers/announcementsUpdatesController.js';

const router = Router();

router.get('/updates/unread-count', c.getUpdatesUnreadCount);
router.post('/updates/mark-read', c.postMarkUpdatesRead);
router.get('/updates', c.listPublishedUpdates);
router.get('/updates/:id', c.getPublishedUpdate);

export default router;
