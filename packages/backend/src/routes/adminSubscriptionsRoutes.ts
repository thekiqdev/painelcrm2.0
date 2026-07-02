/**
 * Alias B0.2 — mesmas rotas de renovação manual sob /api/admin/subscriptions.
 */
import { Router } from 'express';
import { tenantAuthCrm } from '../middleware/auth.js';
import {
  getCrmSubscriptionRenewalDiagnosisHandler,
  postCrmSubscriptionGenerateNowHandler,
  postCrmSubscriptionReprocessHandler,
  postCrmSubscriptionManualRenewHandler,
  postCrmSubscriptionManualReprocessHandler,
} from '../controllers/crmSubscriptionsController.js';

const router = Router();
router.use(...tenantAuthCrm);

router.get('/:id/renewal-diagnosis', getCrmSubscriptionRenewalDiagnosisHandler);
router.post('/:id/generate-now', postCrmSubscriptionGenerateNowHandler);
router.post('/:id/reprocess', postCrmSubscriptionReprocessHandler);
router.post('/:id/manual-renew', postCrmSubscriptionManualRenewHandler);
router.post('/:id/manual-reprocess', postCrmSubscriptionManualReprocessHandler);

export default router;
