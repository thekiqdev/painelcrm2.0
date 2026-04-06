import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { z } from 'zod';

const invoiceItemSchema = z.object({
  id: z.number().optional(),
  description: z.string(),
  quantity: z.number().min(0),
  unitPrice: z.number().min(0),
  total: z.number().min(0),
});

const invoiceSchema = z.object({
  client_id: z.string().uuid().optional().nullable(),
  project_id: z.string().uuid().optional().nullable(),
  invoice_number: z.string().min(1, 'Número da fatura é obrigatório'),
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
  status: z.enum(['draft', 'pending', 'paid', 'overdue']).default('draft'),
  items: z.array(invoiceItemSchema).default([]),
  total: z.number().min(0),
  notes: z.string().optional().nullable(),
});

// GET /api/invoices
export const getInvoices = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId as string | null | undefined;
    if (!tenantId) {
      return res.json([]);
    }

    const { status, client_id, project_id } = req.query;

    let query = `
      SELECT i.id, i.client_id, i.project_id, i.invoice_number, i.issue_date, i.due_date,
             i.status, i.items, i.total, i.notes, i.created_at, i.updated_at
      FROM invoices i
      INNER JOIN users u ON u.id = i.user_id AND u.tenant_id = $1
      WHERE 1=1
    `;
    const params: any[] = [tenantId];
    let paramCount = 2;

    if (status) {
      query += ` AND i.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    if (client_id) {
      query += ` AND i.client_id = $${paramCount}`;
      params.push(client_id);
      paramCount++;
    }

    if (project_id) {
      query += ` AND i.project_id = $${paramCount}`;
      params.push(project_id);
      paramCount++;
    }

    query += ` ORDER BY i.issue_date DESC, i.created_at DESC`;

    const result = await pool.query(query, params);

    const invoices = result.rows.map(invoice => ({
      ...invoice,
      items: Array.isArray(invoice.items) ? invoice.items : [],
      total: parseFloat(invoice.total || '0'),
    }));

    res.json(invoices);
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ error: 'Erro ao buscar faturas' });
  }
};

// GET /api/invoices/:id
export const getInvoiceById = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT i.id, i.client_id, i.project_id, i.invoice_number, i.issue_date, i.due_date,
              i.status, i.items, i.total, i.notes, i.created_at, i.updated_at
       FROM invoices i
       INNER JOIN users u ON u.id = i.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE i.id = $1`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Fatura não encontrada' });
    }

    const invoice = {
      ...result.rows[0],
      items: Array.isArray(result.rows[0].items) ? result.rows[0].items : [],
      total: parseFloat(result.rows[0].total || '0'),
    };

    res.json(invoice);
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({ error: 'Erro ao buscar fatura' });
  }
};

// POST /api/invoices
export const createInvoice = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const validated = invoiceSchema.parse(req.body);

    const result = await pool.query(
      `INSERT INTO invoices (
        user_id, client_id, project_id, invoice_number, issue_date, due_date,
        status, items, total, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
      RETURNING id, client_id, project_id, invoice_number, issue_date, due_date,
                status, items, total, notes, created_at, updated_at`,
      [
        userId,
        validated.client_id || null,
        validated.project_id || null,
        validated.invoice_number,
        validated.issue_date,
        validated.due_date,
        validated.status,
        JSON.stringify(validated.items || []),
        validated.total,
        validated.notes || null,
      ]
    );

    const invoice = {
      ...result.rows[0],
      items: Array.isArray(result.rows[0].items) ? result.rows[0].items : [],
      total: parseFloat(result.rows[0].total || '0'),
    };

    res.status(201).json(invoice);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating invoice:', error);
    res.status(500).json({ error: 'Erro ao criar fatura' });
  }
};

// PATCH /api/invoices/:id
export const updateInvoice = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const validated = invoiceSchema.partial().parse(req.body);

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (validated.client_id !== undefined) {
      updates.push(`client_id = $${paramCount++}`);
      values.push(validated.client_id || null);
    }
    if (validated.project_id !== undefined) {
      updates.push(`project_id = $${paramCount++}`);
      values.push(validated.project_id || null);
    }
    if (validated.invoice_number !== undefined) {
      updates.push(`invoice_number = $${paramCount++}`);
      values.push(validated.invoice_number);
    }
    if (validated.issue_date !== undefined) {
      updates.push(`issue_date = $${paramCount++}`);
      values.push(validated.issue_date);
    }
    if (validated.due_date !== undefined) {
      updates.push(`due_date = $${paramCount++}`);
      values.push(validated.due_date);
    }
    if (validated.status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(validated.status);
    }
    if (validated.items !== undefined) {
      updates.push(`items = $${paramCount++}::jsonb`);
      values.push(JSON.stringify(validated.items));
    }
    if (validated.total !== undefined) {
      updates.push(`total = $${paramCount++}`);
      values.push(validated.total);
    }
    if (validated.notes !== undefined) {
      updates.push(`notes = $${paramCount++}`);
      values.push(validated.notes || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    values.push(id, userId);
    const result = await pool.query(
      `UPDATE invoices
       SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${paramCount} AND user_id IN (SELECT id FROM users WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = $${paramCount + 1}))
       RETURNING id, client_id, project_id, invoice_number, issue_date, due_date,
                 status, items, total, notes, created_at, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Fatura não encontrada' });
    }

    const invoice = {
      ...result.rows[0],
      items: Array.isArray(result.rows[0].items) ? result.rows[0].items : [],
      total: parseFloat(result.rows[0].total || '0'),
    };

    res.json(invoice);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error updating invoice:', error);
    res.status(500).json({ error: 'Erro ao atualizar fatura' });
  }
};

// DELETE /api/invoices/:id
export const deleteInvoice = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM invoices
       WHERE id = $1 AND user_id IN (SELECT id FROM users WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = $2))
       RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Fatura não encontrada' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting invoice:', error);
    res.status(500).json({ error: 'Erro ao deletar fatura' });
  }
};

