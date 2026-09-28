import { Router } from 'express';
import { tenantAuthCrm } from '../middleware/auth.js';
import {
  listWhatsappTemplateCategories,
  createWhatsappTemplateCategory,
  patchWhatsappTemplateCategory,
  deleteWhatsappTemplateCategory,
} from '../controllers/whatsappTemplateCategoriesController.js';

const router = Router();
router.use(...tenantAuthCrm);

router.get('/', listWhatsappTemplateCategories);
router.post('/', createWhatsappTemplateCategory);
router.patch('/:id', patchWhatsappTemplateCategory);
router.delete('/:id', deleteWhatsappTemplateCategory);

export default router;
