import { Router } from 'express';
import { getMembers } from '../controllers/membersController.js';
import { tenantAuth } from '../middleware/auth.js';

const router = Router();

// Todas as rotas requerem autenticação e tenant atual
router.use(...tenantAuth);

// Rotas de membros
router.get('/', getMembers);

export default router;

