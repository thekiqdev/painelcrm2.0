import { Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { assertModulePermission, ModulePermissionError } from '../permissions/index.js';
import { findContractInTenant } from '../utils/contractAccess.js';
import { z } from 'zod';

const eventSchema = z.object({
  event_type: z.string().min(1),
  description: z.string().min(1),
  metadata: z.any().optional(),
});

// Get contract events
export async function getContractEvents(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { contractId } = req.params;

    const contract = await findContractInTenant(contractId, userId);
    if (!contract) {
      res.status(404).json({ error: 'Contract not found' });
      return;
    }
    await assertModulePermission(
      userId,
      'contracts',
      'view',
      { ownerId: contract.user_id, assigneeId: contract.responsible_id },
      req
    );

    const result = await pool.query(
      `SELECT ce.*,
              json_build_object('id', u.id, 'email', u.email) as created_by_user
       FROM contract_events ce
       LEFT JOIN users u ON ce.created_by = u.id
       WHERE ce.contract_id = $1
       ORDER BY ce.created_at DESC`,
      [contractId]
    );

    const events = result.rows.map((event) => ({
      ...event,
      metadata:
        typeof event.metadata === 'object' && event.metadata !== null
          ? event.metadata
          : event.metadata
            ? JSON.parse(event.metadata)
            : {},
    }));

    res.json(events);
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Error fetching contract events:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Create contract event
export async function createContractEvent(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { contractId } = req.params;
    const eventData = eventSchema.parse(req.body);

    const contract = await findContractInTenant(contractId, userId);
    if (!contract) {
      res.status(404).json({ error: 'Contract not found' });
      return;
    }
    await assertModulePermission(
      userId,
      'contracts',
      'edit',
      { ownerId: contract.user_id, assigneeId: contract.responsible_id },
      req
    );

    const result = await pool.query(
      `INSERT INTO contract_events (
        contract_id, event_type, description, metadata, created_by
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [
        contractId,
        eventData.event_type,
        eventData.description,
        eventData.metadata ? JSON.stringify(eventData.metadata) : '{}',
        userId,
      ]
    );

    const event = result.rows[0];

    const formattedEvent = {
      ...event,
      metadata: typeof event.metadata === 'object' ? event.metadata : JSON.parse(event.metadata || '{}'),
    };

    res.status(201).json(formattedEvent);
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error creating contract event:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
