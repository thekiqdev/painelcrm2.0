import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { optionalAuthenticateAndTenant } from '../middleware/auth.js';
import * as billingStatusController from '../controllers/billingStatusController.js';
import * as billingPayCardController from '../controllers/billingPayCardController.js';

const router = Router();

const saasPayWithCardLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_SAAS_BILLING_PAY_CARD_MAX || process.env.RATE_LIMIT_PUBLIC_PAY_CARD_MAX || '15', 10),
  message: { ok: false, error: 'Muitas tentativas. Aguarde um minuto.', code: 'rate_limited' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ip = req.ip || req.socket.remoteAddress || '';
    const bid = (req.params as { billingId?: string }).billingId || '';
    return `${ip}:${bid}`;
  },
});

/** Polling do checkout (~2,5s): limite folgado por IP+cobrança para conter abuso sem travar UX. */
const billingStatusPollLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_BILLING_STATUS_MAX || '120', 10),
  message: { ok: false, error: 'Muitas consultas de status. Aguarde um instante.', code: 'rate_limited' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ip = req.ip || req.socket.remoteAddress || '';
    const bid = (req.params as { billingId?: string }).billingId || '';
    return `${ip}:${bid}`;
  },
});

router.get('/:billingId/status', billingStatusPollLimiter, billingStatusController.getBillingStatus);
router.post(
  '/:billingId/pay-with-card',
  saasPayWithCardLimiter,
  optionalAuthenticateAndTenant,
  billingPayCardController.postTenantBillingPayWithCard
);

export default router;
