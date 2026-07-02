import { Router } from 'express';
import { tenantAuthCrm } from '../middleware/auth.js';
import {
  listCrmSubscriptions,
  getCrmSubscriptionsAnalyticsHandler,
  getCrmSubscription,
  getCrmSubscriptionContractHistoryHandler,
  patchCrmSubscriptionCyclesHandler,
  patchCrmSubscriptionNextBillingHandler,
  patchCrmSubscriptionContractHandler,
  postCrmSubscriptionPause,
  postCrmSubscriptionResume,
  postCrmSubscriptionReactivate,
  postCrmSubscriptionCancel,
  getCrmSubscriptionRenewalDiagnosisHandler,
  postCrmSubscriptionGenerateNowHandler,
  postCrmSubscriptionReprocessHandler,
  postCrmSubscriptionManualRenewHandler,
  postCrmSubscriptionManualReprocessHandler,
} from '../controllers/crmSubscriptionsController.js';

const router = Router();
router.use(...tenantAuthCrm);

router.get('/analytics', getCrmSubscriptionsAnalyticsHandler);
router.get('/', listCrmSubscriptions);
router.get('/:id/contract-history', getCrmSubscriptionContractHistoryHandler);
router.get('/:id', getCrmSubscription);
router.patch('/:id/cycles-config', patchCrmSubscriptionCyclesHandler);
router.patch('/:id/next-billing', patchCrmSubscriptionNextBillingHandler);
router.patch('/:id/contract', patchCrmSubscriptionContractHandler);
router.post('/:id/pause', postCrmSubscriptionPause);
router.post('/:id/resume', postCrmSubscriptionResume);
router.post('/:id/reactivate', postCrmSubscriptionReactivate);
router.post('/:id/cancel', postCrmSubscriptionCancel);
router.get('/:id/renewal-diagnosis', getCrmSubscriptionRenewalDiagnosisHandler);
router.post('/:id/generate-now', postCrmSubscriptionGenerateNowHandler);
router.post('/:id/reprocess', postCrmSubscriptionReprocessHandler);
router.post('/:id/manual-renew', postCrmSubscriptionManualRenewHandler);
router.post('/:id/manual-reprocess', postCrmSubscriptionManualReprocessHandler);

export default router;
