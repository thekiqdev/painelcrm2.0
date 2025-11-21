import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';

const clientSchema = z.object({
  name: z.string().min(1),
  email: z.any().optional().nullable(),
  phone: z.any().optional().nullable(),
  company: z.any().optional().nullable(),
  status: z.any().optional().nullable(),
  source: z.any().optional().nullable(),
  funnel_stage: z.any().optional().nullable(),
  notes: z.any().optional().nullable(),
  group_id: z.any().optional().nullable(),
  profile_id: z.any().optional().nullable(),
});

export async function getClients(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { profileId } = req.query;

    let query = `
      SELECT 
        c.*,
        cg.id as group_table_id,
        cg.name as group_table_name
      FROM clients c
      LEFT JOIN client_groups cg ON c.group_id = cg.id
      WHERE c.user_id = $1
    `;
    const params: any[] = [userId];

    if (profileId) {
      query += ' AND c.profile_id = $2';
      params.push(profileId);
    }

    query += ' ORDER BY c.name';

    const result = await pool.query(query, params);
    
    // Format the response to match frontend expectations
    const formattedClients = result.rows.map((row: any) => {
      const client: any = { ...row };
      // Remove the temporary group fields
      delete client.group_table_id;
      delete client.group_table_name;
      
      // Add client_groups object if group exists
      if (row.group_table_id && row.group_table_name) {
        client.client_groups = {
          id: row.group_table_id,
          name: row.group_table_name
        };
      } else {
        client.client_groups = null;
      }
      
      return client;
    });

    res.json(formattedClients);
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getClientById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM clients WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching client:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createClient(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const clientData = clientSchema.parse(req.body);

    // Convert empty strings to null for optional fields
    const cleanData: any = {
      name: clientData.name,
    };
    
    // Only include fields that have values
    if (clientData.email && typeof clientData.email === 'string' && clientData.email.trim()) {
      // Validate email format if provided
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(clientData.email.trim())) {
        res.status(400).json({ error: 'Invalid email format' });
        return;
      }
      cleanData.email = clientData.email.trim();
    } else {
      cleanData.email = null;
    }
    
    if (clientData.phone && typeof clientData.phone === 'string' && clientData.phone.trim()) {
      cleanData.phone = clientData.phone.trim();
    } else {
      cleanData.phone = null;
    }
    
    if (clientData.company && typeof clientData.company === 'string' && clientData.company.trim()) {
      cleanData.company = clientData.company.trim();
    } else {
      cleanData.company = null;
    }
    
    if (clientData.status && typeof clientData.status === 'string' && clientData.status.trim()) {
      cleanData.status = clientData.status.trim();
    } else {
      cleanData.status = null;
    }
    
    if (clientData.source && typeof clientData.source === 'string' && clientData.source.trim()) {
      cleanData.source = clientData.source.trim();
    } else {
      cleanData.source = null;
    }
    
    if (clientData.funnel_stage && typeof clientData.funnel_stage === 'string' && clientData.funnel_stage.trim()) {
      cleanData.funnel_stage = clientData.funnel_stage.trim();
    } else {
      cleanData.funnel_stage = null;
    }
    
    if (clientData.notes && typeof clientData.notes === 'string' && clientData.notes.trim()) {
      cleanData.notes = clientData.notes.trim();
    } else {
      cleanData.notes = null;
    }
    
    if (clientData.group_id && typeof clientData.group_id === 'string' && clientData.group_id.trim()) {
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(clientData.group_id.trim())) {
        res.status(400).json({ error: 'Invalid group_id format' });
        return;
      }
      cleanData.group_id = clientData.group_id.trim();
    } else {
      cleanData.group_id = null;
    }
    
    if (clientData.profile_id && typeof clientData.profile_id === 'string' && clientData.profile_id.trim()) {
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(clientData.profile_id.trim())) {
        res.status(400).json({ error: 'Invalid profile_id format' });
        return;
      }
      cleanData.profile_id = clientData.profile_id.trim();
    } else {
      cleanData.profile_id = null;
    }

    const result = await pool.query(
      `INSERT INTO clients (
        user_id, name, email, phone, company, status, source,
        funnel_stage, notes, group_id, profile_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        userId, cleanData.name, cleanData.email, cleanData.phone,
        cleanData.company, cleanData.status, cleanData.source,
        cleanData.funnel_stage, cleanData.notes, cleanData.group_id,
        cleanData.profile_id
      ]
    );

    // Get group information if group_id exists
    let client = result.rows[0];
    if (client.group_id) {
      const groupResult = await pool.query(
        'SELECT id, name FROM client_groups WHERE id = $1',
        [client.group_id]
      );
      if (groupResult.rows.length > 0) {
        client.client_groups = {
          id: groupResult.rows[0].id,
          name: groupResult.rows[0].name
        };
      }
    } else {
      client.client_groups = null;
    }

    res.status(201).json(client);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error creating client:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateClient(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const clientData = clientSchema.partial().parse(req.body);

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(clientData).forEach(([key, value]) => {
      if (value !== undefined) {
        updates.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    });

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    values.push(id, userId);
    const result = await pool.query(
      `UPDATE clients 
       SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error updating client:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteClient(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM clients WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    res.json({ message: 'Client deleted successfully' });
  } catch (error) {
    console.error('Error deleting client:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

