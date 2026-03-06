import { Router } from 'express';
import * as authController from '../controllers/authController.js';
import { tenantAuth } from '../middleware/auth.js';

const router = Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/me', ...tenantAuth, authController.getMe);
router.get('/me/features', ...tenantAuth, authController.getMeFeatures);
router.post('/logout', ...tenantAuth, authController.logout);

// Endpoint temporário para atualizar senha (REMOVER EM PRODUÇÃO)
router.post('/update-admin-password', authController.updateAdminPassword);

export default router;


