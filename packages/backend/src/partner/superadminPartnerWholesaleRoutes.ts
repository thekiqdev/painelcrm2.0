/**
 * M5-W Sprint 1 — Super Admin routes: partner wholesale plans.
 */
import { Router } from 'express';
import { superadminAuth } from '../middleware/auth.js';
import {
  superadminArchiveWholesalePlan,
  superadminCreateWholesalePlan,
  superadminGetWholesaleBlockSettings,
  superadminGetWholesalePlan,
  superadminListWholesalePlans,
  superadminSyncWholesalePastDue,
  superadminUpdateWholesaleBlockSettings,
  superadminUpdateWholesalePlan,
} from './partnerWholesaleControllers.js';

const router = Router();

router.use(...superadminAuth);

router.get('/', superadminListWholesalePlans);
router.post('/', superadminCreateWholesalePlan);

/** Block S1 — settings before /:id so "settings" is not treated as UUID */
router.get('/settings/block', superadminGetWholesaleBlockSettings);
router.put('/settings/block', superadminUpdateWholesaleBlockSettings);
router.post('/settings/block/sync', superadminSyncWholesalePastDue);

router.get('/:id', superadminGetWholesalePlan);
router.put('/:id', superadminUpdateWholesalePlan);
router.delete('/:id', superadminArchiveWholesalePlan);

export default router;
