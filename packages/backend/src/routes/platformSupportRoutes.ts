import { Router } from 'express';
import { optionalAuthenticateAndTenant, tenantAuthCrm } from '../middleware/auth.js';
import * as platformSupportController from '../controllers/platformSupportController.js';

const router = Router();

router.get('/settings/public', optionalAuthenticateAndTenant, platformSupportController.getPlatformSupportPublicSettings);

router.use(...tenantAuthCrm);

router.get('/tickets', platformSupportController.getPlatformSupportTickets);
router.post('/tickets', platformSupportController.postPlatformSupportTicket);
router.get('/tickets/:id', platformSupportController.getPlatformSupportTicketDetail);
router.post('/tickets/:id/messages', platformSupportController.postPlatformSupportTicketMessage);

export default router;
