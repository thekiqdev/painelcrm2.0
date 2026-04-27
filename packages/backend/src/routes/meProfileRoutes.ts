import { Router } from 'express';
import * as meProfileController from '../controllers/meProfileController.js';
import { authenticateToken, setCurrentTenant, setRequestDb } from '../middleware/auth.js';
import { catalogMediaUploadSingle } from '../middleware/catalogMediaMulter.js';

const router = Router();

router.use(authenticateToken, setCurrentTenant, setRequestDb);

router.get('/profile', meProfileController.getMeProfile);
router.put('/profile', meProfileController.putMeProfile);
router.post('/profile/avatar', catalogMediaUploadSingle, meProfileController.postMeProfileAvatar);
router.post('/profile/password/request-code', meProfileController.postMeProfilePasswordRequestCode);
router.post('/profile/password/confirm', meProfileController.postMeProfilePasswordConfirm);
router.get('/business-profile', meProfileController.getMeBusinessProfile);
router.put('/business-profile', meProfileController.putMeBusinessProfile);

export default router;
