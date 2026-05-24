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
  getPublicSignaturePdf,
  postPublicSignature,
} from '../controllers/publicContractSignatureController.js';
import {
  getPublicProposalView,
  postPublicProposalAccept,
  postPublicProposalReject,
} from '../controllers/publicProposalViewController.js';
import { getPublicCatalogMediaRaw } from '../controllers/publicCatalogMediaController.js';
import {
  getPublicSaasBillingSummary,
  postPublicSaasBillingPreparePayment,
  getPublicSaasBillingStatus,
  postPublicSaasBillingPayWithCard,
} from '../controllers/publicSaasBillingController.js';
import { getPublicLegalPage } from '../controllers/publicLegalController.js';
import {
  getPublicAppointmentConfirmationByToken,
  getPublicAppointmentAvailabilityByToken,
  getPublicRescheduleConflictsByToken,
  postPublicAppointmentConfirmationByToken,
} from '../controllers/publicAppointmentsConfirmationController.js';
import { getPublicPlatformTrackingSettings } from '../controllers/publicPlatformTrackingController.js';
import {
  getPublicSupportPortalBySlug,
  getPublicTicketByToken,
  postPublicSupportTicket,
  postPublicSupportTicketLookup,
  postPublicSupportTicketMessage,
  postPublicTicketMessageByToken,
} from '../controllers/publicSupportPortalController.js';

const router = Router();

const legalPublicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_PUBLIC_LEGAL_MAX || '300', 10),
  message: { ok: false, error: 'Muitas consultas. Aguarde.', code: 'rate_limited' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development',
  keyGenerator: (req) => String(req.ip || req.socket.remoteAddress || ''),
});

const catalogMediaPublicRawLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_PUBLIC_CATALOG_MEDIA_RAW_MAX || '3000', 10),
  message: { ok: false, error: 'Muitas consultas a imagens. Aguarde.', code: 'rate_limited' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development',
  keyGenerator: (req) => String(req.ip || req.socket.remoteAddress || ''),
});

router.get('/catalog-media/raw', catalogMediaPublicRawLimiter, getPublicCatalogMediaRaw);
router.get('/tracking-settings', getPublicPlatformTrackingSettings);

router.get('/legal/:page', legalPublicLimiter, getPublicLegalPage);

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
router.get('/contracts/sign/:token/pdf', contractPublicSignatureReadLimiter, getPublicSignaturePdf);
router.post('/contracts/sign/:token', contractPublicSignaturePostLimiter, postPublicSignature);

router.get('/customer-invoices/pay/:token', getPayByToken);
router.post('/customer-invoices/pay/:token/complete', postCompletePayByToken);
router.post('/customer-invoices/pay/:token/switch-method', postSwitchPaymentMethodByToken);
router.post(
  '/customer-invoices/pay/:token/pay-with-card',
  payWithCardLimiter,
  postPayWithCardByToken
);

const saasPublicReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_PUBLIC_SAAS_BILLING_READ_MAX || '180', 10),
  message: { ok: false, error: 'Muitas consultas. Aguarde.', code: 'rate_limited' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development',
  keyGenerator: (req) => `${req.ip || ''}:${(req.params as { token?: string }).token || ''}`,
});

const saasPublicWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_PUBLIC_SAAS_BILLING_WRITE_MAX || '30', 10),
  message: { ok: false, error: 'Muitas tentativas. Aguarde.', code: 'rate_limited' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip || ''}:${(req.params as { token?: string }).token || ''}`,
});

router.get('/saas-billing/:token', saasPublicReadLimiter, getPublicSaasBillingSummary);
router.post('/saas-billing/:token/prepare-payment', saasPublicWriteLimiter, postPublicSaasBillingPreparePayment);
router.get('/saas-billing/:token/status', saasPublicReadLimiter, getPublicSaasBillingStatus);
router.post(
  '/saas-billing/:token/pay-with-card',
  payWithCardLimiter,
  postPublicSaasBillingPayWithCard,
);

const appointmentPublicConfirmReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_PUBLIC_APPOINTMENT_CONFIRM_GET_MAX || '120', 10),
  message: { ok: false, error: 'Muitas consultas. Aguarde.', code: 'rate_limited' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development',
  keyGenerator: (req) => `${req.ip || ''}:${(req.params as { token?: string }).token || ''}`,
});

const appointmentPublicConfirmWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_PUBLIC_APPOINTMENT_CONFIRM_POST_MAX || '30', 10),
  message: { ok: false, error: 'Muitas tentativas. Aguarde.', code: 'rate_limited' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development',
  keyGenerator: (req) => `${req.ip || ''}:${(req.params as { token?: string }).token || ''}`,
});

router.get(
  '/appointments/confirm/:token',
  appointmentPublicConfirmReadLimiter,
  getPublicAppointmentConfirmationByToken,
);
router.get(
  '/appointments/confirm/:token/availability',
  appointmentPublicConfirmReadLimiter,
  getPublicAppointmentAvailabilityByToken,
);
router.get(
  '/appointments/confirm/:token/reschedule-conflicts',
  appointmentPublicConfirmReadLimiter,
  getPublicRescheduleConflictsByToken,
);
router.post(
  '/appointments/confirm/:token',
  appointmentPublicConfirmWriteLimiter,
  postPublicAppointmentConfirmationByToken,
);

const supportPublicReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_PUBLIC_SUPPORT_READ_MAX || '120', 10),
  message: { ok: false, error: 'Muitas consultas. Aguarde.', code: 'rate_limited' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development',
  keyGenerator: (req) => {
    const ip = req.ip || req.socket.remoteAddress || '';
    const slug = (req.params as { slug?: string }).slug || '';
    return `${ip}:${slug}`;
  },
});

const supportPublicTicketPostLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_PUBLIC_SUPPORT_TICKET_POST_MAX || '12', 10),
  message: { ok: false, error: 'Muitas tentativas. Aguarde alguns minutos.', code: 'rate_limited' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development',
  keyGenerator: (req) => {
    const ip = req.ip || req.socket.remoteAddress || '';
    const slug = (req.params as { slug?: string }).slug || '';
    return `${ip}:${slug}`;
  },
});

const supportPublicTicketLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_PUBLIC_SUPPORT_TICKET_LOOKUP_MAX || '36', 10),
  message: { ok: false, error: 'Muitas consultas. Aguarde alguns minutos.', code: 'rate_limited' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development',
  keyGenerator: (req) => {
    const ip = req.ip || req.socket.remoteAddress || '';
    const slug = (req.params as { slug?: string }).slug || '';
    return `${ip}:${slug}`;
  },
});

router.get('/support/:slug', supportPublicReadLimiter, getPublicSupportPortalBySlug);
router.get('/tickets/:token', supportPublicReadLimiter, getPublicTicketByToken);
router.post('/tickets/:token/messages', supportPublicTicketPostLimiter, postPublicTicketMessageByToken);
router.post(
  '/support/:slug/tickets/lookup',
  supportPublicTicketLookupLimiter,
  postPublicSupportTicketLookup,
);
router.post('/support/:slug/tickets', supportPublicTicketPostLimiter, postPublicSupportTicket);

const supportPublicTicketMessageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_PUBLIC_SUPPORT_TICKET_MESSAGE_MAX || '24', 10),
  message: { ok: false, error: 'Muitas respostas. Aguarde alguns minutos.', code: 'rate_limited' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development',
  keyGenerator: (req) => {
    const ip = req.ip || req.socket.remoteAddress || '';
    const slug = (req.params as { slug?: string }).slug || '';
    const ticketNumber = (req.params as { ticketNumber?: string }).ticketNumber || '';
    return `${ip}:${slug}:${ticketNumber}`;
  },
});

router.post(
  '/support/:slug/tickets/:ticketNumber/messages',
  supportPublicTicketMessageLimiter,
  postPublicSupportTicketMessage,
);

export default router;
