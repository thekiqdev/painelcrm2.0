import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { z } from 'zod';

const proposalItemSchema = z.object({
  id: z.number().optional(),
  description: z.string(),
  quantity: z.number().min(0),
  unitPrice: z.number().min(0),
  total: z.number().min(0),
});

const proposalSchema = z.object({
  client_id: z.string().uuid().optional().nullable(),
  funnel_id: z.string().uuid().optional().nullable(),
  stage_id: z.string().uuid().optional().nullable(),
  title: z.string().min(1, 'Título é obrigatório'),
  description: z.string().optional().nullable(),
  amount: z.number().min(0, 'Valor deve ser positivo'),
  status: z.enum(['draft', 'sent', 'accepted', 'rejected', 'expired']).default('draft'),
  sent_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida').optional().nullable(),
  valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida').optional().nullable(),
  items: z.array(proposalItemSchema).default([]),
});

// GET /api/proposals
export const getProposals = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const { status, client_id, funnel_id, stage_id } = req.query;

    let query = `
      SELECT id, client_id, funnel_id, stage_id, title, description, amount,
             status, sent_date, valid_until, items, created_at, updated_at
      FROM proposals
      WHERE user_id = $1
    `;
    const params: any[] = [userId];
    let paramCount = 1;

    if (status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      params.push(status);
    }

    if (client_id) {
      paramCount++;
      query += ` AND client_id = $${paramCount}`;
      params.push(client_id);
    }

    if (funnel_id) {
      paramCount++;
      query += ` AND funnel_id = $${paramCount}`;
      params.push(funnel_id);
    }

    if (stage_id) {
      paramCount++;
      query += ` AND stage_id = $${paramCount}`;
      params.push(stage_id);
    }

    query += ` ORDER BY created_at DESC`;

    const result = await pool.query(query, params);

    const proposals = result.rows.map(proposal => ({
      ...proposal,
      items: Array.isArray(proposal.items) ? proposal.items : [],
      amount: parseFloat(proposal.amount || '0'),
    }));

    res.json(proposals);
  } catch (error) {
    console.error('Error fetching proposals:', error);
    res.status(500).json({ error: 'Erro ao buscar propostas' });
  }
};

// GET /api/proposals/:id
export const getProposalById = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT id, client_id, funnel_id, stage_id, title, description, amount,
              status, sent_date, valid_until, items, created_at, updated_at
       FROM proposals
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Proposta não encontrada' });
    }

    const proposal = {
      ...result.rows[0],
      items: Array.isArray(result.rows[0].items) ? result.rows[0].items : [],
      amount: parseFloat(result.rows[0].amount || '0'),
    };

    res.json(proposal);
  } catch (error) {
    console.error('Error fetching proposal:', error);
    res.status(500).json({ error: 'Erro ao buscar proposta' });
  }
};

// POST /api/proposals
export const createProposal = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const validated = proposalSchema.parse(req.body);

    const result = await pool.query(
      `INSERT INTO proposals (
        user_id, client_id, funnel_id, stage_id, title, description, amount,
        status, sent_date, valid_until, items
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
      RETURNING id, client_id, funnel_id, stage_id, title, description, amount,
                status, sent_date, valid_until, items, created_at, updated_at`,
      [
        userId,
        validated.client_id || null,
        validated.funnel_id || null,
        validated.stage_id || null,
        validated.title,
        validated.description || null,
        validated.amount,
        validated.status,
        validated.sent_date || null,
        validated.valid_until || null,
        JSON.stringify(validated.items || []),
      ]
    );

    const proposal = {
      ...result.rows[0],
      items: Array.isArray(result.rows[0].items) ? result.rows[0].items : [],
      amount: parseFloat(result.rows[0].amount || '0'),
    };

    res.status(201).json(proposal);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating proposal:', error);
    res.status(500).json({ error: 'Erro ao criar proposta' });
  }
};

// PATCH /api/proposals/:id
export const updateProposal = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const validated = proposalSchema.partial().parse(req.body);

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (validated.client_id !== undefined) {
      updates.push(`client_id = $${paramCount++}`);
      values.push(validated.client_id || null);
    }
    if (validated.funnel_id !== undefined) {
      updates.push(`funnel_id = $${paramCount++}`);
      values.push(validated.funnel_id || null);
    }
    if (validated.stage_id !== undefined) {
      updates.push(`stage_id = $${paramCount++}`);
      values.push(validated.stage_id || null);
    }
    if (validated.title !== undefined) {
      updates.push(`title = $${paramCount++}`);
      values.push(validated.title);
    }
    if (validated.description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(validated.description || null);
    }
    if (validated.amount !== undefined) {
      updates.push(`amount = $${paramCount++}`);
      values.push(validated.amount);
    }
    if (validated.status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(validated.status);
    }
    if (validated.sent_date !== undefined) {
      updates.push(`sent_date = $${paramCount++}`);
      values.push(validated.sent_date || null);
    }
    if (validated.valid_until !== undefined) {
      updates.push(`valid_until = $${paramCount++}`);
      values.push(validated.valid_until || null);
    }
    if (validated.items !== undefined) {
      updates.push(`items = $${paramCount++}::jsonb`);
      values.push(JSON.stringify(validated.items));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    values.push(id, userId);
    const result = await pool.query(
      `UPDATE proposals
       SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
       RETURNING id, client_id, funnel_id, stage_id, title, description, amount,
                 status, sent_date, valid_until, items, created_at, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Proposta não encontrada' });
    }

    const proposal = {
      ...result.rows[0],
      items: Array.isArray(result.rows[0].items) ? result.rows[0].items : [],
      amount: parseFloat(result.rows[0].amount || '0'),
    };

    res.json(proposal);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error updating proposal:', error);
    res.status(500).json({ error: 'Erro ao atualizar proposta' });
  }
};

// DELETE /api/proposals/:id
export const deleteProposal = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM proposals
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Proposta não encontrada' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting proposal:', error);
    res.status(500).json({ error: 'Erro ao deletar proposta' });
  }
};

