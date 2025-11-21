import { Router } from 'express';
import { getMembers } from '../controllers/membersController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Todas as rotas requerem autenticação
router.use(authenticateToken);

// Rotas de membros
router.get('/', getMembers);

export default router;

