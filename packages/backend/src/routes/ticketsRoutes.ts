import { Router } from 'express';
import * as ticketsController from '../controllers/ticketsController.js';
import * as ticketMessagesController from '../controllers/ticketMessagesController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticateToken, ticketsController.getTickets);
router.get('/:id', authenticateToken, ticketsController.getTicketById);
router.post('/', authenticateToken, ticketsController.createTicket);
router.patch('/:id', authenticateToken, ticketsController.updateTicket);
router.delete('/:id', authenticateToken, ticketsController.deleteTicket);

// Ticket messages routes
router.get('/:ticketId/messages', authenticateToken, ticketMessagesController.getTicketMessages);
router.post('/:ticketId/messages', authenticateToken, ticketMessagesController.createTicketMessage);

export default router;


