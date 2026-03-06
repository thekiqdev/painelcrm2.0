import { Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { assertModulePermission, ModulePermissionError } from '../permissions/index.js';
import { z } from 'zod';

const contractSchema = z.object({
  title: z.string().min(1),
  client_id: z.string().uuid().optional().nullable(),
  responsible_id: z.string().uuid().optional().nullable(),
  status: z.enum(['DRAFT', 'PENDING_SIGNATURE', 'PARTIALLY_SIGNED', 'ACTIVE', 'INACTIVE', 'EXPIRED', 'CANCELLED']).optional(),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  content: z.string().optional().nullable(),
  content_html: z.string().optional().nullable(),
  template_id: z.string().uuid().optional().nullable(),
  variables: z.any().optional(),
  auto_renew: z.boolean().optional(),
  renewal_period: z.number().int().optional().nullable(),
  total_value: z.number().optional().nullable(),
  currency: z.string().optional(),
  linked_proposal_id: z.string().uuid().optional().nullable(),
  linked_invoice_id: z.string().uuid().optional().nullable(),
  signature_settings: z.any().optional(),
});

// Get contracts with filters
export async function getContracts(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.json([]);
      return;
    }
    const { status, clientId, responsibleId, startDate, endDate, search, sortField, sortDirection } = req.query;

    let query = `SELECT c.* FROM contracts c
       INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $1
       WHERE 1=1`;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (status && status !== 'all') {
      query += ` AND c.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (clientId) {
      query += ` AND c.client_id = $${paramIndex}`;
      params.push(clientId);
      paramIndex++;
    }

    if (responsibleId) {
      query += ` AND c.responsible_id = $${paramIndex}`;
      params.push(responsibleId);
      paramIndex++;
    }

    if (startDate) {
      query += ` AND c.start_date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND c.end_date <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    if (search) {
      query += ` AND (c.title ILIKE $${paramIndex} OR c.contract_number ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Sorting
    const validSortFields = ['updated_at', 'title', 'contract_number', 'created_at', 'start_date', 'end_date'];
    const sortFieldValue = validSortFields.includes(sortField as string) ? sortField : 'updated_at';
    const sortDirectionValue = sortDirection === 'asc' ? 'ASC' : 'DESC';
    query += ` ORDER BY c.${sortFieldValue} ${sortDirectionValue}`;

    const result = await pool.query(query, params);
    
    // Convert DECIMAL to number and parse JSON fields
    const contracts = result.rows.map(contract => ({
      ...contract,
      total_value: contract.total_value ? parseFloat(contract.total_value) : null,
      tags: Array.isArray(contract.tags) ? contract.tags : (contract.tags ? JSON.parse(contract.tags) : []),
      variables: typeof contract.variables === 'object' && contract.variables !== null 
        ? contract.variables 
        : (contract.variables ? JSON.parse(contract.variables) : {}),
      signature_settings: typeof contract.signature_settings === 'object' && contract.signature_settings !== null
        ? contract.signature_settings
        : (contract.signature_settings ? JSON.parse(contract.signature_settings) : {}),
    }));

    res.json(contracts);
  } catch (error) {
    console.error('Error fetching contracts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Get contract by ID
export async function getContractById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT c.* FROM contracts c
       INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE c.id = $1`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Contract not found' });
      return;
    }

    const contract = result.rows[0];
    
    // Convert DECIMAL to number and parse JSON fields
    const formattedContract = {
      ...contract,
      total_value: contract.total_value ? parseFloat(contract.total_value) : null,
      tags: Array.isArray(contract.tags) ? contract.tags : (contract.tags ? JSON.parse(contract.tags) : []),
      variables: typeof contract.variables === 'object' && contract.variables !== null 
        ? contract.variables 
        : (contract.variables ? JSON.parse(contract.variables) : {}),
      signature_settings: typeof contract.signature_settings === 'object' && contract.signature_settings !== null
        ? contract.signature_settings
        : (contract.signature_settings ? JSON.parse(contract.signature_settings) : {}),
    };

    res.json(formattedContract);
  } catch (error) {
    console.error('Error fetching contract:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Create contract
export async function createContract(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const contractData = contractSchema.parse(req.body);

    await assertModulePermission(userId, 'contracts', 'create', undefined, req);

    // Generate contract number
    const contractNumber = `CONTRACT-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    const result = await pool.query(
      `INSERT INTO contracts (
        user_id, contract_number, title, client_id, responsible_id, status,
        start_date, end_date, tags, content, content_html, template_id,
        variables, auto_renew, renewal_period, total_value, currency,
        linked_proposal_id, linked_invoice_id, signature_settings
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *`,
      [
        userId, contractNumber, contractData.title, contractData.client_id || null,
        contractData.responsible_id || null, contractData.status || 'DRAFT',
        contractData.start_date || null, contractData.end_date || null,
        contractData.tags ? JSON.stringify(contractData.tags) : '[]',
        contractData.content || null, contractData.content_html || null,
        contractData.template_id || null,
        contractData.variables ? JSON.stringify(contractData.variables) : '{}',
        contractData.auto_renew || false, contractData.renewal_period || null,
        contractData.total_value || null, contractData.currency || 'BRL',
        contractData.linked_proposal_id || null, contractData.linked_invoice_id || null,
        contractData.signature_settings ? JSON.stringify(contractData.signature_settings) : '{}'
      ]
    );

    const contract = result.rows[0];
    
    // Format response
    const formattedContract = {
      ...contract,
      total_value: contract.total_value ? parseFloat(contract.total_value) : null,
      tags: Array.isArray(contract.tags) ? contract.tags : JSON.parse(contract.tags || '[]'),
      variables: typeof contract.variables === 'object' ? contract.variables : JSON.parse(contract.variables || '{}'),
      signature_settings: typeof contract.signature_settings === 'object' 
        ? contract.signature_settings 
        : JSON.parse(contract.signature_settings || '{}'),
    };

    res.status(201).json(formattedContract);
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error creating contract:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Update contract
export async function updateContract(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const contractData = contractSchema.partial().parse(req.body);

    const existing = await pool.query<{ user_id: string; responsible_id: string | null }>(
      `SELECT user_id, responsible_id FROM contracts c
       INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE c.id = $1`,
      [id, userId]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Contract not found' });
      return;
    }
    const row = existing.rows[0];
    await assertModulePermission(userId, 'contracts', 'edit', {
      ownerId: row.user_id,
      assigneeId: row.responsible_id,
    }, req);

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(contractData).forEach(([key, value]) => {
      if (value !== undefined) {
        if (key === 'tags' || key === 'variables' || key === 'signature_settings') {
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
      `UPDATE contracts 
       SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${paramIndex} AND user_id IN (SELECT id FROM users WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = $${paramIndex + 1}))
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Contract not found' });
      return;
    }

    const contract = result.rows[0];
    
    // Format response
    const formattedContract = {
      ...contract,
      total_value: contract.total_value ? parseFloat(contract.total_value) : null,
      tags: Array.isArray(contract.tags) ? contract.tags : JSON.parse(contract.tags || '[]'),
      variables: typeof contract.variables === 'object' ? contract.variables : JSON.parse(contract.variables || '{}'),
      signature_settings: typeof contract.signature_settings === 'object' 
        ? contract.signature_settings 
        : JSON.parse(contract.signature_settings || '{}'),
    };

    res.json(formattedContract);
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error updating contract:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Delete contract
export async function deleteContract(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const existing = await pool.query<{ user_id: string; responsible_id: string | null }>(
      `SELECT user_id, responsible_id FROM contracts c
       INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE c.id = $1`,
      [id, userId]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Contract not found' });
      return;
    }
    const row = existing.rows[0];
    await assertModulePermission(userId, 'contracts', 'delete', {
      ownerId: row.user_id,
      assigneeId: row.responsible_id,
    }, req);

    const result = await pool.query(
      `DELETE FROM contracts WHERE id = $1 AND user_id IN (SELECT id FROM users WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = $2)) RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Contract not found' });
      return;
    }

    res.json({ message: 'Contract deleted successfully' });
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Error deleting contract:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

