import { Router } from 'express';
import { getPublicSignupEntry } from '../controllers/platformSignupEntryController.js';

const router = Router();

router.get('/signup-entry', getPublicSignupEntry);

export default router;
