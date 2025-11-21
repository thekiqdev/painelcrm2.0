import { Router } from 'express';
import {
  getProfileMembers,
  createProfileMember,
  deleteProfileMember,
} from '../controllers/profileMembersController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Todas as rotas requerem autenticação
router.use(authenticateToken);

// Rotas de membros
router.get('/:profileId/members', getProfileMembers);
router.post('/:profileId/members', createProfileMember);
router.delete('/members/:memberId', deleteProfileMember);

export default router;

