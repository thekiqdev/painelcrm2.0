import { Router } from 'express';
import * as catalogMediaController from '../controllers/catalogMediaController.js';
import { tenantAuthCrm } from '../middleware/auth.js';
import { catalogMediaUploadSingle } from '../middleware/catalogMediaMulter.js';

const router = Router();
router.use(...tenantAuthCrm);

router.post('/upload', catalogMediaUploadSingle, catalogMediaController.postCatalogMediaUpload);

export default router;
