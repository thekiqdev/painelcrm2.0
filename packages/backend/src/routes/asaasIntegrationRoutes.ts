import { Router } from 'express';
import { authenticateToken, setCurrentTenant, setRequestDb } from '../middleware/auth.js';
import {
  getAsaasStatus,
  postAsaasConnect,
  postAsaasRecreateWebhook,
  postAsaasTest,
} from '../controllers/asaasIntegrationController.js';

const router = Router();

router.use(authenticateToken, setCurrentTenant, setRequestDb);

router.post('/connect', postAsaasConnect);
router.post('/test', postAsaasTest);
router.post('/recreate-webhook', postAsaasRecreateWebhook);
router.get('/status', getAsaasStatus);

export default router;
