import { Router } from 'express';
import {
  getProposals,
  getProposalById,
  createProposal,
  updateProposal,
  deleteProposal,
  convertProposalToInvoice,
} from '../controllers/proposalsController.js';
import {
  getProposalPublicLinkMeta,
  issueProposalPublicLink,
  revokeProposalPublicLink,
} from '../controllers/proposalPublicLinkAdminController.js';
import {
  postProposalOperationalPreview,
  getProposalIntegrationEvents,
  getProposalWebhookDeliveries,
} from '../controllers/proposalOperationalController.js';
import { tenantAuthCrm } from '../middleware/auth.js';

const router = Router();

// Todas as rotas requerem autenticação e tenant atual
router.use(...tenantAuthCrm);

// Rotas de proposals
router.get('/', getProposals);
router.post('/:id/convert-to-invoice', convertProposalToInvoice);
router.get('/:id/public-link', getProposalPublicLinkMeta);
router.post('/:id/public-link', issueProposalPublicLink);
router.delete('/:id/public-link', revokeProposalPublicLink);
router.post('/:id/operational-preview', postProposalOperationalPreview);
router.get('/:id/integration-events', getProposalIntegrationEvents);
router.get('/:id/webhook-deliveries', getProposalWebhookDeliveries);
router.get('/:id', getProposalById);
router.post('/', createProposal);
router.patch('/:id', updateProposal);
router.delete('/:id', deleteProposal);

export default router;

