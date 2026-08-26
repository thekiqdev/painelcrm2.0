import { Router } from 'express';
import { superadminAuth } from '../middleware/auth.js';
import { requirePartnerChannelEnabled } from './partnerAuthMiddleware.js';
import {
  superadminCreatePartner,
  superadminGetPartner,
  superadminListPartnerCustomers,
  superadminListPartners,
  superadminListPartnerSuspensionEvents,
  superadminPartnerChannelStats,
  superadminPatchPartner,
  superadminSuspendPartner,
} from './partnerControllers.js';

const router = Router();

router.use(...superadminAuth);
router.use(requirePartnerChannelEnabled);

router.get('/', superadminListPartners);
router.get('/channel-stats', superadminPartnerChannelStats);
router.post('/', superadminCreatePartner);
router.get('/:id', superadminGetPartner);
router.get('/:id/customers', superadminListPartnerCustomers);
router.patch('/:id', superadminPatchPartner);
router.post('/:id/suspend', superadminSuspendPartner);
router.get('/:id/suspension-events', superadminListPartnerSuspensionEvents);

export default router;
