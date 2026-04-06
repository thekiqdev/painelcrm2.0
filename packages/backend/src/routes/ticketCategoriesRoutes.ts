import { Router } from 'express';
import * as ticketCategoriesController from '../controllers/ticketCategoriesController.js';
import { tenantAuthCrm } from '../middleware/auth.js';

const router = Router();
router.use(...tenantAuthCrm);

router.get('/', ticketCategoriesController.getTicketCategories);
router.post('/', ticketCategoriesController.createTicketCategory);
router.patch('/:id', ticketCategoriesController.updateTicketCategory);
router.delete('/:id', ticketCategoriesController.deleteTicketCategory);

export default router;


