import { Router } from 'express';
import * as proposalTemplatesController from '../controllers/proposalTemplatesController.js';
import { tenantAuthCrm } from '../middleware/auth.js';

const router = Router();
router.use(...tenantAuthCrm);

router.get('/', proposalTemplatesController.listProposalTemplates);
router.get('/:id', proposalTemplatesController.getProposalTemplateById);
router.post('/', proposalTemplatesController.createProposalTemplate);
router.patch('/:id', proposalTemplatesController.updateProposalTemplate);
router.delete('/:id', proposalTemplatesController.deleteProposalTemplate);

export default router;
