import { Router } from 'express';
import {
  getMemberPermissions,
  createMemberPermission,
  deleteMemberPermission,
} from '../controllers/userPermissionsController.js';
import { tenantAuthCrm } from '../middleware/auth.js';

const router = Router();

// Todas as rotas requerem autenticação e tenant atual
router.use(...tenantAuthCrm);

// Rotas de permissões
router.get('/members/:memberId/permissions', getMemberPermissions);
router.post('/members/:memberId/permissions', createMemberPermission);
router.delete('/members/:memberId/permissions/:permissionId', deleteMemberPermission);

export default router;

