import { Router } from 'express';
import * as messageTemplatesController from '../controllers/messageTemplatesController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticateToken, messageTemplatesController.getMessageTemplates);
router.get('/resources', authenticateToken, messageTemplatesController.getResourceTypes);
router.get('/by-resource/:resource_type/:action', authenticateToken, messageTemplatesController.getMessageTemplateByResource);
router.post('/', authenticateToken, messageTemplatesController.createMessageTemplate);
router.post('/initialize-predefined', authenticateToken, messageTemplatesController.initializePredefinedTemplates);
router.post('/:id/test', authenticateToken, messageTemplatesController.testMessageTemplate);
router.get('/:id', authenticateToken, messageTemplatesController.getMessageTemplateById);
router.patch('/:id', authenticateToken, messageTemplatesController.updateMessageTemplate);
router.delete('/:id', authenticateToken, messageTemplatesController.deleteMessageTemplate);

export default router;

