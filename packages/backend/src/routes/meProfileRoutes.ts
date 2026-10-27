import { Router } from 'express';
import * as meProfileController from '../controllers/meProfileController.js';
import * as meLocaleController from '../controllers/meLocaleController.js';
import { authenticateToken, setCurrentTenant, setRequestDb } from '../middleware/auth.js';
import { catalogMediaUploadSingle } from '../middleware/catalogMediaMulter.js';

const router = Router();

router.use(authenticateToken, setCurrentTenant, setRequestDb);

router.patch('/locale', meLocaleController.patchMeLocale);
router.get('/profile', meProfileController.getMeProfile);
router.put('/profile', meProfileController.putMeProfile);
router.post('/profile/avatar', catalogMediaUploadSingle, meProfileController.postMeProfileAvatar);
router.post('/profile/edit/request-code', meProfileController.postMeProfileEditRequestCode);
router.post('/profile/edit/confirm-code', meProfileController.postMeProfileEditConfirmCode);
router.post('/profile/password/request-code', meProfileController.postMeProfilePasswordRequestCode);
router.post('/profile/password/confirm', meProfileController.postMeProfilePasswordConfirm);
router.get('/business-profile', meProfileController.getMeBusinessProfile);
router.put('/business-profile', meProfileController.putMeBusinessProfile);

export default router;
