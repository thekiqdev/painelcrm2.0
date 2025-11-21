import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';

const templateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  content_html: z.string().min(1),
  variables_schema: z.array(z.any()).optional(),
  is_active: z.boolean().optional(),
});

// Get contract templates
export async function getContractTemplates(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { activeOnly } = req.query;

    let query = 'SELECT * FROM contract_templates WHERE user_id = $1';
    const params: any[] = [userId];

    if (activeOnly === 'true') {
      query += ' AND is_active = true';
    }

    query += ' ORDER BY name';

    const result = await pool.query(query, params);
    
    // Parse JSON fields
    const templates = result.rows.map(template => ({
      ...template,
      variables_schema: Array.isArray(template.variables_schema)
        ? template.variables_schema
        : (template.variables_schema ? JSON.parse(template.variables_schema) : []),
    }));

    res.json(templates);
  } catch (error) {
    console.error('Error fetching contract templates:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Create contract template
export async function createContractTemplate(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const templateData = templateSchema.parse(req.body);

    const result = await pool.query(
      `INSERT INTO contract_templates (
        user_id, name, description, content_html, variables_schema, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        userId, templateData.name, templateData.description || null,
        templateData.content_html,
        templateData.variables_schema ? JSON.stringify(templateData.variables_schema) : '[]',
        templateData.is_active !== undefined ? templateData.is_active : true
      ]
    );

    const template = result.rows[0];
    
    // Format response
    const formattedTemplate = {
      ...template,
      variables_schema: Array.isArray(template.variables_schema)
        ? template.variables_schema
        : JSON.parse(template.variables_schema || '[]'),
    };

    res.status(201).json(formattedTemplate);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error creating contract template:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Update contract template
export async function updateContractTemplate(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const templateData = templateSchema.partial().parse(req.body);

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(templateData).forEach(([key, value]) => {
      if (value !== undefined) {
        if (key === 'variables_schema') {
          updates.push(`${key} = $${paramIndex}`);
          values.push(JSON.stringify(value));
        } else {
          updates.push(`${key} = $${paramIndex}`);
          values.push(value);
        }
        paramIndex++;
      }
    });

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    values.push(id, userId);
    const result = await pool.query(
      `UPDATE contract_templates 
       SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Contract template not found' });
      return;
    }

    const template = result.rows[0];
    
    // Format response
    const formattedTemplate = {
      ...template,
      variables_schema: Array.isArray(template.variables_schema)
        ? template.variables_schema
        : JSON.parse(template.variables_schema || '[]'),
    };

    res.json(formattedTemplate);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error updating contract template:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Delete contract template
export async function deleteContractTemplate(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    // Check if template is used by any contracts
    const contractsResult = await pool.query(
      'SELECT COUNT(*) FROM contracts WHERE template_id = $1 AND user_id = $2',
      [id, userId]
    );

    if (parseInt(contractsResult.rows[0].count, 10) > 0) {
      res.status(409).json({ error: 'Cannot delete template with associated contracts' });
      return;
    }

    const result = await pool.query(
      'DELETE FROM contract_templates WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Contract template not found' });
      return;
    }

    res.json({ message: 'Contract template deleted successfully' });
  } catch (error) {
    console.error('Error deleting contract template:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

