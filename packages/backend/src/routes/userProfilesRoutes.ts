import { Router } from 'express';
import {
  getUserProfiles,
  getUserProfileById,
  createUserProfile,
  updateUserProfile,
  deleteUserProfile,
} from '../controllers/userProfilesController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Todas as rotas requerem autenticação
router.use(authenticateToken);

// Rotas de perfis
router.get('/', getUserProfiles);
router.get('/:id', getUserProfileById);
router.post('/', createUserProfile);
router.patch('/:id', updateUserProfile);
router.delete('/:id', deleteUserProfile);

export default router;

