import { Router } from 'express';
import * as authController from '../controllers/authController.js';
import * as registerOrganizationController from '../controllers/registerOrganizationController.js';
import * as passwordResetWhatsappController from '../controllers/passwordResetWhatsappController.js';
import { authSessionContext } from '../middleware/auth.js';

const router = Router();

router.post('/register', authController.register);
router.post('/register/check-admin', registerOrganizationController.checkAdminAvailability);
router.post('/register/organization', registerOrganizationController.registerOrganization);
router.post('/login', authController.login);
router.post('/password-reset/request', passwordResetWhatsappController.postPasswordResetRequest);
router.post('/password-reset/verify-code', passwordResetWhatsappController.postPasswordResetVerifyCode);
router.post('/password-reset/complete', passwordResetWhatsappController.postPasswordResetComplete);
router.get('/me', ...authSessionContext, authController.getMe);
router.get('/me/features', ...authSessionContext, authController.getMeFeatures);
router.post('/logout', ...authSessionContext, authController.logout);

// Endpoint temporário para atualizar senha (REMOVER EM PRODUÇÃO)
router.post('/update-admin-password', authController.updateAdminPassword);

export default router;


