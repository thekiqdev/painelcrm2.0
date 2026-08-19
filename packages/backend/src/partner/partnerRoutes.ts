import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  requirePartnerAdmin,
  requirePartnerChannelEnabled,
  requirePartnerMember,
  requirePartnerSeller,
} from './partnerAuthMiddleware.js';
import {
  partnerGetMe,
  partnerGetProfile,
  partnerPatchProfile,
  partnerGetDomain,
  partnerSetDomain,
  partnerVerifyDomain,
  partnerClearDomain,
} from './partnerControllers.js';
import {
  partnerGetGateway,
  partnerPutGateway,
  partnerTestGateway,
} from './partnerGatewayController.js';
import {
  partnerArchiveSellPlan,
  partnerCreateSellPlan,
  partnerGetLicenses,
  partnerGetSellPlan,
  partnerListSellPlans,
  partnerPatchSellPlan,
  partnerSellPlanProjection,
} from './partnerCommercialControllers.js';
import {
  partnerCreateCustomer,
  partnerCreateSeller,
  partnerDeleteCustomer,
  partnerGetHouseSaleLink,
  partnerListCustomers,
  partnerListSellers,
  partnerPatchCustomer,
  partnerSellerGetLink,
} from './partnerCustomerControllers.js';
import {
  partnerAccrueCommission,
  partnerArchiveCommissionRule,
  partnerClawbackCommission,
  partnerListCommissionRules,
  partnerListCommissions,
  partnerMarkCommissionsPaid,
  partnerPatchSeller,
  partnerSellerGetCommissions,
  partnerUpsertCommissionRule,
} from './partnerCommissionControllers.js';

const router = Router();

router.use(authenticateToken, requirePartnerChannelEnabled);

router.get('/me', requirePartnerMember, partnerGetMe);
router.get('/profile', requirePartnerAdmin, partnerGetProfile);
router.patch('/profile', requirePartnerAdmin, partnerPatchProfile);
router.get('/domain', requirePartnerAdmin, partnerGetDomain);
router.post('/domain', requirePartnerAdmin, partnerSetDomain);
router.post('/domain/verify', requirePartnerAdmin, partnerVerifyDomain);
router.delete('/domain', requirePartnerAdmin, partnerClearDomain);

/** S3 — licenças, gateway, planos de venda */
router.get('/licenses', requirePartnerAdmin, partnerGetLicenses);
router.get('/gateway', requirePartnerAdmin, partnerGetGateway);
router.put('/gateway', requirePartnerAdmin, partnerPutGateway);
router.post('/gateway/test', requirePartnerAdmin, partnerTestGateway);
router.get('/sell-plans/projection', requirePartnerAdmin, partnerSellPlanProjection);
router.get('/sell-plans', requirePartnerAdmin, partnerListSellPlans);
router.post('/sell-plans', requirePartnerAdmin, partnerCreateSellPlan);
router.get('/sell-plans/:id', requirePartnerAdmin, partnerGetSellPlan);
router.patch('/sell-plans/:id', requirePartnerAdmin, partnerPatchSellPlan);
router.delete('/sell-plans/:id', requirePartnerAdmin, partnerArchiveSellPlan);

/** S4 — carteira + sellers + link */
router.get('/customers', requirePartnerAdmin, partnerListCustomers);
router.post('/customers', requirePartnerAdmin, partnerCreateCustomer);
router.patch('/customers/:id', requirePartnerAdmin, partnerPatchCustomer);
router.delete('/customers/:id', requirePartnerAdmin, partnerDeleteCustomer);
router.get('/sellers', requirePartnerAdmin, partnerListSellers);
router.post('/sellers', requirePartnerAdmin, partnerCreateSeller);
router.patch('/sellers/:id', requirePartnerAdmin, partnerPatchSeller);
router.get('/sale-link', requirePartnerAdmin, partnerGetHouseSaleLink);
router.get('/seller/me/link', requirePartnerSeller, partnerSellerGetLink);
router.get('/seller/me/commissions', requirePartnerSeller, partnerSellerGetCommissions);

/** S5 — regras + comissões */
router.get('/seller-rules', requirePartnerAdmin, partnerListCommissionRules);
router.post('/seller-rules', requirePartnerAdmin, partnerUpsertCommissionRule);
router.delete('/seller-rules/:id', requirePartnerAdmin, partnerArchiveCommissionRule);
router.get('/commissions', requirePartnerAdmin, partnerListCommissions);
router.post('/commissions/payouts', requirePartnerAdmin, partnerMarkCommissionsPaid);
router.post('/commissions/accrue', requirePartnerAdmin, partnerAccrueCommission);
router.post('/commissions/:id/clawback', requirePartnerAdmin, partnerClawbackCommission);

export default router;
