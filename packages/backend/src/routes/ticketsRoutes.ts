import { Router } from 'express';
import * as ticketsController from '../controllers/ticketsController.js';
import * as ticketMessagesController from '../controllers/ticketMessagesController.js';
import { tenantAuthCrm } from '../middleware/auth.js';

const router = Router();
router.use(...tenantAuthCrm);

router.get('/kanban-stats', ticketsController.getTicketKanbanStats);
router.post('/bulk', ticketsController.bulkUpdateTickets);
router.get('/', ticketsController.getTickets);
router.get('/:id', ticketsController.getTicketById);
router.get('/:id/activities', ticketsController.getTicketActivities);
router.post('/', ticketsController.createTicket);
router.patch('/:id', ticketsController.updateTicket);
router.delete('/:id', ticketsController.deleteTicket);

// Ticket messages routes
router.get('/:ticketId/messages', ticketMessagesController.getTicketMessages);
router.post('/:ticketId/messages', ticketMessagesController.createTicketMessage);

export default router;


