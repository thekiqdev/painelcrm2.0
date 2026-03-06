import { Router } from 'express';
import * as messageTemplatesController from '../controllers/messageTemplatesController.js';
import { tenantAuth } from '../middleware/auth.js';

const router = Router();
router.use(...tenantAuth);

router.get('/', messageTemplatesController.getMessageTemplates);
router.get('/resources', messageTemplatesController.getResourceTypes);
router.get('/by-resource/:resource_type/:action', messageTemplatesController.getMessageTemplateByResource);
router.post('/', messageTemplatesController.createMessageTemplate);
router.post('/initialize-predefined', messageTemplatesController.initializePredefinedTemplates);
router.post('/:id/test', messageTemplatesController.testMessageTemplate);
router.get('/:id', messageTemplatesController.getMessageTemplateById);
router.patch('/:id', messageTemplatesController.updateMessageTemplate);
router.delete('/:id', messageTemplatesController.deleteMessageTemplate);

export default router;

