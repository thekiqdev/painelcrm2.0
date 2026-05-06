import { Router } from 'express';
import { getMediaRawBySignedKey } from './mediaController.js';

const router = Router();

router.get('/v1/raw', getMediaRawBySignedKey);

export default router;
