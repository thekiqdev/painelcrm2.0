import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';

const messageSchema = z.object({
  content: z.string().min(1),
  visibility: z.enum(['public', 'internal', 'private']).optional(),
  attachments: z.array(z.any()).optional(),
  mentions: z.array(z.string()).optional(),
});

// Get ticket messages
export async function getTicketMessages(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { ticketId } = req.params;

    // Verify ticket belongs to user
    const ticketResult = await pool.query(
      'SELECT id FROM tickets WHERE id = $1 AND user_id = $2',
      [ticketId, userId]
    );

    if (ticketResult.rows.length === 0) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    const result = await pool.query(
      `SELECT tm.*, 
              json_build_object('id', u.id, 'email', u.email) as user
       FROM ticket_messages tm
       LEFT JOIN users u ON tm.user_id = u.id
       WHERE tm.ticket_id = $1
       ORDER BY tm.created_at ASC`,
      [ticketId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching ticket messages:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Create ticket message
export async function createTicketMessage(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { ticketId } = req.params;
    const messageData = messageSchema.parse(req.body);

    // Verify ticket belongs to user
    const ticketResult = await pool.query(
      'SELECT id FROM tickets WHERE id = $1 AND user_id = $2',
      [ticketId, userId]
    );

    if (ticketResult.rows.length === 0) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO ticket_messages (
        ticket_id, user_id, content, visibility, attachments, mentions
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        ticketId, userId, messageData.content,
        messageData.visibility || 'public',
        messageData.attachments ? JSON.stringify(messageData.attachments) : '[]',
        messageData.mentions ? JSON.stringify(messageData.mentions) : '[]'
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error creating ticket message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}


