import { Router } from 'express';
import * as ticketCategoriesController from '../controllers/ticketCategoriesController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticateToken, ticketCategoriesController.getTicketCategories);
router.post('/', authenticateToken, ticketCategoriesController.createTicketCategory);
router.patch('/:id', authenticateToken, ticketCategoriesController.updateTicketCategory);
router.delete('/:id', authenticateToken, ticketCategoriesController.deleteTicketCategory);

export default router;


