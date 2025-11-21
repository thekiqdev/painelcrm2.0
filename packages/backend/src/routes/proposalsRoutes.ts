import { Router } from 'express';
import {
  getProposals,
  getProposalById,
  createProposal,
  updateProposal,
  deleteProposal,
} from '../controllers/proposalsController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Todas as rotas requerem autenticação
router.use(authenticateToken);

// Rotas de proposals
router.get('/', getProposals);
router.get('/:id', getProposalById);
router.post('/', createProposal);
router.patch('/:id', updateProposal);
router.delete('/:id', deleteProposal);

export default router;

