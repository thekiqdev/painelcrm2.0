import { Router } from 'express';
import { authenticateToken, requireTenant, setCurrentTenant } from '../middleware/auth.js';
import {
  googleDriveConnect,
  googleDriveDisconnect,
  googleDriveOAuthCallback,
  googleDriveStatus,
} from '../controllers/googleDriveIntegrationController.js';

const router = Router();

router.get('/callback', googleDriveOAuthCallback);

router.use(authenticateToken, setCurrentTenant, requireTenant);
router.post('/connect', googleDriveConnect);
router.get('/status', googleDriveStatus);
router.post('/disconnect', googleDriveDisconnect);

export default router;
