import { Router } from 'express';
import { tenantAuthCrm } from '../middleware/auth.js';
import {
  listWhatsappMessageTemplates,
  getWhatsappMessageTemplate,
  createWhatsappMessageTemplate,
  patchWhatsappMessageTemplate,
  deleteWhatsappMessageTemplate,
  postWhatsappMessageTemplateSendSequence,
  postWhatsappMessageTemplateMediaUpload,
} from '../controllers/whatsappMessageTemplatesController.js';
import { whatsappTemplateMediaUploadSingle } from '../middleware/whatsappTemplateMediaMulter.js';

const router = Router();
router.use(...tenantAuthCrm);

router.get('/', listWhatsappMessageTemplates);
router.post('/', createWhatsappMessageTemplate);
router.post('/upload', whatsappTemplateMediaUploadSingle, postWhatsappMessageTemplateMediaUpload);
router.post('/:id/send-sequence', postWhatsappMessageTemplateSendSequence);
router.get('/:id', getWhatsappMessageTemplate);
router.patch('/:id', patchWhatsappMessageTemplate);
router.delete('/:id', deleteWhatsappMessageTemplate);

export default router;
