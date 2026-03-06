import { Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';
import { assertModulePermission, ModulePermissionError } from '../permissions/index.js';

const MODULE_LEADS = 'leads';

const leadSchema = z.object({
  name: z.string().min(1),
  email: z.union([z.string().email(), z.literal(""), z.null()]).optional(),
  phone: z.union([z.string(), z.literal(""), z.null()]).optional(),
  company: z.union([z.string(), z.literal(""), z.null()]).optional(),
  source: z.union([z.string().min(1), z.literal("")]).optional(),
  status: z.union([z.string(), z.literal(""), z.null()]).optional(),
  notes: z.union([z.string(), z.literal(""), z.null()]).optional(),
  profile_id: z.string().uuid().optional().nullable(),
});

export async function getLeads(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.json([]);
      return;
    }
    const { profileId } = req.query;

    let query = `
      SELECT l.* FROM leads l
      INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = $1
      WHERE 1=1
    `;
    const params: any[] = [tenantId];

    if (profileId) {
      query += ' AND l.profile_id = $2';
      params.push(profileId);
    }

    query += ' ORDER BY l.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getLeadById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT l.* FROM leads l
       INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE l.id = $1`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching lead:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createLead(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    await assertModulePermission(userId, MODULE_LEADS, 'create', undefined, req);
    const leadData = leadSchema.parse(req.body);

    // Clean up the data - convert empty strings to null for optional fields
    const cleanData: any = {
      name: leadData.name,
    };
    
    // Validate and clean email
    if (leadData.email && typeof leadData.email === 'string' && leadData.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(leadData.email.trim())) {
        res.status(400).json({ error: 'Invalid email format' });
        return;
      }
      cleanData.email = leadData.email.trim();
    } else {
      cleanData.email = null;
    }
    
    // Clean phone
    if (leadData.phone && typeof leadData.phone === 'string' && leadData.phone.trim()) {
      cleanData.phone = leadData.phone.trim();
    } else {
      cleanData.phone = null;
    }
    
    // Clean company
    if (leadData.company && typeof leadData.company === 'string' && leadData.company.trim()) {
      cleanData.company = leadData.company.trim();
    } else {
      cleanData.company = null;
    }
    
    // Source is required, but we'll use a default if empty
    if (leadData.source && typeof leadData.source === 'string' && leadData.source.trim()) {
      cleanData.source = leadData.source.trim();
    } else {
      cleanData.source = 'Outros'; // Default source
    }
    
    // Clean status
    if (leadData.status && typeof leadData.status === 'string' && leadData.status.trim()) {
      cleanData.status = leadData.status.trim();
    } else {
      cleanData.status = null;
    }
    
    // Clean notes
    if (leadData.notes && typeof leadData.notes === 'string' && leadData.notes.trim()) {
      cleanData.notes = leadData.notes.trim();
    } else {
      cleanData.notes = null;
    }
    
    // Clean profile_id
    if (leadData.profile_id && typeof leadData.profile_id === 'string' && leadData.profile_id.trim()) {
      cleanData.profile_id = leadData.profile_id.trim();
    } else {
      cleanData.profile_id = null;
    }

    const result = await pool.query(
      `INSERT INTO leads (
        user_id, name, email, phone, company, source, status, notes, profile_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        userId, cleanData.name, cleanData.email, cleanData.phone,
        cleanData.company, cleanData.source, cleanData.status,
        cleanData.notes, cleanData.profile_id
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error creating lead:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateLead(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const existing = await pool.query(
      `SELECT l.user_id FROM leads l
       INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE l.id = $1`,
      [id, userId]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }
    await assertModulePermission(userId, MODULE_LEADS, 'edit', {
      ownerId: existing.rows[0].user_id,
    }, req);
    const leadData = leadSchema.partial().parse(req.body);

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(leadData).forEach(([key, value]) => {
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

    values.push(id);
    const result = await pool.query(
      `UPDATE leads 
       SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${paramIndex} AND user_id IN (SELECT id FROM users WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = $${paramIndex + 1}))
       RETURNING *`,
      [...values, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error updating lead:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteLead(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const existing = await pool.query(
      `SELECT l.user_id FROM leads l
       INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE l.id = $1`,
      [id, userId]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }
    await assertModulePermission(userId, MODULE_LEADS, 'delete', {
      ownerId: existing.rows[0].user_id,
    }, req);
    const result = await pool.query(
      `DELETE FROM leads WHERE id = $1 AND user_id IN (SELECT id FROM users WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = $2)) RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }

    res.json({ message: 'Lead deleted successfully' });
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Error deleting lead:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

