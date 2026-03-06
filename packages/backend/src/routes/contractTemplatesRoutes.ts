import { Router } from 'express';
import * as contractTemplatesController from '../controllers/contractTemplatesController.js';
import { tenantAuth } from '../middleware/auth.js';

const router = Router();
router.use(...tenantAuth);

router.get('/', contractTemplatesController.getContractTemplates);
router.post('/', contractTemplatesController.createContractTemplate);
router.patch('/:id', contractTemplatesController.updateContractTemplate);
router.delete('/:id', contractTemplatesController.deleteContractTemplate);

export default router;

