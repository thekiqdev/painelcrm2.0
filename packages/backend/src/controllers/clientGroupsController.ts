import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';

const clientGroupSchema = z.object({
  name: z.string().min(1),
});

export async function getClientGroups(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;

    const result = await pool.query(
      'SELECT * FROM client_groups WHERE user_id = $1 ORDER BY name',
      [userId]
    );

    // Get client count for each group
    const groupsWithCounts = await Promise.all(
      result.rows.map(async (group) => {
        const countResult = await pool.query(
          'SELECT COUNT(*) as count FROM clients WHERE group_id = $1',
          [group.id]
        );
        return {
          ...group,
          clientCount: parseInt(countResult.rows[0].count) || 0,
        };
      })
    );

    res.json(groupsWithCounts);
  } catch (error) {
    console.error('Error fetching client groups:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getClientGroupById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM client_groups WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Client group not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching client group:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createClientGroup(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const groupData = clientGroupSchema.parse(req.body);

    const result = await pool.query(
      'INSERT INTO client_groups (user_id, name) VALUES ($1, $2) RETURNING *',
      [userId, groupData.name]
    );

    // Get client count (will be 0 for new group)
    const group = {
      ...result.rows[0],
      clientCount: 0,
    };

    res.status(201).json(group);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error creating client group:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateClientGroup(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const groupData = clientGroupSchema.partial().parse(req.body);

    if (!groupData.name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    const result = await pool.query(
      'UPDATE client_groups SET name = $1, updated_at = now() WHERE id = $2 AND user_id = $3 RETURNING *',
      [groupData.name, id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Client group not found' });
      return;
    }

    // Get client count
    const countResult = await pool.query(
      'SELECT COUNT(*) as count FROM clients WHERE group_id = $1',
      [id]
    );
    const group = {
      ...result.rows[0],
      clientCount: parseInt(countResult.rows[0].count) || 0,
    };

    res.json(group);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error updating client group:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteClientGroup(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    // Check if group has clients
    const clientsResult = await pool.query(
      'SELECT COUNT(*) as count FROM clients WHERE group_id = $1',
      [id]
    );

    if (parseInt(clientsResult.rows[0].count) > 0) {
      res.status(400).json({ error: 'Cannot delete group with clients. Remove clients first.' });
      return;
    }

    const result = await pool.query(
      'DELETE FROM client_groups WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Client group not found' });
      return;
    }

    res.json({ message: 'Client group deleted successfully' });
  } catch (error) {
    console.error('Error deleting client group:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}


