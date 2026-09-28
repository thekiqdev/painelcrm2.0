import { Router } from 'express';
import * as contractTemplatesController from '../controllers/contractTemplatesController.js';
import { tenantAuthCrm } from '../middleware/auth.js';

const router = Router();
router.use(...tenantAuthCrm);

router.get('/', contractTemplatesController.getContractTemplates);
router.get('/:id', contractTemplatesController.getContractTemplateById);
router.post('/', contractTemplatesController.createContractTemplate);
router.patch('/:id', contractTemplatesController.updateContractTemplate);
router.delete('/:id', contractTemplatesController.deleteContractTemplate);

export default router;

