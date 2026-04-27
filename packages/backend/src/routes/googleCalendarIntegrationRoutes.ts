import { Router } from 'express';
import { authenticateToken, requireTenant, setCurrentTenant } from '../middleware/auth.js';
import {
  googleCalendarConnect,
  googleCalendarCreateEvent,
  googleCalendarDisconnect,
  googleCalendarListEvents,
  googleCalendarOAuthCallback,
  googleCalendarStatus,
} from '../controllers/googleCalendarIntegrationController.js';

const router = Router();

router.get('/callback', googleCalendarOAuthCallback);

router.use(authenticateToken, setCurrentTenant, requireTenant);
router.get('/connect', googleCalendarConnect);
router.get('/status', googleCalendarStatus);
router.delete('/disconnect', googleCalendarDisconnect);
router.post('/events', googleCalendarCreateEvent);
router.get('/events', googleCalendarListEvents);

export default router;
