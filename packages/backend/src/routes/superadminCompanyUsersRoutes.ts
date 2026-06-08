import { Router } from 'express';
import { superadminAuth } from '../middleware/auth.js';
import {
  getSuperadminCompanyUser,
  patchSuperadminCompanyUser,
  postSuperadminCompanyUserResetPassword,
} from '../controllers/superadminCompanyUsersController.js';

const router = Router({ mergeParams: true });

router.use(...superadminAuth);

router.get('/:tenantId/users/:userId', getSuperadminCompanyUser);
router.patch('/:tenantId/users/:userId', patchSuperadminCompanyUser);
router.post('/:tenantId/users/:userId/reset-password', postSuperadminCompanyUserResetPassword);

export default router;
