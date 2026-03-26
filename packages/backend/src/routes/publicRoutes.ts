/**
 * Rotas públicas (sem autenticação). Ex.: link único de pagamento.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getPayByToken,
  postCompletePayByToken,
  postSwitchPaymentMethodByToken,
  postPayWithCardByToken,
} from '../controllers/publicCustomerInvoicesController.js';

const router = Router();

/** Limite específico: captura de cartão (dados sensíveis em trânsito). */
const payWithCardLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_PUBLIC_PAY_CARD_MAX || '15', 10),
  message: { ok: false, error: 'Muitas tentativas. Aguarde um minuto.', code: 'rate_limited' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ip = req.ip || req.socket.remoteAddress || '';
    const token = req.params.token || '';
    return `${ip}:${token}`;
  },
});

router.get('/customer-invoices/pay/:token', getPayByToken);
router.post('/customer-invoices/pay/:token/complete', postCompletePayByToken);
router.post('/customer-invoices/pay/:token/switch-method', postSwitchPaymentMethodByToken);
router.post(
  '/customer-invoices/pay/:token/pay-with-card',
  payWithCardLimiter,
  postPayWithCardByToken
);

export default router;
