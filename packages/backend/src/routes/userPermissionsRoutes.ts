import { Router } from 'express';
import {
  getMemberPermissions,
  createMemberPermission,
  deleteMemberPermission,
} from '../controllers/userPermissionsController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Todas as rotas requerem autenticação
router.use(authenticateToken);

// Rotas de permissões
router.get('/members/:memberId/permissions', getMemberPermissions);
router.post('/members/:memberId/permissions', createMemberPermission);
router.delete('/members/:memberId/permissions/:permissionId', deleteMemberPermission);

export default router;

