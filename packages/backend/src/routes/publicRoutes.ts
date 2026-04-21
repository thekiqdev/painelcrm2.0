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
import {
  getPublicContractView,
  getPublicContractPdf,
} from '../controllers/publicContractViewController.js';
import {
  getPublicSignatureInvite,
  postPublicSignature,
} from '../controllers/publicContractSignatureController.js';
import {
  getPublicProposalView,
  postPublicProposalAccept,
  postPublicProposalReject,
} from '../controllers/publicProposalViewController.js';

const router = Router();

const contractPublicViewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_PUBLIC_CONTRACT_VIEW_MAX || '120', 10),
  message: { ok: false, error: 'Muitas visualizações. Aguarde e tente novamente.', code: 'rate_limited' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development',
  keyGenerator: (req) => {
    const ip = req.ip || req.socket.remoteAddress || '';
    const token = req.params.token || '';
    return `${ip}:${token}`;
  },
});

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

router.get('/contracts/view/:token/pdf', contractPublicViewLimiter, getPublicContractPdf);
router.get('/contracts/view/:token', contractPublicViewLimiter, getPublicContractView);

const proposalPublicViewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_PUBLIC_PROPOSAL_VIEW_MAX || '120', 10),
  message: { ok: false, error: 'Muitas visualizações. Aguarde e tente novamente.', code: 'rate_limited' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development',
  keyGenerator: (req) => {
    const ip = req.ip || req.socket.remoteAddress || '';
    const token = req.params.token || '';
    return `${ip}:${token}`;
  },
});

const proposalPublicActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_PUBLIC_PROPOSAL_ACTION_MAX || '40', 10),
  message: { ok: false, error: 'Muitas tentativas. Aguarde e tente novamente.', code: 'rate_limited' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development',
  keyGenerator: (req) => {
    const ip = req.ip || req.socket.remoteAddress || '';
    const token = req.params.token || '';
    return `${ip}:${token}`;
  },
});

router.get('/proposals/view/:token', proposalPublicViewLimiter, getPublicProposalView);
router.post('/proposals/view/:token/accept', proposalPublicActionLimiter, postPublicProposalAccept);
router.post('/proposals/view/:token/reject', proposalPublicActionLimiter, postPublicProposalReject);

const contractPublicSignatureReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_PUBLIC_CONTRACT_SIGNATURE_GET_MAX || '120', 10),
  message: { ok: false, error: 'Muitas consultas. Aguarde.', code: 'rate_limited' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development',
  keyGenerator: (req) => `${req.ip || ''}:${req.params.token || ''}`,
});

const contractPublicSignaturePostLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_PUBLIC_CONTRACT_SIGNATURE_POST_MAX || '30', 10),
  message: { ok: false, error: 'Muitas tentativas de assinatura. Aguarde.', code: 'rate_limited' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development',
  keyGenerator: (req) => `${req.ip || ''}:${req.params.token || ''}`,
});

router.get('/contracts/sign/:token', contractPublicSignatureReadLimiter, getPublicSignatureInvite);
router.post('/contracts/sign/:token', contractPublicSignaturePostLimiter, postPublicSignature);

router.get('/customer-invoices/pay/:token', getPayByToken);
router.post('/customer-invoices/pay/:token/complete', postCompletePayByToken);
router.post('/customer-invoices/pay/:token/switch-method', postSwitchPaymentMethodByToken);
router.post(
  '/customer-invoices/pay/:token/pay-with-card',
  payWithCardLimiter,
  postPayWithCardByToken
);

export default router;
