import { Router } from 'express';
import { authenticateToken, setCurrentTenant, setRequestDb } from '../middleware/auth.js';
import { mercadoPagoFeatureGuard } from '../middleware/mercadoPagoFeatureGuard.js';
import * as ctrl from '../controllers/mercadoPagoIntegrationController.js';

const router = Router();

router.post('/webhook', mercadoPagoFeatureGuard, ctrl.postMercadoPagoWebhook);

router.get('/availability', ctrl.getMercadoPagoAvailability);

router.get(
  '/connect-url',
  mercadoPagoFeatureGuard,
  authenticateToken,
  setCurrentTenant,
  setRequestDb,
  ctrl.getMercadoPagoConnectUrl,
);

router.post(
  '/test',
  mercadoPagoFeatureGuard,
  authenticateToken,
  setCurrentTenant,
  setRequestDb,
  ctrl.postMercadoPagoTest,
);

router.get(
  '/status',
  mercadoPagoFeatureGuard,
  authenticateToken,
  setCurrentTenant,
  setRequestDb,
  ctrl.getMercadoPagoStatus,
);

router.post(
  '/disconnect',
  mercadoPagoFeatureGuard,
  authenticateToken,
  setCurrentTenant,
  setRequestDb,
  ctrl.postMercadoPagoDisconnect,
);

export default router;
