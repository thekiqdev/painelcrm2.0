import { Router } from 'express';
import * as ticketsController from '../controllers/ticketsController.js';
import * as ticketMessagesController from '../controllers/ticketMessagesController.js';
import { tenantAuth } from '../middleware/auth.js';

const router = Router();
router.use(...tenantAuth);

router.get('/', ticketsController.getTickets);
router.get('/:id', ticketsController.getTicketById);
router.post('/', ticketsController.createTicket);
router.patch('/:id', ticketsController.updateTicket);
router.delete('/:id', ticketsController.deleteTicket);

// Ticket messages routes
router.get('/:ticketId/messages', ticketMessagesController.getTicketMessages);
router.post('/:ticketId/messages', ticketMessagesController.createTicketMessage);

export default router;


