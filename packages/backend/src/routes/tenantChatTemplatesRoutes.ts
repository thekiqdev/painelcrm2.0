import { Router } from 'express';
import { tenantAuthCrm } from '../middleware/auth.js';
import {
  listTenantChatTemplates,
  getTenantChatTemplate,
  createTenantChatTemplate,
  patchTenantChatTemplate,
  deleteTenantChatTemplate,
} from '../controllers/tenantChatTemplatesController.js';

const router = Router();
router.use(...tenantAuthCrm);

router.get('/', listTenantChatTemplates);
router.post('/', createTenantChatTemplate);
router.get('/:id', getTenantChatTemplate);
router.patch('/:id', patchTenantChatTemplate);
router.delete('/:id', deleteTenantChatTemplate);

export default router;
